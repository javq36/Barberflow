using Npgsql;

namespace BarberFlow.Application.Services;

/// <summary>
/// Real slot engine. Replaces the hardcoded 09:00–18:00 fallback.
/// All times are stored as UTC in the database. The <paramref name="timezone"/> parameter
/// is an IANA timezone identifier used to interpret the requested <see cref="DateOnly"/>.
/// </summary>
public sealed class AvailabilityService : IAvailabilityService
{
    private readonly string _connectionString;
    private readonly IBookingRulesService _bookingRules;

    public AvailabilityService(string connectionString, IBookingRulesService bookingRules)
    {
        _connectionString = connectionString;
        _bookingRules = bookingRules;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<SlotDto>> GetAvailableSlotsAsync(
        Guid barbershopId,
        Guid barberId,
        Guid serviceId,
        DateOnly date,
        string timezone,
        bool isPublic,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var context = await LoadScheduleContextAsync(conn, barbershopId, barberId, serviceId, date, ct);
        if (!context.IsValid)
        {
            return Array.Empty<SlotDto>();
        }

        var rules = await _bookingRules.GetByBarbershopIdAsync(barbershopId, ct)
                    ?? BuildDefaultRules(barbershopId);

        if (IsDateOutOfWindow(date, rules.MaxDaysInAdvance))
        {
            return Array.Empty<SlotDto>();
        }

        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var busyRanges = await LoadBusyRangesAsync(conn, barbershopId, barberId, date, context.Block!, tz, ct);

        return GenerateSlots(
            date, tz, context.Block!,
            context.DurationMinutes, rules.SlotDurationMinutes,
            isPublic ? rules.BufferMinutes : SlotBufferMinutes.None,
            isPublic ? rules.MinNoticeHours * 60 : 0,
            DateTimeOffset.UtcNow,
            busyRanges);
    }

    private async Task<ScheduleContext> LoadScheduleContextAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        Guid serviceId,
        DateOnly date,
        CancellationToken ct)
    {
        var durationMinutes = await GetServiceDurationAsync(conn, barbershopId, serviceId, ct);
        if (durationMinutes is null)
        {
            return ScheduleContext.Invalid;
        }

        var workingBlock = await GetWorkingBlockAsync(conn, barberId, date, ct);
        if (workingBlock is null)
        {
            return ScheduleContext.Invalid;
        }

        if (await IsTimeOffDayAsync(conn, barberId, date, ct))
        {
            return ScheduleContext.Invalid;
        }

        return new ScheduleContext(durationMinutes.Value, workingBlock);
    }

