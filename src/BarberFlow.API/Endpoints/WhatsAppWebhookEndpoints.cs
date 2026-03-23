using BarberFlow.Application.Helpers;
using BarberFlow.Application.Services;
using BarberFlow.Infrastructure;
using BarberFlow.Infrastructure.AI;
using BarberFlow.Infrastructure.WhatsApp;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;
using OpenAI.Chat;
using Twilio.Security;
using BarberFlow.API;

namespace BarberFlow.API.Endpoints;

/// <summary>
/// Handles inbound WhatsApp messages from Twilio.
/// POST /webhook/whatsapp — validates Twilio signature, returns 200 immediately,
/// and dispatches background AI processing via IServiceScopeFactory.
/// </summary>
internal static class WhatsAppWebhookEndpoints
{
    internal static IEndpointRouteBuilder MapWhatsAppWebhookEndpoints(
        this IEndpointRouteBuilder app)
    {
        app.MapPost("/webhook/whatsapp", (
            HttpContext context,
            IServiceScopeFactory scopeFactory,
            IOptions<TwilioSettings> twilioOptions,
            WhatsAppPhoneRateLimiter phoneLimiter,
            ILoggerFactory loggerFactory) =>
                HandleWebhookRequestAsync(context, scopeFactory, twilioOptions, phoneLimiter, loggerFactory))
            .RequireRateLimiting("WhatsAppWebhook");

        return app;
    }

    // ─── Request handler ──────────────────────────────────────────────────────

    private static IResult HandleWebhookRequestAsync(
        HttpContext context,
        IServiceScopeFactory scopeFactory,
        IOptions<TwilioSettings> twilioOptions,
        WhatsAppPhoneRateLimiter phoneLimiter,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("WhatsAppWebhook");

        var (earlyExit, phone, body) =
            ValidateAndExtractMessage(context, twilioOptions.Value.AuthToken, phoneLimiter, logger);

        // earlyExit is set when there is no phone (malformed, invalid sig, rate-limited).
        // A non-null phone with a null body means a media message: still needs a background reply.
        if (earlyExit is not null && phone is null)
        {
            return earlyExit;
        }

        // Return 200 immediately. Twilio requires a sub-second response.
        // body == null  → media-only message; ProcessAndReplyAsync sends the polite notice.
        // body != null  → text message; ProcessAndReplyAsync runs the AI pipeline.
        ProcessAndReplyAsync(scopeFactory, loggerFactory, phone!, body);

        return Results.Ok();
    }

    /// <summary>
    /// Validates the Twilio signature, parses the form, normalises the phone number,
    /// applies the per-phone rate limit, and guards against media-only messages.
    /// Returns an early <see cref="IResult"/> when the pipeline should stop, otherwise
    /// returns <c>null</c> together with the normalised <paramref name="phone"/> and <paramref name="body"/>.
    /// </summary>
    private static (IResult? earlyExit, string? phone, string? body) ValidateAndExtractMessage(
        HttpContext context,
        string authToken,
        WhatsAppPhoneRateLimiter phoneLimiter,
        ILogger logger)
    {
        // 1. Validate Twilio signature — always required, never skipped.
        if (!ValidateSignature(context.Request, authToken, logger))
        {
            return (Results.Unauthorized(), null, null);
        }

        // 2. Parse form body (Twilio sends application/x-www-form-urlencoded).
        var form = context.Request.Form;
        var from = form["From"].ToString();
        var body = form["Body"].ToString();

        if (string.IsNullOrWhiteSpace(from))
        {
            return (Results.Ok(), null, null); // Malformed — ignore silently.
        }

        // 3. Normalize phone — strip "whatsapp:" prefix added by Twilio.
        var rawPhone = from.Replace("whatsapp:", "", StringComparison.OrdinalIgnoreCase).Trim();
        var phone = PhoneNormalizer.Normalize(rawPhone) ?? rawPhone;

        // 4. Per-phone rate limit: 10 messages per minute.
        if (!phoneLimiter.TryAcquire(phone))
        {
            return (Results.StatusCode(StatusCodes.Status429TooManyRequests), null, null);
        }

        // 5. Text-only Phase 2A: body is empty → media message; acknowledge and stop.
        if (string.IsNullOrEmpty(body))
        {
            return (Results.Ok(), phone, null); // Caller checks body == null to send media reply.
        }

        return (null, phone, body);
    }

