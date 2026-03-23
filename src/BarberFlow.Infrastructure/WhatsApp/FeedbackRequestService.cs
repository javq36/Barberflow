using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;
using System.Text.Json;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Background service that periodically queries completed appointments without a feedback
/// request and enqueues a feedback message to opted-in customers.
/// <para>
/// Deduplication is guaranteed by <c>appointments.feedback_requested_at</c>: both the
/// outbox INSERT and the column UPDATE are committed in the same transaction.
/// </para>
/// </summary>
public sealed class FeedbackRequestService : BackgroundService
{
    private const int DefaultDelayMinutes = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FeedbackRequestService> _logger;
    private readonly string _connectionString;
    private readonly TimeSpan _delayAfterCompletion;
    private readonly TimeSpan _pollingInterval;

    public FeedbackRequestService(
        IServiceScopeFactory scopeFactory,
        ILogger<FeedbackRequestService> logger,
        string connectionString,
        int delayMinutes = DefaultDelayMinutes)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _connectionString = connectionString;
        _delayAfterCompletion = TimeSpan.FromMinutes(delayMinutes);
        _pollingInterval = TimeSpan.FromMinutes(delayMinutes);
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "FeedbackRequestService started. DelayMinutes={DelayMinutes}",
            _delayAfterCompletion.TotalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessFeedbackRequestsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "FeedbackRequestService encountered an unexpected error.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("FeedbackRequestService stopped.");
    }

    // ─── Core processing ──────────────────────────────────────────────────────

    private async Task ProcessFeedbackRequestsAsync(CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var appointments = await QueryCompletedAppointmentsAsync(conn, ct);

        if (appointments.Count == 0)
        {
            return;
        }

        _logger.LogDebug(
            "FeedbackRequestService found {Count} appointment(s) ready for feedback request.",
            appointments.Count);

        using var scope = _scopeFactory.CreateScope();
        var outboxService = scope.ServiceProvider.GetRequiredService<IWhatsAppOutboxService>();

        foreach (var appt in appointments)
        {
            await SendFeedbackRequestAsync(conn, outboxService, appt, ct);
        }
    }

    private async Task SendFeedbackRequestAsync(
        NpgsqlConnection conn,
        IWhatsAppOutboxService outboxService,
        FeedbackRow appt,
        CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);

        try
        {
            var variables = new Dictionary<string, string>
            {
                ["barber_name"] = appt.BarberName,
                ["appointment_id"] = appt.AppointmentId.ToString()
            };

            await outboxService.EnqueueAsync(
                connection: conn,
                barbershopId: appt.BarbershopId,
                customerPhone: appt.CustomerPhone,
                templateName: WhatsAppTemplateName.FeedbackRequest,
                templateVariables: variables,
                transaction: tx,
                ct: ct);

            await MarkFeedbackRequestedAsync(conn, tx, appt.AppointmentId, ct);
            await SetPendingFeedbackContextAsync(conn, tx, appt, ct);

            await tx.CommitAsync(ct);

            _logger.LogInformation(
                "Feedback request sent for appointment {AppointmentId} BarbershopId={BarbershopId}",
                appt.AppointmentId, appt.BarbershopId);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);

            _logger.LogError(
                ex,
                "Failed to send feedback request for appointment {AppointmentId}. Transaction rolled back.",
                appt.AppointmentId);
        }
    }

    // ─── SQL helpers ─────────────────────────────────────────────────────────

    private const string CompletedAppointmentsSql = @"
            SELECT
                a.id              AS appointment_id,
                a.barbershop_id,
                c.phone           AS customer_phone,
                c.name            AS customer_name,
                u.name            AS barber_name
            FROM appointments a
            JOIN customers  c ON c.id = a.customer_id
            JOIN users      u ON u.id = a.barber_id
            WHERE a.status = 4
              AND a.feedback_requested_at IS NULL
              AND a.end_time < NOW() - @delay
              AND c.opt_in_whatsapp = TRUE
              AND c.phone IS NOT NULL";

    private async Task<IReadOnlyList<FeedbackRow>> QueryCompletedAppointmentsAsync(
        NpgsqlConnection conn,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(CompletedAppointmentsSql, conn);
        cmd.Parameters.Add(new NpgsqlParameter("delay", NpgsqlDbType.Interval)
        {
            Value = _delayAfterCompletion
        });

        var results = new List<FeedbackRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(MapFeedbackRow(reader));
        }

        return results;
    }

    private static FeedbackRow MapFeedbackRow(NpgsqlDataReader reader) =>
        new FeedbackRow(
            AppointmentId: reader.GetGuid(0),
            BarbershopId: reader.GetGuid(1),
            CustomerPhone: reader.GetString(2),
            CustomerName: reader.GetString(3),
            BarberName: reader.GetString(4));

    private static async Task MarkFeedbackRequestedAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET feedback_requested_at = NOW()
            WHERE id = @id", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetPendingFeedbackContextAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        FeedbackRow appt,
        CancellationToken ct)
    {
        var contextPatch = JsonSerializer.Serialize(new
        {
            pending_feedback = true,
            pending_feedback_appointment_id = appt.AppointmentId.ToString()
        });

        // Merge pending_feedback fields into the existing context JSONB.
        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_conversations
            SET context = context || @patch::jsonb
            WHERE barbershop_id = @barbershopId AND phone = @phone", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("patch", NpgsqlDbType.Text) { Value = contextPatch });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = appt.BarbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = appt.CustomerPhone });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Private records ─────────────────────────────────────────────────────

    private sealed record FeedbackRow(
        Guid AppointmentId,
        Guid BarbershopId,
        string CustomerPhone,
        string CustomerName,
        string BarberName);
}
