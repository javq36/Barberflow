using Npgsql;

namespace BarberFlow.Application.Services;

/// <summary>
/// Raw-SQL implementation of <see cref="IBookingRulesService"/> using Npgsql.
/// <para>
/// The DB column <c>booking_rules.buffer_minutes</c> is added by migration T09.
/// Until that migration runs, reads return the default value and writes skip the column.
/// Column existence is probed once per operation via <c>information_schema.columns</c>.
/// </para>
/// </summary>
public sealed class BookingRulesService : IBookingRulesService
{
    // ─── Sensible defaults (used when no rules row exists) ─────────────────────
    private const int DefaultSlotDurationMinutes = 30;
    private const int DefaultMaxDaysInAdvance = 30;
    private const int DefaultMinNoticeHours = 1;
    internal const int DefaultBufferMinutes = 10;

    private readonly string _connectionString;

    public BookingRulesService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <inheritdoc />
    public async Task<BookingRulesDto?> GetByBarbershopIdAsync(
        Guid barbershopId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var hasBuffer = await ColumnExistsAsync(conn, "booking_rules", "buffer_minutes", ct);
        return hasBuffer
            ? await ReadRulesWithBufferAsync(conn, barbershopId, ct)
            : await ReadRulesWithoutBufferAsync(conn, barbershopId, ct);
    }

    /// <inheritdoc />
    public async Task<BookingRulesDto> UpsertAsync(
        Guid barbershopId,
        UpsertBookingRulesRequest request,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var hasBuffer = await ColumnExistsAsync(conn, "booking_rules", "buffer_minutes", ct);
        var minNoticeMinutes = request.MinNoticeHours * 60;

        return hasBuffer
            ? await UpsertWithBufferAsync(conn, barbershopId, request, minNoticeMinutes, ct)
            : await UpsertWithoutBufferAsync(conn, barbershopId, request, minNoticeMinutes, ct);
    }

    // ─── Read helpers ─────────────────────────────────────────────────────────

