using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Background service that polls <c>whatsapp_outbox</c> every 10 seconds for
/// <c>Pending</c> messages and delivers them via <see cref="IWhatsAppService"/>.
/// <para>
/// Uses <c>SELECT … FOR UPDATE SKIP LOCKED</c> to prevent double-processing in
/// multi-instance deployments.
/// </para>
/// <para>
    /// Retry backoff: <c>next_retry_at = NOW() + 2^retry_count * 30 seconds</c>
    /// → 30s, 60s, 120s. After 3 retries (4 total attempts) the message is marked <c>Failed</c>.
/// </para>
/// </summary>
public sealed class OutboxProcessorService : BackgroundService
{
    private const int PollingIntervalSeconds = 10;
    private const int MaxRetries = 3;
    private const int BatchSize = 20;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxProcessorService> _logger;
    private readonly string _connectionString;

    public OutboxProcessorService(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxProcessorService> logger,
        string connectionString)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _connectionString = connectionString;
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("OutboxProcessorService started. PollingInterval={PollingIntervalSeconds}s", PollingIntervalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never crash the host process — log and keep polling.
                _logger.LogError(ex, "OutboxProcessorService encountered an unexpected error during batch processing.");
            }

            await Task.Delay(TimeSpan.FromSeconds(PollingIntervalSeconds), stoppingToken);
        }

        _logger.LogInformation("OutboxProcessorService stopped.");
    }

    // ─── Batch processing ─────────────────────────────────────────────────────

    private async Task ProcessBatchAsync(CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var messages = await FetchPendingMessagesAsync(conn, ct);
        if (messages.Count == 0)
        {
            return;
        }

        _logger.LogDebug("OutboxProcessorService fetched {Count} pending message(s).", messages.Count);

        using var scope = _scopeFactory.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<IWhatsAppService>();

        foreach (var msg in messages)
        {
            await ProcessMessageAsync(conn, sender, msg, ct);
        }
    }

    private async Task ProcessMessageAsync(
        NpgsqlConnection conn,
        IWhatsAppService sender,
        OutboxRow msg,
        CancellationToken ct)
    {
        // Mark as Processing to prevent double-processing.
        await SetStatusAsync(conn, msg.Id, (int)OutboxMessageStatus.Processing, null, ct);

        try
        {
            await sender.SendTemplateAsync(msg.CustomerPhone, msg.TemplateName, msg.TemplateVariables, ct);

            await SetSentAsync(conn, msg.Id, ct);

            _logger.LogInformation(
                "Outbox message sent. Id={OutboxId} Template={TemplateName} BarbershopId={BarbershopId}",
                msg.Id, msg.TemplateName, msg.BarbershopId);
        }
        catch (ArgumentException argEx)
        {
            // Invalid E.164 phone — fail immediately, no retries.
            var safeError = $"Invalid phone format: {argEx.Message}";
            await SetFailedAsync(conn, msg.Id, safeError, ct);

            _logger.LogWarning(
                "Outbox message failed immediately (invalid phone). Id={OutboxId} Template={TemplateName} BarbershopId={BarbershopId} Error={Error}",
                msg.Id, msg.TemplateName, msg.BarbershopId, safeError);
        }
        catch (Exception ex)
        {
            await HandleRetryOrFailureAsync(conn, msg, ex, ct);
        }
    }

    // ─── Retry / failure helpers ─────────────────────────────────────────────

    /// <summary>
    /// Decides whether to schedule a retry or permanently fail the message.
    /// <para>
    /// Backoff formula: <c>2^retry_count * 30 seconds</c> (before incrementing),
    /// giving 30s → 60s → 120s for retry_count 0, 1, 2.
    /// After <see cref="MaxRetries"/> failures the message is marked Failed.
    /// </para>
    /// </summary>
    private async Task HandleRetryOrFailureAsync(
        NpgsqlConnection conn,
        OutboxRow msg,
        Exception ex,
        CancellationToken ct)
    {
        var newRetryCount = msg.RetryCount + 1;

        if (newRetryCount > MaxRetries)
        {
            // Dead-letter: max retries exhausted (3 retries + 1 initial = 4 total attempts).
            var safeError = $"Max retries exceeded. Last: {ex.GetType().Name}: {ex.Message}";
            await SetFailedAsync(conn, msg.Id, safeError, ct);

            _logger.LogError(
                ex,
                "Outbox message permanently failed after {MaxRetries} retries. Id={OutboxId} Template={TemplateName} BarbershopId={BarbershopId}",
                MaxRetries, msg.Id, msg.TemplateName, msg.BarbershopId);
        }
        else
        {
            // Schedule retry with exponential backoff: 2^msg.RetryCount * 30s
            // (use CURRENT retry_count, before incrementing → 30s, 60s, 120s)
            var backoffSeconds = (int)Math.Pow(2, msg.RetryCount) * 30;
            var nextRetry = DateTimeOffset.UtcNow.AddSeconds(backoffSeconds);
            var safeError = $"{ex.GetType().Name}: {ex.Message}";

            await SetRetryAsync(conn, msg.Id, newRetryCount, nextRetry, safeError, ct);

            _logger.LogWarning(
                "Outbox message failed — will retry. Id={OutboxId} Template={TemplateName} BarbershopId={BarbershopId} RetryCount={RetryCount} NextRetryAt={NextRetryAt}",
                msg.Id, msg.TemplateName, msg.BarbershopId, newRetryCount, nextRetry);
        }
    }

    // ─── SQL helpers — reads ──────────────────────────────────────────────────

    private static async Task<IReadOnlyList<OutboxRow>> FetchPendingMessagesAsync(
        NpgsqlConnection conn,
        CancellationToken ct)
    {
        // NOTE: barbershop_id is fetched here for logging/tracking purposes.
        // TODO (Phase 2+): When multi-barbershop support is needed, use barbershop_id
        // to look up per-tenant Twilio credentials (AccountSid, AuthToken, FromNumber)
        // instead of the current single global TwilioSettings. For Phase 1 (single-barbershop
        // MVP), global credentials are acceptable.
        await using var cmd = new NpgsqlCommand($@"
            SELECT id, customer_phone, template_name, template_variables,
                   retry_count, barbershop_id
            FROM whatsapp_outbox
            WHERE status = @pending
              AND (next_retry_at IS NULL OR next_retry_at <= NOW())
            ORDER BY created_at
            LIMIT {BatchSize}
            FOR UPDATE SKIP LOCKED", conn);

        cmd.Parameters.Add(new NpgsqlParameter("pending", NpgsqlDbType.Integer)
            { Value = (int)OutboxMessageStatus.Pending });

        var results = new List<OutboxRow>();

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var variablesJson = reader.IsDBNull(3) ? "{}" : reader.GetString(3);
            var variables = System.Text.Json.JsonSerializer
                .Deserialize<Dictionary<string, string>>(variablesJson)
                ?? new Dictionary<string, string>();

            results.Add(new OutboxRow(
                Id: reader.GetGuid(0),
                CustomerPhone: reader.GetString(1),
                TemplateName: reader.GetString(2),
                TemplateVariables: variables,
                RetryCount: reader.GetInt32(4),
                BarbershopId: reader.GetGuid(5)));
        }

        return results;
    }

    // ─── SQL helpers — writes ─────────────────────────────────────────────────

    private static async Task SetStatusAsync(
        NpgsqlConnection conn,
        Guid id,
        int status,
        string? lastError,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_outbox
            SET status = @status,
                last_error = @lastError
            WHERE id = @id", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer) { Value = status });
        cmd.Parameters.Add(new NpgsqlParameter("lastError", NpgsqlDbType.Text)
            { Value = (object?)lastError ?? DBNull.Value });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetSentAsync(NpgsqlConnection conn, Guid id, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_outbox
            SET status = @status,
                processed_at = NOW()
            WHERE id = @id", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer)
            { Value = (int)OutboxMessageStatus.Sent });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetFailedAsync(
        NpgsqlConnection conn,
        Guid id,
        string lastError,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_outbox
            SET status = @status,
                last_error = @lastError,
                processed_at = NOW()
            WHERE id = @id", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer)
            { Value = (int)OutboxMessageStatus.Failed });
        cmd.Parameters.Add(new NpgsqlParameter("lastError", NpgsqlDbType.Text) { Value = lastError });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetRetryAsync(
        NpgsqlConnection conn,
        Guid id,
        int newRetryCount,
        DateTimeOffset nextRetryAt,
        string lastError,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_outbox
            SET status = @pending,
                retry_count = @retryCount,
                next_retry_at = @nextRetryAt,
                last_error = @lastError
            WHERE id = @id", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("pending", NpgsqlDbType.Integer)
            { Value = (int)OutboxMessageStatus.Pending });
        cmd.Parameters.Add(new NpgsqlParameter("retryCount", NpgsqlDbType.Integer) { Value = newRetryCount });
        cmd.Parameters.Add(new NpgsqlParameter("nextRetryAt", NpgsqlDbType.TimestampTz) { Value = nextRetryAt });
        cmd.Parameters.Add(new NpgsqlParameter("lastError", NpgsqlDbType.Text) { Value = lastError });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Private records ─────────────────────────────────────────────────────

    private sealed record OutboxRow(
        Guid Id,
        string CustomerPhone,
        string TemplateName,
        Dictionary<string, string> TemplateVariables,
        int RetryCount,
        Guid BarbershopId);
}