    private static async Task<List<(DateTimeOffset Start, DateTimeOffset End)>> LoadBusyRangesAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        DateOnly date,
        WorkingBlock block,
        TimeZoneInfo tz,
        CancellationToken ct)
    {
        var dayStartUtc = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(block.Start), tz);
        var dayEndUtc = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(block.End), tz);
        return await GetBusyRangesAsync(conn, barbershopId, barberId, dayStartUtc, dayEndUtc, ct);
    }

    private static bool IsDateOutOfWindow(DateOnly date, int maxDaysInAdvance)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        return date < today || date > today.AddDays(maxDaysInAdvance);
    }

    // ─── Data fetchers ────────────────────────────────────────────────────────

    private static async Task<int?> GetServiceDurationAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid serviceId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT duration_minutes
            FROM services
            WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("serviceId", serviceId);
        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is null ? null : Convert.ToInt32(result);
    }

    private static async Task<WorkingBlock?> GetWorkingBlockAsync(
        NpgsqlConnection conn,
        Guid barberId,
        DateOnly date,
        CancellationToken ct)
    {
        var dayOfWeek = (int)date.DayOfWeek;

        await using var cmd = new NpgsqlCommand(@"
            SELECT start_time, end_time
            FROM working_hours
            WHERE barber_id = @barberId
              AND day_of_week = @dayOfWeek
              AND is_active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("dayOfWeek", dayOfWeek);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new WorkingBlock(
            Start: TimeOnly.FromTimeSpan(reader.GetTimeSpan(0)),
            End: TimeOnly.FromTimeSpan(reader.GetTimeSpan(1)));
    }

    private static async Task<bool> IsTimeOffDayAsync(
        NpgsqlConnection conn,
        Guid barberId,
        DateOnly date,
        CancellationToken ct)
    {
        var dateTs = date.ToDateTime(TimeOnly.MinValue);

        await using var cmd = new NpgsqlCommand(@"
            SELECT 1 FROM time_off
            WHERE barber_id = @barberId
              AND start_date <= @date
              AND end_date >= @date
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("date", dateTs);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null;
    }

    private static async Task<List<(DateTimeOffset Start, DateTimeOffset End)>> GetBusyRangesAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        DateTime dayStartUtc,
        DateTime dayEndUtc,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT appointment_time, end_time
            FROM appointments
            WHERE barbershop_id = @barbershopId
              AND barber_id = @barberId
              AND status IN (1, 2)
              AND appointment_time < @dayEnd
              AND end_time > @dayStart
            ORDER BY appointment_time", conn);

        cmd.Parameters.AddWithValue("barbershopId", barbershopId);
        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("dayStart", dayStartUtc);
        cmd.Parameters.AddWithValue("dayEnd", dayEndUtc);

        var results = new List<(DateTimeOffset, DateTimeOffset)>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var start = reader.GetFieldValue<DateTimeOffset>(0);
            var end = reader.GetFieldValue<DateTimeOffset>(1);
            results.Add((start, end));
        }

        return results;
    }

    // ─── Slot generation ──────────────────────────────────────────────────────

    private static IReadOnlyList<SlotDto> GenerateSlots(
        DateOnly date,
        TimeZoneInfo tz,
        WorkingBlock block,
        int durationMinutes,
        int slotIntervalMinutes,
        int bufferMinutes,
        int minNoticeMinutes,
        DateTimeOffset now,
        List<(DateTimeOffset Start, DateTimeOffset End)> busyRanges)
    {
        var slots = new List<SlotDto>();
        var cursor = date.ToDateTime(block.Start);
        var workEndLocal = date.ToDateTime(block.End);
        var minNotice = TimeSpan.FromMinutes(minNoticeMinutes);
        var effectiveInterval = Math.Max(slotIntervalMinutes, durationMinutes);

        while (cursor.AddMinutes(durationMinutes) <= workEndLocal)
        {
            var slotStartUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(cursor, tz));
            var slotEndUtc = slotStartUtc.AddMinutes(durationMinutes);

            var isAvailable = IsSlotAvailable(slotStartUtc, slotEndUtc, now, minNotice, bufferMinutes, busyRanges);
            slots.Add(new SlotDto(slotStartUtc, slotEndUtc, isAvailable));

            cursor = cursor.AddMinutes(effectiveInterval);
        }

        return slots;
    }

    private static bool IsSlotAvailable(
        DateTimeOffset slotStart,
        DateTimeOffset slotEnd,
        DateTimeOffset now,
        TimeSpan minNotice,
        int bufferMinutes,
        List<(DateTimeOffset Start, DateTimeOffset End)> busyRanges)
    {
        // Min-notice check: slot must start sufficiently far in the future
        if (minNotice > TimeSpan.Zero && slotStart < now + minNotice)
        {
            return false;
        }

        // Overlap check against existing appointments (with optional buffer)
        foreach (var busy in busyRanges)
        {
            var bufferedBusyEnd = busy.End.AddMinutes(bufferMinutes);
            if (slotStart < bufferedBusyEnd && slotEnd > busy.Start)
            {
                return false;
            }
        }

        return true;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static BookingRulesDto BuildDefaultRules(Guid barbershopId) =>
        new(
            Id: Guid.Empty,
            BarbershopId: barbershopId,
            SlotDurationMinutes: 30,
            MaxDaysInAdvance: 30,
            MinNoticeHours: 1,
            BufferMinutes: SlotBufferMinutes.Public);

    /// <summary>A barber's scheduled working block for a given day.</summary>
    private sealed record WorkingBlock(TimeOnly Start, TimeOnly End);

    /// <summary>
    /// Holds pre-loaded schedule data. <see cref="Invalid"/> is returned when any
    /// required data is missing (no service, no working hours, or time off).
    /// </summary>
    private sealed record ScheduleContext(int DurationMinutes, WorkingBlock? Block)
    {
        public bool IsValid => Block is not null;
        public static readonly ScheduleContext Invalid = new(0, null);
    }
}
