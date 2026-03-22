using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Application.Services;

/// <summary>
/// Concrete implementation of <see cref="IWorkingHoursService"/> using raw SQL via Npgsql.
/// Multi-tenant isolation is enforced by JOIN-ing through the users table to verify
/// barber_id belongs to the caller's barbershop.
/// </summary>
public sealed class WorkingHoursService : IWorkingHoursService
{
    private readonly string _connectionString;

    public WorkingHoursService(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<WorkingHourDto>> GetByBarberIdAsync(
        Guid barbershopId,
        Guid barberId,
        CancellationToken ct)
    {
        // Verify the barber belongs to this barbershop via users table
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var checkCmd = new NpgsqlCommand(@"
            SELECT 1 FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId AND active = TRUE
            LIMIT 1", conn);
        checkCmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        checkCmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var exists = await checkCmd.ExecuteScalarAsync(ct);
        if (exists is null)
        {
            return Array.Empty<WorkingHourDto>();
        }

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, barber_id, day_of_week, start_time, end_time, is_active
            FROM working_hours
            WHERE barber_id = @barberId
            ORDER BY day_of_week, start_time", conn);
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });

        var results = new List<WorkingHourDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new WorkingHourDto(
                Id: reader.GetGuid(0),
                BarberId: reader.GetGuid(1),
                DayOfWeek: reader.GetInt32(2),
                StartTime: reader.GetTimeSpan(3).ToString(@"hh\:mm"),
                EndTime: reader.GetTimeSpan(4).ToString(@"hh\:mm"),
                IsActive: reader.GetBoolean(5)));
        }

        return results;
    }

    /// <inheritdoc />
    public async Task<WorkingHourDto> UpsertAsync(
        Guid barbershopId,
        Guid barberId,
        UpsertWorkingHourRequest request,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Verify barber belongs to this barbershop
        await using var checkCmd = new NpgsqlCommand(@"
            SELECT 1 FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId AND active = TRUE
            LIMIT 1", conn);
        checkCmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        checkCmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var exists = await checkCmd.ExecuteScalarAsync(ct);
        if (exists is null)
        {
            throw new KeyNotFoundException($"Barber {barberId} not found in barbershop {barbershopId}.");
        }

        if (!TimeSpan.TryParse(request.StartTime, out var start) ||
            !TimeSpan.TryParse(request.EndTime, out var end))
        {
            throw new ArgumentException("start_time and end_time must be in HH:mm format.");
        }

        if (end <= start)
        {
            throw new ArgumentException("end_time must be after start_time.");
        }

        if (request.DayOfWeek < 0 || request.DayOfWeek > 6)
        {
            throw new ArgumentOutOfRangeException(nameof(request), "day_of_week must be between 0 and 6.");
        }

        // Upsert: on conflict for (barber_id, day_of_week), update times and is_active
        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO working_hours (id, barber_id, day_of_week, start_time, end_time, is_active)
            VALUES (@id, @barberId, @dayOfWeek, @startTime, @endTime, @isActive)
            ON CONFLICT (barber_id, day_of_week)
            DO UPDATE SET
                start_time = EXCLUDED.start_time,
                end_time   = EXCLUDED.end_time,
                is_active  = EXCLUDED.is_active
            RETURNING id, barber_id, day_of_week, start_time, end_time, is_active", conn);

        var newId = Guid.NewGuid();
        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = newId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("dayOfWeek", NpgsqlDbType.Integer) { Value = request.DayOfWeek });
        cmd.Parameters.Add(new NpgsqlParameter("startTime", NpgsqlDbType.Time) { Value = start });
        cmd.Parameters.Add(new NpgsqlParameter("endTime", NpgsqlDbType.Time) { Value = end });
        cmd.Parameters.Add(new NpgsqlParameter("isActive", NpgsqlDbType.Boolean) { Value = request.IsActive });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);

        return new WorkingHourDto(
            Id: reader.GetGuid(0),
            BarberId: reader.GetGuid(1),
            DayOfWeek: reader.GetInt32(2),
            StartTime: reader.GetTimeSpan(3).ToString(@"hh\:mm"),
            EndTime: reader.GetTimeSpan(4).ToString(@"hh\:mm"),
            IsActive: reader.GetBoolean(5));
    }

    /// <inheritdoc />
    public async Task<bool> DeleteAsync(
        Guid barbershopId,
        Guid barberId,
        Guid workingHourId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        // Delete only if barber belongs to this barbershop (tenant isolation via JOIN)
        await using var cmd = new NpgsqlCommand(@"
            DELETE FROM working_hours wh
            USING users u
            WHERE wh.id = @workingHourId
              AND wh.barber_id = @barberId
              AND wh.barber_id = u.id
              AND u.barbershop_id = @barbershopId", conn);

        cmd.Parameters.Add(new NpgsqlParameter("workingHourId", NpgsqlDbType.Uuid) { Value = workingHourId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var affected = await cmd.ExecuteNonQueryAsync(ct);
        return affected > 0;
    }
}