    /// <summary>
    /// Fires a background <see cref="Task"/> that either sends a media-not-supported reply
    /// (when <paramref name="body"/> is <c>null</c>) or runs the full AI processing pipeline.
    /// The caller has already returned 200 to Twilio before this runs.
    /// </summary>
    private static void ProcessAndReplyAsync(
        IServiceScopeFactory scopeFactory,
        ILoggerFactory loggerFactory,
        string phone,
        string? body)
    {
        _ = Task.Run(async () =>
        {
            var bg = loggerFactory.CreateLogger("WhatsAppWebhook.Background");
            try
            {
                if (body is null)
                {
                    // Media message — send a polite text-only notice.
                    await using var scope = scopeFactory.CreateAsyncScope();
                    var whatsApp = scope.ServiceProvider.GetRequiredService<IWhatsAppService>();
                    await whatsApp.SendTextAsync(
                        phone,
                        "Por ahora solo puedo leer mensajes de texto. Enviame tu consulta por escrito.",
                        CancellationToken.None);
                }
                else
                {
                    await ProcessIncomingMessageAsync(scopeFactory, phone, body, loggerFactory);
                }
            }
            catch (Exception ex)
            {
                bg.LogError(ex, body is null
                    ? "Failed to send non-text reply."
                    : "Unhandled error in WhatsApp background processing.");
            }
        });
    }

    // ─── Background processing ────────────────────────────────────────────────

    private static async Task ProcessIncomingMessageAsync(
        IServiceScopeFactory scopeFactory,
        string phone,
        string messageText,
        ILoggerFactory loggerFactory)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var whatsApp = sp.GetRequiredService<IWhatsAppService>();

        var resolver = sp.GetRequiredService<BarbershopResolver>();
        var identity = await resolver.ResolveAsync(phone, CancellationToken.None);

        if (identity.BarbershopId is null)
        {
            await whatsApp.SendTextAsync(
                phone,
                "No encontramos tu barbería. Por favor registrate primero.",
                CancellationToken.None);
            return;
        }

        var reply = await RunAiTurnAsync(sp, identity.BarbershopId.Value, phone, messageText, loggerFactory);
        await whatsApp.SendTextAsync(phone, reply, CancellationToken.None);
    }

    private static async Task<string> RunAiTurnAsync(
        IServiceProvider sp,
        Guid barbershopId,
        string phone,
        string messageText,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("WhatsAppWebhook.Processing");
        var connString = sp.GetRequiredService<ConnectionStringAccessor>().Value;

        var barbershopName = await GetBarbershopFieldAsync(connString, barbershopId, "name", "La Barbería");
        var timezone = await GetBarbershopFieldAsync(connString, barbershopId, "COALESCE(timezone,'UTC')", "UTC");

        var conversationSvc = sp.GetRequiredService<ConversationService>();
        var record = await conversationSvc.LoadAsync(barbershopId, phone, CancellationToken.None);

        var history = record is not null && !ConversationService.ShouldReset(record.LastMessageAt)
            ? ConversationHistorySerializer.Deserialize(record.Messages)
            : new List<ChatMessage>();

        var context = record is not null && !ConversationService.ShouldReset(record.LastMessageAt)
            ? record.Context
            : new Dictionary<string, object>();

        string reply;
        try
        {
            var orchestrator = sp.GetRequiredService<AiBookingOrchestrator>();
            var result = await orchestrator.ProcessMessageAsync(
                barbershopId, barbershopName, phone, timezone,
                messageText, history, CancellationToken.None);
            reply = result.Reply;
            history = result.UpdatedHistory;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI orchestrator failed.");
            reply = "Lo siento, tuve un problema. Intentá de nuevo en un momento.";
        }

        var serialized = ConversationHistorySerializer.Serialize(history);
        await conversationSvc.SaveAsync(barbershopId, phone, serialized, context, CancellationToken.None);

        return reply;
    }

    // ─── Signature validation ─────────────────────────────────────────────────

    private static bool ValidateSignature(
        HttpRequest request, string authToken, ILogger logger)
    {
        // AuthToken MUST be configured — never skip validation.
        if (string.IsNullOrWhiteSpace(authToken))
        {
            logger.LogWarning("Twilio AuthToken not configured — rejecting webhook request.");
            return false;
        }

        if (!request.Headers.TryGetValue("X-Twilio-Signature", out var sigValues))
        {
            logger.LogWarning("Missing X-Twilio-Signature header.");
            return false;
        }

        var signature = sigValues.ToString();
        var requestUrl = $"{request.Scheme}://{request.Host}{request.Path}{request.QueryString}";
        var parameters = request.Form.ToDictionary(kv => kv.Key, kv => kv.Value.ToString());

        var validator = new RequestValidator(authToken);
        var isValid = validator.Validate(requestUrl, parameters, signature);

        if (!isValid)
        {
            logger.LogWarning("Twilio signature validation failed for URL: {Url}", requestUrl);
        }

        return isValid;
    }

    // ─── DB helpers ───────────────────────────────────────────────────────────

    private static async Task<string> GetBarbershopFieldAsync(
        string connString, Guid barbershopId, string column, string fallback)
    {
        await using var conn = new NpgsqlConnection(connString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            $"SELECT {column} FROM barbershops WHERE id = @id LIMIT 1", conn);
        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync();
        return result is string s && !string.IsNullOrWhiteSpace(s) ? s : fallback;
    }
}
