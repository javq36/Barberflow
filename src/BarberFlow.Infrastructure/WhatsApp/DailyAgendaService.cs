using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Background service that sends each barber a daily WhatsApp agenda summary
/// at the barbershop's configured local hour (default 8:00 AM).
/// <para>
/// Deduplication: <c>users.daily_agenda_sent_date</c> is updated inside the same
/// transaction as the outbox INSERT, preventing duplicate sends on restart.
/// </para>
/// </summary>
public sealed class DailyAgendaService : BackgroundService
{
    private const int PollingIntervalMinutes = 30;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DailyAgendaService> _logger;
    private readonly string _connectionString;
    private readonly int _dailyAgendaHour;
    private readonly TimeSpan _pollingInterval;

    public DailyAgendaService(
        IServiceScopeFactory scopeFactory,
        ILogger<DailyAgendaService> logger,
        string connectionString,
        int dailyAgendaHour = 8)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _connectionString = connectionString;
        _dailyAgendaHour = dailyAgendaHour;
        _pollingInterval = TimeSpan.FromMinutes(PollingIntervalMinutes);
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "DailyAgendaService started. DailyAgendaHour={Hour}, Interval={Interval}min",
            _dailyAgendaHour, PollingIntervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DailyAgendaService encountered an unexpected error.");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("DailyAgendaService stopped.");
    }

    // ─── Core processing ──────────────────────────────────────────────────────

    private async Task ProcessAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var outboxService = scope.ServiceProvider.GetRequiredService<IWhatsAppOutboxService>();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var barbershops = await QueryActiveBarbershopsAsync(conn, ct);

        foreach (var shop in barbershops)
        {
            if (!IsWithinSendWindow(shop.Timezone))
                continue;

            var barbers = await QueryBarbersForAgendaAsync(conn, shop, ct);
            foreach (var barber in barbers)
            {
                await SendAgendaToBarberAsync(conn, outboxService, shop, barber, ct);
            }
        }
    }

    /// <summary>
    /// Returns true when the current UTC time falls within the configured send hour
    /// in the barbershop's local timezone (within a ±polling interval window).
    /// </summary>
    private bool IsWithinSendWindow(string timezoneId)
    {
        var tz = ResolveTimeZone(timezoneId);
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        return localNow.Hour == _dailyAgendaHour;
    }

    private async Task SendAgendaToBarberAsync(
        NpgsqlConnection conn,
        IWhatsAppOutboxService outboxService,
        BarbershopRow shop,
        BarberRow barber,
        CancellationToken ct)
    {
        var tz = ResolveTimeZone(shop.Timezone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));

        var appointments = await QueryBarberAppointmentsAsync(conn, barber.UserId, shop.BarbershopId, today, tz, ct);

        if (appointments.Count == 0)
        {
            _logger.LogDebug(
                "DailyAgendaService: no appointments for barber {BarberId} on {Date} — skipping.",
                barber.UserId, today);
            return;
        }

        await EnqueueAgendaWithTransactionAsync(conn, outboxService, shop, barber, today, appointments, ct);
    }

    private async Task EnqueueAgendaWithTransactionAsync(
        NpgsqlConnection conn,
        IWhatsAppOutboxService outboxService,
        BarbershopRow shop,
        BarberRow barber,
        DateOnly today,
        IReadOnlyList<AgendaItem> appointments,
        CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            var variables = BuildAgendaVariables(barber, today, appointments);

            await outboxService.EnqueueAsync(
                connection: conn,
                barbershopId: shop.BarbershopId,
                customerPhone: barber.BarberPhone,
                templateName: WhatsAppTemplateName.BarberDailyAgenda,
                templateVariables: variables,
                transaction: tx,
                ct: ct);

            await MarkAgendaSentAsync(conn, tx, barber.UserId, today, ct);
            await tx.CommitAsync(ct);

            _logger.LogInformation(
                "Daily agenda enqueued for barber {BarberId} BarbershopId={BarbershopId} Date={Date}",
                barber.UserId, shop.BarbershopId, today);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _logger.LogError(
                ex,
                "Failed to enqueue daily agenda for barber {BarberId}. Transaction rolled back.",
                barber.UserId);
        }
    }

    private static Dictionary<string, string> BuildAgendaVariables(
        BarberRow barber, DateOnly today, IReadOnlyList<AgendaItem> appointments)
    {
        var agendaLines = string.Join(", ", appointments.Select(a => $"{a.Time} {a.CustomerName}"));
        return new Dictionary<string, string>
        {
            ["barber_name"] = barber.BarberName,
            ["date"] = today.ToString("dd/MM/yyyy"),
            ["count"] = appointments.Count.ToString(),
            ["agenda"] = agendaLines
        };
    }

    // ─── SQL helpers ──────────────────────────────────────────────────────────

    private static async Task<IReadOnlyList<BarbershopRow>> QueryActiveBarbershopsAsync(
        NpgsqlConnection conn, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT id, COALESCE(timezone, 'UTC')
            FROM barbershops
            WHERE active = TRUE", conn);

        var results = new List<BarbershopRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new BarbershopRow(reader.GetGuid(0), reader.GetString(1)));
        }

        return results;
    }

    private static async Task<IReadOnlyList<BarberRow>> QueryBarbersForAgendaAsync(
        NpgsqlConnection conn, BarbershopRow shop, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveTimeZone(shop.Timezone)));

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, name, phone
            FROM users
            WHERE barbershop_id = @barbershopId
              AND role IN (1, 3)
              AND active = TRUE
              AND phone IS NOT NULL
              AND (daily_agenda_sent_date IS NULL OR daily_agenda_sent_date < @today)", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = shop.BarbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("today", NpgsqlDbType.Date) { Value = today });

        var results = new List<BarberRow>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new BarberRow(reader.GetGuid(0), reader.GetString(1), reader.GetString(2)));
        }

        return results;
    }

    private static async Task<IReadOnlyList<AgendaItem>> QueryBarberAppointmentsAsync(
        NpgsqlConnection conn, Guid barberId, Guid barbershopId,
        DateOnly date, TimeZoneInfo tz, CancellationToken ct)
    {
        var startUtc = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), tz);
        var endUtc   = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MaxValue), tz);

        await using var cmd = new NpgsqlCommand(@"
            SELECT a.appointment_time, c.name
            FROM appointments a
            JOIN customers c ON c.id = a.customer_id
            WHERE a.barbershop_id = @barbershopId
              AND a.barber_id = @barberId
              AND a.appointment_time >= @startUtc
              AND a.appointment_time <= @endUtc
              AND a.status IN (1, 2)
            ORDER BY a.appointment_time", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId",     NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("startUtc", NpgsqlDbType.TimestampTz) { Value = startUtc });
        cmd.Parameters.Add(new NpgsqlParameter("endUtc",   NpgsqlDbType.TimestampTz) { Value = endUtc });

        var results = new List<AgendaItem>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var timeUtc   = reader.GetFieldValue<DateTimeOffset>(0);
            var timeLocal = TimeZoneInfo.ConvertTimeFromUtc(timeUtc.UtcDateTime, tz);
            results.Add(new AgendaItem(timeLocal.ToString("HH:mm"), reader.GetString(1)));
        }

        return results;
    }

    private static async Task MarkAgendaSentAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx, Guid userId, DateOnly date, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE users
            SET daily_agenda_sent_date = @date
            WHERE id = @id", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id",   NpgsqlDbType.Uuid) { Value = userId });
        cmd.Parameters.Add(new NpgsqlParameter("date", NpgsqlDbType.Date) { Value = date });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static TimeZoneInfo ResolveTimeZone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.Utc; }
    }

    // ─── Private records ──────────────────────────────────────────────────────

    private sealed record BarbershopRow(Guid BarbershopId, string Timezone);

    private sealed record BarberRow(Guid UserId, string BarberName, string BarberPhone);

    private sealed record AgendaItem(string Time, string CustomerName);
}
