using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Background service that periodically queries upcoming appointments and
/// enqueues a 24-hour reminder to <c>whatsapp_outbox</c> for opted-in customers.
/// <para>
/// Deduplication is guaranteed by <c>appointments.reminder_sent_at</c>: both the
/// outbox INSERT and the <c>reminder_sent_at</c> UPDATE are committed in the same
/// transaction, so a reminder can never be enqueued twice for the same appointment.
/// </para>
/// </summary>
public sealed class AppointmentReminderService : BackgroundService
{
    private const int DefaultIntervalMinutes = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AppointmentReminderService> _logger;
    private readonly string _connectionString;
    private readonly TimeSpan _pollingInterval;

    public AppointmentReminderService(
        IServiceScopeFactory scopeFactory,
        ILogger<AppointmentReminderService> logger,
        string connectionString,
        int intervalMinutes = DefaultIntervalMinutes)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _connectionString = connectionString;
        _pollingInterval = TimeSpan.FromMinutes(intervalMinutes);
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "AppointmentReminderService started. Interval={IntervalMinutes}min",
            _pollingInterval.TotalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessRemindersAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never crash the host process — log and keep running.
                _logger.LogError(ex, "AppointmentReminderService encountered an unexpected error.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("AppointmentReminderService stopped.");
    }

    // ─── Core processing ──────────────────────────────────────────────────────

    private async Task ProcessRemindersAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var outboxService = scope.ServiceProvider.GetRequiredService<IWhatsAppOutboxService>();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var appointments = await QueryUpcomingAppointmentsAsync(conn, ct);

        if (appointments.Count == 0)
        {
            return;
        }

        _logger.LogDebug(
            "AppointmentReminderService found {Count} appointment(s) due for reminder.",
            appointments.Count);

        foreach (var appt in appointments)
        {
            await EnqueueReminderAsync(conn, outboxService, appt, ct);
        }
    }

    private async Task EnqueueReminderAsync(
        NpgsqlConnection conn,
        IWhatsAppOutboxService outboxService,
        ReminderRow appt,
        CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);

        try
        {
            // Build template variables for the reminder.
            var variables = new Dictionary<string, string>
            {
                ["customer_name"] = appt.CustomerName,
                ["barber_name"] = appt.BarberName,
                ["service_name"] = appt.ServiceName,
                ["appointment_time"] = appt.AppointmentTime.ToString("yyyy-MM-dd HH:mm"),
                ["barbershop_name"] = appt.BarbershopName
            };

            // Insert outbox row — shares the same connection + transaction.
            await outboxService.EnqueueAsync(
                connection: conn,
                barbershopId: appt.BarbershopId,
                customerPhone: appt.CustomerPhone,
                templateName: WhatsAppTemplateName.AppointmentReminder24h,
                templateVariables: variables,
                transaction: tx,
                ct: ct);

            // Mark reminder as sent to prevent duplicates.
            await MarkReminderSentAsync(conn, tx, appt.AppointmentId, ct);

            await tx.CommitAsync(ct);

            _logger.LogInformation(
                "Reminder enqueued for appointment {AppointmentId} BarbershopId={BarbershopId}",
                appt.AppointmentId, appt.BarbershopId);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);

            _logger.LogError(
                ex,
                "Failed to enqueue reminder for appointment {AppointmentId}. Transaction rolled back.",
                appt.AppointmentId);
        }
    }

    // ─── SQL helpers ─────────────────────────────────────────────────────────

    private const string UpcomingAppointmentsSql = @"
            SELECT
                a.id              AS appointment_id,
                a.barbershop_id,
                a.appointment_time,
                c.phone           AS customer_phone,
                c.name            AS customer_name,
                u.name            AS barber_name,
                s.name            AS service_name,
                b.name            AS barbershop_name
            FROM appointments a
            JOIN customers  c ON c.id = a.customer_id
            JOIN users      u ON u.id = a.barber_id
            JOIN services   s ON s.id = a.service_id
            JOIN barbershops b ON b.id = a.barbershop_id
            WHERE a.appointment_time BETWEEN @windowLow AND @windowHigh
              AND a.reminder_sent_at IS NULL
              AND a.status IN (1, 2)
              AND c.opt_in_whatsapp = TRUE
              AND c.phone IS NOT NULL";

    /// <summary>
    /// Returns appointments that start approximately 24 hours from now (±polling interval),
    /// have no reminder yet, and belong to opted-in customers.
    /// Statuses 1 (Pending) and 2 (Confirmed) only.
    /// <para>
    /// The narrow window ensures we target appointments truly approaching the 24-hour mark
    /// rather than any appointment in the next 24 hours (which would include appointments
    /// minutes away and would fire reminders far too early).
    /// </para>
    /// </summary>
    private async Task<IReadOnlyList<ReminderRow>> QueryUpcomingAppointmentsAsync(
        NpgsqlConnection conn,
        CancellationToken ct)
    {
        // Target the window: NOW()+24h-interval to NOW()+24h+interval
        // (symmetric window around the 24-hour mark).
        var windowLow = DateTimeOffset.UtcNow.Add(TimeSpan.FromHours(24) - _pollingInterval);
        var windowHigh = DateTimeOffset.UtcNow.Add(TimeSpan.FromHours(24) + _pollingInterval);

        await using var cmd = new NpgsqlCommand(UpcomingAppointmentsSql, conn);
        BindWindowParameters(cmd, windowLow, windowHigh);

        var results = new List<ReminderRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(MapReminderRow(reader));
        }

        return results;
    }

    private static void BindWindowParameters(
        NpgsqlCommand cmd,
        DateTimeOffset windowLow,
        DateTimeOffset windowHigh)
    {
        cmd.Parameters.Add(new NpgsqlParameter("windowLow", NpgsqlDbType.TimestampTz) { Value = windowLow });
        cmd.Parameters.Add(new NpgsqlParameter("windowHigh", NpgsqlDbType.TimestampTz) { Value = windowHigh });
    }

    private static ReminderRow MapReminderRow(NpgsqlDataReader reader) =>
        new ReminderRow(
            AppointmentId: reader.GetGuid(0),
            BarbershopId: reader.GetGuid(1),
            AppointmentTime: reader.GetFieldValue<DateTimeOffset>(2),
            CustomerPhone: reader.GetString(3),
            CustomerName: reader.GetString(4),
            BarberName: reader.GetString(5),
            ServiceName: reader.GetString(6),
            BarbershopName: reader.GetString(7));

    private static async Task MarkReminderSentAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET reminder_sent_at = NOW()
            WHERE id = @id", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Private records ─────────────────────────────────────────────────────

    private sealed record ReminderRow(
        Guid AppointmentId,
        Guid BarbershopId,
        DateTimeOffset AppointmentTime,
        string CustomerPhone,
        string CustomerName,
        string BarberName,
        string ServiceName,
        string BarbershopName);
}