    private static async Task<BookingRulesDto?> ReadRulesWithBufferAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT id, barbershop_id, slot_interval_minutes, max_days_in_future,
                   min_notice_minutes, buffer_minutes
            FROM booking_rules
            WHERE barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return BuildDefaults(barbershopId);
        }

        return new BookingRulesDto(
            Id: reader.GetGuid(0),
            BarbershopId: reader.GetGuid(1),
            SlotDurationMinutes: reader.GetInt32(2),
            MaxDaysInAdvance: reader.GetInt32(3),
            MinNoticeHours: reader.GetInt32(4) / 60,
            BufferMinutes: reader.GetInt32(5));
    }

    private static async Task<BookingRulesDto?> ReadRulesWithoutBufferAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT id, barbershop_id, slot_interval_minutes, max_days_in_future,
                   min_notice_minutes
            FROM booking_rules
            WHERE barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return BuildDefaults(barbershopId);
        }

        return new BookingRulesDto(
            Id: reader.GetGuid(0),
            BarbershopId: reader.GetGuid(1),
            SlotDurationMinutes: reader.GetInt32(2),
            MaxDaysInAdvance: reader.GetInt32(3),
            MinNoticeHours: reader.GetInt32(4) / 60,
            BufferMinutes: DefaultBufferMinutes);
    }

    // ─── Upsert helpers ───────────────────────────────────────────────────────

    private static async Task<BookingRulesDto> UpsertWithBufferAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        UpsertBookingRulesRequest request,
        int minNoticeMinutes,
        CancellationToken ct)
    {
        // Try UPDATE first; if no rows affected, INSERT
        await using var updateCmd = new NpgsqlCommand(@"
            UPDATE booking_rules
            SET slot_interval_minutes = @slotInterval,
                max_days_in_future    = @maxDays,
                min_notice_minutes    = @minNotice,
                buffer_minutes        = @buffer
            WHERE barbershop_id = @barbershopId
            RETURNING id, barbershop_id, slot_interval_minutes, max_days_in_future,
                      min_notice_minutes, buffer_minutes", conn);

        updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        updateCmd.Parameters.AddWithValue("slotInterval", request.SlotDurationMinutes);
        updateCmd.Parameters.AddWithValue("maxDays", request.MaxDaysInAdvance);
        updateCmd.Parameters.AddWithValue("minNotice", minNoticeMinutes);
        updateCmd.Parameters.AddWithValue("buffer", request.BufferMinutes);

        await using var updateReader = await updateCmd.ExecuteReaderAsync(ct);
        if (await updateReader.ReadAsync(ct))
        {
            return new BookingRulesDto(
                Id: updateReader.GetGuid(0),
                BarbershopId: updateReader.GetGuid(1),
                SlotDurationMinutes: updateReader.GetInt32(2),
                MaxDaysInAdvance: updateReader.GetInt32(3),
                MinNoticeHours: updateReader.GetInt32(4) / 60,
                BufferMinutes: updateReader.GetInt32(5));
        }

        await updateReader.DisposeAsync();

        var id = Guid.NewGuid();
        await using var insertCmd = new NpgsqlCommand(@"
            INSERT INTO booking_rules
                (id, barbershop_id, slot_interval_minutes, max_days_in_future,
                 min_notice_minutes, buffer_minutes)
            VALUES (@id, @barbershopId, @slotInterval, @maxDays, @minNotice, @buffer)
            RETURNING id, barbershop_id, slot_interval_minutes, max_days_in_future,
                      min_notice_minutes, buffer_minutes", conn);

        insertCmd.Parameters.AddWithValue("id", id);
        insertCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        insertCmd.Parameters.AddWithValue("slotInterval", request.SlotDurationMinutes);
        insertCmd.Parameters.AddWithValue("maxDays", request.MaxDaysInAdvance);
        insertCmd.Parameters.AddWithValue("minNotice", minNoticeMinutes);
        insertCmd.Parameters.AddWithValue("buffer", request.BufferMinutes);

        await using var insertReader = await insertCmd.ExecuteReaderAsync(ct);
        await insertReader.ReadAsync(ct);

        return new BookingRulesDto(
            Id: insertReader.GetGuid(0),
            BarbershopId: insertReader.GetGuid(1),
            SlotDurationMinutes: insertReader.GetInt32(2),
            MaxDaysInAdvance: insertReader.GetInt32(3),
            MinNoticeHours: insertReader.GetInt32(4) / 60,
            BufferMinutes: insertReader.GetInt32(5));
    }

    private static async Task<BookingRulesDto> UpsertWithoutBufferAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        UpsertBookingRulesRequest request,
        int minNoticeMinutes,
        CancellationToken ct)
    {
        // Try UPDATE first; if no rows affected, INSERT
        await using var updateCmd = new NpgsqlCommand(@"
            UPDATE booking_rules
            SET slot_interval_minutes = @slotInterval,
                max_days_in_future    = @maxDays,
                min_notice_minutes    = @minNotice
            WHERE barbershop_id = @barbershopId
            RETURNING id, barbershop_id, slot_interval_minutes, max_days_in_future,
                      min_notice_minutes", conn);

        updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        updateCmd.Parameters.AddWithValue("slotInterval", request.SlotDurationMinutes);
        updateCmd.Parameters.AddWithValue("maxDays", request.MaxDaysInAdvance);
        updateCmd.Parameters.AddWithValue("minNotice", minNoticeMinutes);

        await using var updateReader = await updateCmd.ExecuteReaderAsync(ct);
        if (await updateReader.ReadAsync(ct))
        {
            return new BookingRulesDto(
                Id: updateReader.GetGuid(0),
                BarbershopId: updateReader.GetGuid(1),
                SlotDurationMinutes: updateReader.GetInt32(2),
                MaxDaysInAdvance: updateReader.GetInt32(3),
                MinNoticeHours: updateReader.GetInt32(4) / 60,
                BufferMinutes: request.BufferMinutes);
        }

        await updateReader.DisposeAsync();

        var id = Guid.NewGuid();
        await using var insertCmd = new NpgsqlCommand(@"
            INSERT INTO booking_rules
                (id, barbershop_id, slot_interval_minutes, max_days_in_future, min_notice_minutes)
            VALUES (@id, @barbershopId, @slotInterval, @maxDays, @minNotice)
            RETURNING id, barbershop_id, slot_interval_minutes, max_days_in_future,
                      min_notice_minutes", conn);

        insertCmd.Parameters.AddWithValue("id", id);
        insertCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        insertCmd.Parameters.AddWithValue("slotInterval", request.SlotDurationMinutes);
        insertCmd.Parameters.AddWithValue("maxDays", request.MaxDaysInAdvance);
        insertCmd.Parameters.AddWithValue("minNotice", minNoticeMinutes);

        await using var insertReader = await insertCmd.ExecuteReaderAsync(ct);
        await insertReader.ReadAsync(ct);

        return new BookingRulesDto(
            Id: insertReader.GetGuid(0),
            BarbershopId: insertReader.GetGuid(1),
            SlotDurationMinutes: insertReader.GetInt32(2),
            MaxDaysInAdvance: insertReader.GetInt32(3),
            MinNoticeHours: insertReader.GetInt32(4) / 60,
            BufferMinutes: request.BufferMinutes);
    }

    // ─── Shared helpers ───────────────────────────────────────────────────────

    private static async Task<bool> ColumnExistsAsync(
        NpgsqlConnection conn,
        string table,
        string column,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT 1 FROM information_schema.columns
            WHERE table_name = @table AND column_name = @column
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("table", table);
        cmd.Parameters.AddWithValue("column", column);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null;
    }

    private static BookingRulesDto BuildDefaults(Guid barbershopId) =>
        new(
            Id: Guid.Empty,
            BarbershopId: barbershopId,
            SlotDurationMinutes: DefaultSlotDurationMinutes,
            MaxDaysInAdvance: DefaultMaxDaysInAdvance,
            MinNoticeHours: DefaultMinNoticeHours,
            BufferMinutes: DefaultBufferMinutes);
}
