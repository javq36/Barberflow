using Npgsql;

namespace BarberFlow.Application.Services;

/// <summary>
/// Raw-SQL implementation of <see cref="ITimeOffService"/> using Npgsql.
/// All queries are multi-tenant filtered by barbershop_id (via barber ownership check).
/// </summary>
public sealed class TimeOffService : ITimeOffService
{
    private readonly string _connectionString;

    public TimeOffService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<TimeOffDto>> GetByBarberIdAsync(
        Guid barbershopId,
        Guid barberId,
        DateOnly? from,
        DateOnly? to,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (!await BarberBelongsToBarbershopAsync(conn, barbershopId, barberId, ct))
        {
            return Array.Empty<TimeOffDto>();
        }

        var fromTs = from.HasValue ? (object)from.Value.ToDateTime(TimeOnly.MinValue) : DBNull.Value;
        var toTs = to.HasValue ? (object)to.Value.ToDateTime(TimeOnly.MaxValue) : DBNull.Value;

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, barber_id, start_date, end_date, reason
            FROM time_off
            WHERE barber_id = @barberId
              AND (@from IS NULL OR end_date >= @from)
              AND (@to IS NULL OR start_date <= @to)
            ORDER BY start_date", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("from", fromTs);
        cmd.Parameters.AddWithValue("to", toTs);

        var results = new List<TimeOffDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(MapRow(reader));
        }

        return results;
    }

    /// <inheritdoc />
    public async Task<(CreateTimeOffResult Result, TimeOffDto? Entry)> CreateAsync(
        Guid barbershopId,
        Guid barberId,
        CreateTimeOffRequest request,
        CancellationToken ct)
    {
        if (!DateOnly.TryParse(request.StartDate, out var startDate) ||
            !DateOnly.TryParse(request.EndDate, out var endDate))
        {
            return (CreateTimeOffResult.PastDate, null);
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);

        if (startDate < today)
        {
            return (CreateTimeOffResult.PastDate, null);
        }

        if (endDate < startDate)
        {
            return (CreateTimeOffResult.PastDate, null);
        }

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (!await BarberBelongsToBarbershopAsync(conn, barbershopId, barberId, ct))
        {
            return (CreateTimeOffResult.PastDate, null);
        }

        var startTs = startDate.ToDateTime(TimeOnly.MinValue);
        var endTs = endDate.ToDateTime(TimeOnly.MaxValue);

        if (await HasOverlapAsync(conn, barberId, startTs, endTs, ct))
        {
            return (CreateTimeOffResult.Overlap, null);
        }

        var id = Guid.NewGuid();

        await using var insertCmd = new NpgsqlCommand(@"
            INSERT INTO time_off (id, barber_id, start_date, end_date, reason)
            VALUES (@id, @barberId, @startDate, @endDate, @reason)", conn);

        insertCmd.Parameters.AddWithValue("id", id);
        insertCmd.Parameters.AddWithValue("barberId", barberId);
        insertCmd.Parameters.AddWithValue("startDate", startTs);
        insertCmd.Parameters.AddWithValue("endDate", endTs);
        insertCmd.Parameters.AddWithValue("reason", (object?)request.Reason ?? DBNull.Value);

        await insertCmd.ExecuteNonQueryAsync(ct);

        var entry = new TimeOffDto(id, barberId, request.StartDate, request.EndDate, request.Reason);
        return (CreateTimeOffResult.Created, entry);
    }

    /// <inheritdoc />
    public async Task<bool> DeleteAsync(
        Guid barbershopId,
        Guid barberId,
        Guid timeOffId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (!await BarberBelongsToBarbershopAsync(conn, barbershopId, barberId, ct))
        {
            return false;
        }

        await using var deleteCmd = new NpgsqlCommand(@"
            DELETE FROM time_off
            WHERE id = @id AND barber_id = @barberId", conn);

        deleteCmd.Parameters.AddWithValue("id", timeOffId);
        deleteCmd.Parameters.AddWithValue("barberId", barberId);

        var affected = await deleteCmd.ExecuteNonQueryAsync(ct);
        return affected > 0;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private static async Task<bool> BarberBelongsToBarbershopAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT 1 FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null;
    }

    private static async Task<bool> HasOverlapAsync(
        NpgsqlConnection conn,
        Guid barberId,
        DateTime startTs,
        DateTime endTs,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT 1 FROM time_off
            WHERE barber_id = @barberId
              AND start_date <= @endDate
              AND end_date >= @startDate
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("startDate", startTs);
        cmd.Parameters.AddWithValue("endDate", endTs);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null;
    }

    private static TimeOffDto MapRow(NpgsqlDataReader reader)
    {
        var id = reader.GetGuid(0);
        var barberId = reader.GetGuid(1);
        var startDate = reader.GetDateTime(2);
        var endDate = reader.GetDateTime(3);
        var reason = reader.IsDBNull(4) ? null : reader.GetString(4);

        return new TimeOffDto(
            id,
            barberId,
            DateOnly.FromDateTime(startDate).ToString("yyyy-MM-dd"),
            DateOnly.FromDateTime(endDate).ToString("yyyy-MM-dd"),
            reason);
    }
}
