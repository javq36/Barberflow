using System.Net.Http.Headers;
using System.Text;
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
    /// <summary>Reset keywords that trigger manual conversation reset (lowercased).</summary>
    private static readonly HashSet<string> ResetKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        "reiniciar", "empezar de nuevo", "reset", "nueva consulta", "borrar", "limpiar"
    };

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
        var twilioSettings = twilioOptions.Value;

        var (earlyExit, phone, mediaInfo, body) =
            ValidateAndExtractMessage(context, twilioSettings.AuthToken, twilioSettings.UseSandbox, phoneLimiter, logger);

        // Hard early exit: malformed request, invalid signature (phone is null).
        if (earlyExit is not null && phone is null)
        {
            return earlyExit;
        }

        // Rate-limited: phone is known but we need to send a WhatsApp reply.
        // Return 200 to Twilio (not 429) to avoid Twilio retry loops.
        if (earlyExit is not null && phone is not null)
        {
            ProcessRateLimitReplyAsync(scopeFactory, loggerFactory, phone!);
            return Results.Ok();
        }

        // Return 200 immediately. Twilio requires a sub-second response.
        // mediaInfo != null → audio/media message; body != null → text message.
        ProcessAndReplyAsync(scopeFactory, loggerFactory, twilioSettings, phone!, mediaInfo, body);

        return Results.Ok();
    }

    /// <summary>
    /// Validates the Twilio signature, parses the form, normalises the phone number,
    /// applies the per-phone rate limit, and extracts media info or text body.
    /// Returns an early <see cref="IResult"/> when the pipeline should stop.
    /// </summary>
    private static (IResult? earlyExit, string? phone, MediaInfo? mediaInfo, string? body)
        ValidateAndExtractMessage(
            HttpContext context,
            string authToken,
            bool useSandbox,
            WhatsAppPhoneRateLimiter phoneLimiter,
            ILogger logger)
    {
        // 1. Validate Twilio signature — skipped in sandbox mode, enforced in production.
        if (!ValidateSignature(context.Request, authToken, useSandbox, logger))
        {
            return (Results.Unauthorized(), null, null, null);
        }

        // 2. Parse form body (Twilio sends application/x-www-form-urlencoded).
        var form = context.Request.Form;
        var phone = ExtractNormalizedPhone(form);
        if (phone is null)
        {
            return (Results.Ok(), null, null, null); // Malformed — ignore silently.
        }

        // 3. Per-phone rate limit: 10 messages per minute.
        if (!phoneLimiter.TryAcquire(phone))
        {
            // Return phone so the caller can send a WhatsApp rate-limit reply.
            return (Results.StatusCode(StatusCodes.Status429TooManyRequests), phone, null, null);
        }

        // 4. Check for media attachments.
        var mediaInfo = ExtractMediaInfo(form);
        if (mediaInfo is not null)
        {
            return (null, phone, mediaInfo, null);
        }

        // 5. Text-only message.
        var body = form["Body"].ToString();
        if (string.IsNullOrEmpty(body))
        {
            // No text and no media — ignore silently.
            return (Results.Ok(), phone, null, null);
        }

        return (null, phone, null, body);
    }

    /// <summary>
    /// Extracts and normalises the phone number from a Twilio form.
    /// Returns null if the From field is missing or empty.
    /// </summary>
    private static string? ExtractNormalizedPhone(IFormCollection form)
    {
        var from = form["From"].ToString();
        if (string.IsNullOrWhiteSpace(from))
        {
            return null;
        }

        var rawPhone = from.Replace("whatsapp:", "", StringComparison.OrdinalIgnoreCase).Trim();
        return PhoneNormalizer.Normalize(rawPhone) ?? rawPhone;
    }

    /// <summary>
    /// Returns a <see cref="MediaInfo"/> if the Twilio form contains media attachments,
    /// or null for text-only messages.
    /// </summary>
    private static MediaInfo? ExtractMediaInfo(IFormCollection form)
    {
        var numMediaStr = form["NumMedia"].ToString();
        if (int.TryParse(numMediaStr, out var numMedia) && numMedia > 0)
        {
            var contentType = form["MediaContentType0"].ToString();
            var mediaUrl = form["MediaUrl0"].ToString();
            return new MediaInfo(contentType, mediaUrl);
        }

        return null;
    }

    // ─── Background dispatch ──────────────────────────────────────────────────

    /// <summary>
    /// Fires a background <see cref="Task"/> that sends a rate-limit reply.
    /// </summary>
    private static void ProcessRateLimitReplyAsync(
        IServiceScopeFactory scopeFactory,
        ILoggerFactory loggerFactory,
        string phone)
    {
        _ = Task.Run(async () =>
        {
            var bg = loggerFactory.CreateLogger("WhatsAppWebhook.Background");
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var whatsApp = scope.ServiceProvider.GetRequiredService<IWhatsAppService>();
                await whatsApp.SendTextAsync(
                    phone,
                    "Demasiados mensajes, esperá un momento por favor",
                    CancellationToken.None);
            }
            catch (Exception ex)
            {
                bg.LogError(ex, "Failed to send rate-limit reply to {Phone}.", phone);
            }
        });
    }

    /// <summary>
    /// Fires a background <see cref="Task"/> that either handles media (audio/non-audio),
    /// or runs the full AI text processing pipeline.
    /// The caller has already returned 200 to Twilio before this runs.
    /// </summary>
    private static void ProcessAndReplyAsync(
        IServiceScopeFactory scopeFactory,
        ILoggerFactory loggerFactory,
        TwilioSettings twilioSettings,
        string phone,
        MediaInfo? mediaInfo,
        string? body)
    {
        _ = Task.Run(async () =>
        {
            var bg = loggerFactory.CreateLogger("WhatsAppWebhook.Background");
            try
            {
                if (mediaInfo is not null)
                {
                    await HandleMediaMessageAsync(
                        scopeFactory, loggerFactory, twilioSettings, phone, mediaInfo);
                }
                else if (body is not null)
                {
                    await HandleTextMessageAsync(scopeFactory, phone, body, loggerFactory);
                }
            }
            catch (Exception ex)
            {
                bg.LogError(ex, "Unhandled error in WhatsApp background processing for {Phone}.", phone);
            }
        });
    }

    // ─── Media handling ───────────────────────────────────────────────────────

    /// <summary>
    /// Routes media messages: audio → download + transcribe, non-audio → reject.
    /// </summary>
    private static async Task HandleMediaMessageAsync(
        IServiceScopeFactory scopeFactory,
        ILoggerFactory loggerFactory,
        TwilioSettings twilioSettings,
        string phone,
        MediaInfo mediaInfo)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var whatsApp = sp.GetRequiredService<IWhatsAppService>();
        var openAiSettings = sp.GetRequiredService<IOptions<OpenAiSettings>>().Value;
        var bg = loggerFactory.CreateLogger("WhatsAppWebhook.Background");

        if (!IsAudioMessage(mediaInfo))
        {
            await whatsApp.SendTextAsync(phone, "Solo puedo leer mensajes de texto y audio por ahora", CancellationToken.None);
            return;
        }

        if (!openAiSettings.WhisperEnabled)
        {
            await whatsApp.SendTextAsync(phone, "No puedo procesar audio en este momento", CancellationToken.None);
            return;
        }

        var audioResult = await DownloadAndTranscribeAsync(
            sp, twilioSettings, mediaInfo, openAiSettings.MaxAudioSizeBytes, phone, bg);

        await HandleAudioResultAsync(scopeFactory, loggerFactory, phone, whatsApp, audioResult);
    }

    /// <summary>Returns true when the media message contains an audio attachment.</summary>
    private static bool IsAudioMessage(MediaInfo mediaInfo)
        => mediaInfo.ContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Sends the appropriate reply based on the audio download/transcription result,
    /// or proceeds to AI processing when the transcription succeeded.
    /// </summary>
    private static async Task HandleAudioResultAsync(
        IServiceScopeFactory scopeFactory,
        ILoggerFactory loggerFactory,
        string phone,
        IWhatsAppService whatsApp,
        AudioResult audioResult)
    {
        switch (audioResult)
        {
            case AudioResult.TooLarge:
                await whatsApp.SendTextAsync(phone, "Audio muy largo, el máximo es 1 minuto", CancellationToken.None);
                return;

            case AudioResult.Failed:
                await whatsApp.SendTextAsync(phone, "No pude entender el audio, ¿podés escribirme?", CancellationToken.None);
                return;

            case AudioResult.Success success:
                // Transcription succeeded — process as if it were a text message.
                await ProcessIncomingMessageAsync(scopeFactory, phone, success.Transcript, loggerFactory);
                return;
        }
    }

    /// <summary>
    /// Downloads audio from Twilio MediaUrl using BasicAuth and transcribes it via Whisper.
    /// Returns an <see cref="AudioResult"/> indicating success, size-exceeded, or failure.
    /// </summary>
    private static async Task<AudioResult> DownloadAndTranscribeAsync(
        IServiceProvider sp,
        TwilioSettings twilioSettings,
        MediaInfo mediaInfo,
        int maxAudioSizeBytes,
        string phone,
        ILogger logger)
    {
        try
        {
            var httpClient = BuildTwilioHttpClient(sp, twilioSettings);

            // Pre-flight size check via HEAD — avoids downloading oversized files.
            var earlyExit = await CheckSizeViaHeadAsync(httpClient, mediaInfo.Url, maxAudioSizeBytes, phone, logger);
            if (earlyExit is not null) return earlyExit;

            var audioStream = await DownloadAudioStreamAsync(httpClient, mediaInfo.Url, maxAudioSizeBytes, phone, logger);
            if (audioStream is null) return new AudioResult.TooLarge();

            return await TranscribeStreamAsync(sp, audioStream, mediaInfo.ContentType);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to download or transcribe audio from {Phone}.", phone);
            return new AudioResult.Failed();
        }
    }

    /// <summary>
    /// Creates an <see cref="HttpClient"/> pre-configured with Twilio BasicAuth credentials.
    /// </summary>
    private static HttpClient BuildTwilioHttpClient(IServiceProvider sp, TwilioSettings twilioSettings)
    {
        var httpClientFactory = sp.GetRequiredService<IHttpClientFactory>();
        var httpClient = httpClientFactory.CreateClient();

        var credentials = Convert.ToBase64String(
            Encoding.ASCII.GetBytes($"{twilioSettings.AccountSid}:{twilioSettings.AuthToken}"));
        httpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Basic", credentials);

        return httpClient;
    }

    /// <summary>
    /// Sends a HEAD request and returns <see cref="AudioResult.TooLarge"/> if the
    /// Content-Length header exceeds <paramref name="maxBytes"/>, or null if the check passes.
    /// </summary>
    private static async Task<AudioResult?> CheckSizeViaHeadAsync(
        HttpClient httpClient, string url, int maxBytes, string phone, ILogger logger)
    {
        using var headResponse = await httpClient.SendAsync(
            new HttpRequestMessage(HttpMethod.Head, url), CancellationToken.None);

        if (headResponse.Headers.TryGetValues("Content-Length", out var clValues) &&
            long.TryParse(clValues.FirstOrDefault(), out var contentLength) &&
            contentLength > maxBytes)
        {
            logger.LogWarning("Audio from {Phone} exceeds size limit: {Size} > {Limit}.", phone, contentLength, maxBytes);
            return new AudioResult.TooLarge();
        }

        return null;
    }

    /// <summary>
    /// Downloads the audio into a <see cref="MemoryStream"/>, verifying the size limit.
    /// Returns null if the audio exceeds <paramref name="maxBytes"/>.
    /// </summary>
    private static async Task<MemoryStream?> DownloadAudioStreamAsync(
        HttpClient httpClient, string url, int maxBytes, string phone, ILogger logger)
    {
        using var getResponse = await httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, CancellationToken.None);
        getResponse.EnsureSuccessStatusCode();

        // Secondary size check from GET Content-Length header.
        var getContentLength = getResponse.Content.Headers.ContentLength;
        if (getContentLength.HasValue && getContentLength.Value > maxBytes)
        {
            logger.LogWarning("Audio from {Phone} exceeds size limit: {Size} > {Limit}.", phone, getContentLength.Value, maxBytes);
            return null;
        }

        var audioStream = new MemoryStream();
        await getResponse.Content.CopyToAsync(audioStream);

        // Final size check after reading the full body.
        if (audioStream.Length > maxBytes)
        {
            logger.LogWarning("Audio from {Phone} exceeds size limit after download: {Size} > {Limit}.", phone, audioStream.Length, maxBytes);
            audioStream.Dispose();
            return null;
        }

        audioStream.Position = 0;
        return audioStream;
    }

    /// <summary>
    /// Transcribes an audio stream via Whisper.
    /// </summary>
    private static async Task<AudioResult> TranscribeStreamAsync(
        IServiceProvider sp, MemoryStream audioStream, string contentType)
    {
        // Note: Twilio doesn't provide audio duration in webhook fields.
        // 10MB size limit serves as a practical proxy for ~60s of compressed audio.
        // Whisper API itself has a 25MB limit and handles long audio gracefully.
        await using var _ = audioStream;

        var extension = GetAudioExtension(contentType);
        var fileName = $"voice{extension}";

        var whisper = sp.GetRequiredService<WhisperTranscriptionService>();
        var transcript = await whisper.TranscribeAsync(audioStream, fileName, CancellationToken.None);

        return transcript is not null
            ? new AudioResult.Success(transcript)
            : new AudioResult.Failed();
    }

    /// <summary>Returns a file extension for a given audio Content-Type.</summary>
    private static string GetAudioExtension(string contentType) => contentType.ToLowerInvariant() switch
    {
        "audio/ogg" or "audio/ogg; codecs=opus" => ".ogg",
        "audio/mpeg" or "audio/mp3" => ".mp3",
        "audio/mp4" or "audio/m4a" => ".m4a",
        "audio/wav" => ".wav",
        "audio/webm" => ".webm",
        _ => ".ogg" // WhatsApp default is OGG/Opus
    };

    // ─── Text / AI handling ───────────────────────────────────────────────────

    /// <summary>
    /// Handles text messages: check for reset keywords, then run AI pipeline.
    /// </summary>
    private static async Task HandleTextMessageAsync(
        IServiceScopeFactory scopeFactory,
        string phone,
        string body,
        ILoggerFactory loggerFactory)
    {
        var trimmed = body.Trim();

        if (ResetKeywords.Contains(trimmed))
        {
            await HandleResetKeywordAsync(scopeFactory, phone, loggerFactory);
            return;
        }

        await ProcessIncomingMessageAsync(scopeFactory, phone, trimmed, loggerFactory);
    }

    /// <summary>
    /// Handles manual reset: resolves barbershop, clears conversation, replies with confirmation.
    /// </summary>
    private static async Task HandleResetKeywordAsync(
        IServiceScopeFactory scopeFactory,
        string phone,
        ILoggerFactory loggerFactory)
    {
        var bg = loggerFactory.CreateLogger("WhatsAppWebhook.Background");
        await using var scope = scopeFactory.CreateAsyncScope();
        var sp = scope.ServiceProvider;
        var whatsApp = sp.GetRequiredService<IWhatsAppService>();

        var resolver = sp.GetRequiredService<BarbershopResolver>();
        var identity = await resolver.ResolveAsync(phone, CancellationToken.None);

        if (identity.BarbershopId is not null)
        {
            var conversationSvc = sp.GetRequiredService<ConversationService>();
            await conversationSvc.ResetAsync(identity.BarbershopId.Value, phone, CancellationToken.None);
            bg.LogInformation("Manual reset triggered for {Phone} in barbershop {BarbershopId}.",
                phone, identity.BarbershopId.Value);
        }

        await whatsApp.SendTextAsync(
            phone,
            "Conversación reiniciada. ¿En qué puedo ayudarte?",
            CancellationToken.None);
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

        var reply = await RunAiTurnAsync(
            sp, identity.BarbershopId.Value, phone, messageText,
            identity.Role, identity.UserId, loggerFactory);
        await whatsApp.SendTextAsync(phone, reply, CancellationToken.None);
    }

    private static async Task<string> RunAiTurnAsync(
        IServiceProvider sp,
        Guid barbershopId,
        string phone,
        string messageText,
        string? role,
        Guid? userId,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger("WhatsAppWebhook.Processing");
        var connString = sp.GetRequiredService<ConnectionStringAccessor>().Value;

        var (barbershopName, timezone) = await LoadBarbershopMetaAsync(connString, barbershopId);

        var conversationSvc = sp.GetRequiredService<ConversationService>();
        var record = await LoadConversationWithAutoResetAsync(conversationSvc, barbershopId, phone, logger);

        var history = record is not null
            ? ConversationHistorySerializer.Deserialize(record.Messages)
            : new List<ChatMessage>();

        var context = record is not null ? record.Context : new Dictionary<string, object>();

        var (reply, updatedHistory) = await RunOrchestratorAsync(
            sp, connString, barbershopId, phone, timezone, barbershopName,
            messageText, history, role, userId, logger);

        var serialized = ConversationHistorySerializer.Serialize(updatedHistory);
        await conversationSvc.SaveAsync(barbershopId, phone, serialized, context, CancellationToken.None);

        return reply;
    }

    private static async Task<(string reply, List<ChatMessage> history)> RunOrchestratorAsync(
        IServiceProvider sp,
        string connString,
        Guid barbershopId,
        string phone,
        string timezone,
        string barbershopName,
        string messageText,
        List<ChatMessage> history,
        string? role,
        Guid? userId,
        ILogger logger)
    {
        try
        {
            var orchestrator = sp.GetRequiredService<AiBookingOrchestrator>();
            var promptBuilder = sp.GetRequiredService<BarberFlow.Infrastructure.AI.SystemPromptBuilder>();

            OrchestratorResult result;
            if (string.Equals(role, "barber", StringComparison.OrdinalIgnoreCase) && userId.HasValue)
            {
                var barberName = await GetBarberNameAsync(connString, userId.Value);
                var barberPrompt = promptBuilder.BuildBarber(barbershopName, timezone, barberName);
                result = await orchestrator.ProcessMessageAsync(
                    barbershopId, phone, timezone, messageText, history,
                    BarberFlow.Infrastructure.AI.ToolDefinitions.BarberTools, barberPrompt,
                    barberId: userId.Value, CancellationToken.None);
            }
            else
            {
                result = await orchestrator.ProcessMessageAsync(
                    barbershopId, barbershopName, phone, timezone,
                    messageText, history, CancellationToken.None);
            }

            return (result.Reply, result.UpdatedHistory);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI orchestrator failed.");
            return ("Lo siento, tuve un problema. Intentá de nuevo en un momento.", history);
        }
    }

    private static async Task<string> GetBarberNameAsync(string connString, Guid userId)
    {
        await using var conn = new NpgsqlConnection(connString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT name FROM users WHERE id = @id LIMIT 1", conn);
        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = userId });

        var result = await cmd.ExecuteScalarAsync();
        return result is string s && !string.IsNullOrWhiteSpace(s) ? s : "Peluquero";
    }

    /// <summary>
    /// Loads the barbershop name and timezone from the database in one round-trip each.
    /// </summary>
    private static async Task<(string barbershopName, string timezone)> LoadBarbershopMetaAsync(
        string connString, Guid barbershopId)
    {
        var barbershopName = await GetBarbershopFieldAsync(connString, barbershopId, "name", "La Barbería");
        var timezone = await GetBarbershopFieldAsync(connString, barbershopId, "COALESCE(timezone,'UTC')", "UTC");
        return (barbershopName, timezone);
    }

    /// <summary>
    /// Loads the conversation record and applies an auto-reset when the last message
    /// was more than 30 minutes ago. Auto-reset clears only the context (keeps history).
    /// Returns null if no record exists or after reset when history should be treated as empty.
    /// </summary>
    private static async Task<ConversationRecord?> LoadConversationWithAutoResetAsync(
        ConversationService conversationSvc,
        Guid barbershopId,
        string phone,
        ILogger logger)
    {
        var record = await conversationSvc.LoadAsync(barbershopId, phone, CancellationToken.None);

        if (record is null || !ConversationService.ShouldReset(record.LastMessageAt))
        {
            return record;
        }

        // Auto-reset on inactivity: clear pending context only, keep message history.
        logger.LogInformation(
            "Auto-reset triggered for {Phone} in barbershop {BarbershopId} — inactive > 30 min.",
            phone, barbershopId);
        await conversationSvc.ResetContextAsync(barbershopId, phone, CancellationToken.None);

        // Reload so the returned record reflects cleared context.
        return await conversationSvc.LoadAsync(barbershopId, phone, CancellationToken.None);
    }

    // ─── Signature validation ─────────────────────────────────────────────────

    private static bool ValidateSignature(
        HttpRequest request, string authToken, bool useSandbox, ILogger logger)
    {
        // Sandbox mode: skip signature validation for local development.
        if (useSandbox)
        {
            logger.LogWarning("Twilio signature validation skipped — sandbox mode");
            return true;
        }

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

// ─── Value objects ────────────────────────────────────────────────────────────

/// <summary>Media attachment info extracted from Twilio form fields.</summary>
internal sealed record MediaInfo(string ContentType, string Url);

/// <summary>Result of an audio download + transcription attempt.</summary>
internal abstract record AudioResult
{
    public sealed record Success(string Transcript) : AudioResult;
    public sealed record TooLarge : AudioResult;
    public sealed record Failed : AudioResult;
}
