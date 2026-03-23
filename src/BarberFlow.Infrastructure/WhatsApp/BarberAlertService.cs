using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Background service that sends barbers a WhatsApp alert ~N minutes before each appointment.
/// Follows the exact same polling + transaction pattern as <see cref="AppointmentReminderService"/>.
/// <para>
/// Deduplication is guaranteed by <c>appointments.barber_alert_sent_at</c>: both the
/// outbox INSERT and the column UPDATE are committed in the same transaction.
/// </para>
/// </summary>
public sealed class BarberAlertService : BackgroundService
{
    private const int PollingIntervalMinutes = 5;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BarberAlertService> _logger;
    private readonly string _connectionString;
    private readonly int _minutesBefore;
    private readonly TimeSpan _pollingInterval;

    public BarberAlertService(
        IServiceScopeFactory scopeFactory,
        ILogger<BarberAlertService> logger,
        string connectionString,
        int minutesBefore = 10)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _connectionString = connectionString;
        _minutesBefore = minutesBefore;
        _pollingInterval = TimeSpan.FromMinutes(PollingIntervalMinutes);
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "BarberAlertService started. AlertMinutesBefore={MinutesBefore}, Interval={Interval}min",
            _minutesBefore, PollingIntervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessAlertsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "BarberAlertService encountered an unexpected error.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("BarberAlertService stopped.");
    }

    // ─── Core processing ──────────────────────────────────────────────────────

    private async Task ProcessAlertsAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var outboxService = scope.ServiceProvider.GetRequiredService<IWhatsAppOutboxService>();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var appointments = await QueryUpcomingAppointmentsAsync(conn, ct);

        if (appointments.Count == 0) return;

        _logger.LogDebug("BarberAlertService found {Count} appointment(s) due for alert.", appointments.Count);

        foreach (var appt in appointments)
        {
            await EnqueueAlertAsync(conn, outboxService, appt, ct);
        }
    }

    private async Task EnqueueAlertAsync(
        NpgsqlConnection conn,
        IWhatsAppOutboxService outboxService,
        AlertRow appt,
        CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);

        try
        {
            var variables = new Dictionary<string, string>
            {
                ["barber_name"] = appt.BarberName,
                ["customer_name"] = appt.CustomerName,
                ["service_name"] = appt.ServiceName,
                ["appointment_time"] = appt.AppointmentTimeLocal.ToString("HH:mm")
            };

            await outboxService.EnqueueAsync(
                connection: conn,
                barbershopId: appt.BarbershopId,
                customerPhone: appt.BarberPhone,
                templateName: WhatsAppTemplateName.BarberAlert10Min,
                templateVariables: variables,
                transaction: tx,
                ct: ct);

            await MarkAlertSentAsync(conn, tx, appt.AppointmentId, ct);

            await tx.CommitAsync(ct);

            _logger.LogInformation(
                "Barber alert enqueued for appointment {AppointmentId} BarbershopId={BarbershopId}",
                appt.AppointmentId, appt.BarbershopId);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _logger.LogError(
                ex,
                "Failed to enqueue barber alert for appointment {AppointmentId}. Transaction rolled back.",
                appt.AppointmentId);
        }
    }

    // ─── SQL helpers ──────────────────────────────────────────────────────────

    /// <summary>
    /// Selects appointments starting within the alert window and not yet alerted.
    /// Uses a symmetric window around NOW()+minutesBefore so each poll catches the window.
    /// </summary>
    private async Task<IReadOnlyList<AlertRow>> QueryUpcomingAppointmentsAsync(
        NpgsqlConnection conn, CancellationToken ct)
    {
        var windowLow  = DateTimeOffset.UtcNow.Add(TimeSpan.FromMinutes(_minutesBefore - PollingIntervalMinutes));
        var windowHigh = DateTimeOffset.UtcNow.Add(TimeSpan.FromMinutes(_minutesBefore + PollingIntervalMinutes));

        await using var cmd = new NpgsqlCommand(@"
            SELECT
                a.id              AS appointment_id,
                a.barbershop_id,
                a.appointment_time,
                c.name            AS customer_name,
                s.name            AS service_name,
                u.name            AS barber_name,
                u.phone           AS barber_phone,
                b.timezone        AS barbershop_timezone
            FROM appointments a
            JOIN customers   c ON c.id = a.customer_id
            JOIN services    s ON s.id = a.service_id
            JOIN users       u ON u.id = a.barber_id
            JOIN barbershops b ON b.id = a.barbershop_id
            WHERE a.appointment_time BETWEEN @windowLow AND @windowHigh
              AND a.barber_alert_sent_at IS NULL
              AND a.status IN (1, 2)
              AND u.phone IS NOT NULL", conn);

        cmd.Parameters.Add(new NpgsqlParameter("windowLow",  NpgsqlDbType.TimestampTz) { Value = windowLow });
        cmd.Parameters.Add(new NpgsqlParameter("windowHigh", NpgsqlDbType.TimestampTz) { Value = windowHigh });

        var results = new List<AlertRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var apptUtc = reader.GetFieldValue<DateTimeOffset>(2);
            var tzId    = reader.IsDBNull(7) ? "UTC" : reader.GetString(7);
            var tz      = ResolveTimeZone(tzId);
            var apptLocal = TimeZoneInfo.ConvertTimeFromUtc(apptUtc.UtcDateTime, tz);

            results.Add(new AlertRow(
                AppointmentId: reader.GetGuid(0),
                BarbershopId: reader.GetGuid(1),
                AppointmentTimeLocal: apptLocal,
                CustomerName: reader.GetString(3),
                ServiceName: reader.GetString(4),
                BarberName: reader.GetString(5),
                BarberPhone: reader.GetString(6)));
        }

        return results;
    }

    private static async Task MarkAlertSentAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx, Guid appointmentId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET barber_alert_sent_at = NOW()
            WHERE id = @id", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static TimeZoneInfo ResolveTimeZone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }

    // ─── Private records ──────────────────────────────────────────────────────

    private sealed record AlertRow(
        Guid AppointmentId,
        Guid BarbershopId,
        DateTime AppointmentTimeLocal,
        string CustomerName,
        string ServiceName,
        string BarberName,
        string BarberPhone);
}
