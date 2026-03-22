using BarberFlow.Domain.Enums;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Application.Services;

/// <summary>
/// Raw-SQL implementation of <see cref="IBookingService"/> using Npgsql.
/// All writes are multi-tenant scoped via barbershop_id.
/// The status state machine is: Pending(1) → Confirmed(2) → Completed(4).
/// Any status may transition to Cancelled(3) unless the appointment is already Completed.
/// </summary>
public sealed class BookingService : IBookingService
{
    private readonly string _connectionString;

    public BookingService(string connectionString)
    {
        _connectionString = connectionString;
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<AppointmentResult> CreateAppointmentAsync(
        Guid barbershopId,
        CreateAppointmentCommand command,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var durationMinutes = await GetServiceDurationAsync(conn, barbershopId, command.ServiceId, ct);
        if (durationMinutes is null)
        {
            return AppointmentResult.Failure("invalid_service",
                "Resource does not belong to this barbershop or is inactive.");
        }

        var barberOk = await BarberBelongsToBarbershopAsync(conn, barbershopId, command.BarberId, ct);
        if (!barberOk)
        {
            return AppointmentResult.Failure("invalid_barber",
                "Resource does not belong to this barbershop or is inactive.");
        }

        var customerOk = await CustomerBelongsToBarbershopAsync(conn, barbershopId, command.CustomerId, ct);
        if (!customerOk)
        {
            return AppointmentResult.Failure("invalid_customer",
                "Resource does not belong to this barbershop or is inactive.");
        }

        var endTime = command.AppointmentTime.AddMinutes(durationMinutes.Value);
        var hasOverlap = await HasOverlapAsync(
            conn, barbershopId, command.BarberId,
            excludeId: null,
            command.AppointmentTime, endTime, ct);

        if (hasOverlap)
        {
            return AppointmentResult.Failure("conflict",
                "Barber is not available at the selected time.");
        }

        var appointmentId = await InsertAppointmentAsync(
            conn, barbershopId,
            command.BarberId, command.ServiceId, command.CustomerId,
            command.AppointmentTime, endTime, command.Notes, ct);

        return AppointmentResult.Success(appointmentId);
    }

    // ─── Reschedule ───────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<AppointmentResult> RescheduleAppointmentAsync(
        Guid barbershopId,
        RescheduleAppointmentCommand command,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var current = await GetCurrentAppointmentAsync(conn, barbershopId, command.AppointmentId, ct);
        if (current is null)
        {
            return AppointmentResult.Failure("not_found", "Appointment not found.");
        }

        if (current.Status is 3 or 4)
        {
            return AppointmentResult.Failure("invalid_state",
                "Appointment cannot be updated in its current state.");
        }

        var nextBarberId = command.BarberId ?? current.BarberId;
        var nextServiceId = command.ServiceId ?? current.ServiceId;

        var durationMinutes = await GetServiceDurationAsync(conn, barbershopId, nextServiceId, ct);
        if (durationMinutes is null)
        {
            return AppointmentResult.Failure("invalid_service",
                "Resource does not belong to this barbershop or is inactive.");
        }

        var barberOk = await BarberBelongsToBarbershopAsync(conn, barbershopId, nextBarberId, ct);
        if (!barberOk)
        {
            return AppointmentResult.Failure("invalid_barber",
                "Resource does not belong to this barbershop or is inactive.");
        }

        var nextEnd = command.NewAppointmentTime.AddMinutes(durationMinutes.Value);
        var hasOverlap = await HasOverlapAsync(
            conn, barbershopId, nextBarberId,
            excludeId: command.AppointmentId,
            command.NewAppointmentTime, nextEnd, ct);

        if (hasOverlap)
        {
            return AppointmentResult.Failure("conflict",
                "Barber is not available at the selected reschedule time.");
        }

        await UpdateRescheduleAsync(
            conn, barbershopId, command.AppointmentId,
            nextBarberId, nextServiceId,
            command.NewAppointmentTime, nextEnd, command.Notes, ct);

        return AppointmentResult.Success(command.AppointmentId);
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<AppointmentResult> CancelAppointmentAsync(
        Guid barbershopId,
        CancelAppointmentCommand command,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var currentStatus = await GetCurrentStatusAsync(conn, barbershopId, command.AppointmentId, ct);
        if (currentStatus is null)
        {
            return AppointmentResult.Failure("not_found", "Appointment not found.");
        }

        if (currentStatus == (int)AppointmentStatus.Completed)
        {
            return AppointmentResult.Failure("already_completed",
                "Appointment cannot be cancelled in its current state.");
        }

        await SetCancelledAsync(conn, barbershopId, command.AppointmentId, command.Notes, ct);
        return AppointmentResult.Success(command.AppointmentId);
    }

    // ─── Status update ────────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<AppointmentResult> UpdateStatusAsync(
        Guid barbershopId,
        UpdateAppointmentStatusCommand command,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var currentStatus = await GetCurrentStatusAsync(conn, barbershopId, command.AppointmentId, ct);
        if (currentStatus is null)
        {
            return AppointmentResult.Failure("not_found", "Appointment not found.");
        }

        if (IsTerminalAndChanging(currentStatus.Value, (int)command.Status))
        {
            return AppointmentResult.Failure("invalid_state",
                "Appointment cannot be updated in its current state.");
        }

        await SetStatusAsync(conn, barbershopId, command.AppointmentId, (int)command.Status, command.Notes, ct);
        return AppointmentResult.Success(command.AppointmentId);
    }

    // ─── Get appointments ─────────────────────────────────────────────────────

    /// <inheritdoc />
    public async Task<IReadOnlyList<AppointmentDto>> GetAppointmentsAsync(
        Guid barbershopId,
        GetAppointmentsQuery query,
        CancellationToken ct)
    {
        var fromTime = query.From ?? DateTimeOffset.UtcNow.AddDays(-7);
        var toTime = query.To ?? DateTimeOffset.UtcNow.AddDays(30);

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        return await QueryAppointmentsAsync(conn, barbershopId, fromTime, toTime, query.Status, query.BarberId, ct);
    }

    // ─── SQL helpers — reads ──────────────────────────────────────────────────

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

        cmd.Parameters.Add(new NpgsqlParameter("serviceId", NpgsqlDbType.Uuid) { Value = serviceId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is null ? null : Convert.ToInt32(result);
    }

    private static async Task<bool> BarberBelongsToBarbershopAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand($@"
            SELECT 1
            FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId
              AND role = {(int)UserRole.Barber} AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        return await cmd.ExecuteScalarAsync(ct) is not null;
    }

    private static async Task<bool> CustomerBelongsToBarbershopAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid customerId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT 1
            FROM customers
            WHERE id = @customerId AND barbershop_id = @barbershopId AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("customerId", NpgsqlDbType.Uuid) { Value = customerId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        return await cmd.ExecuteScalarAsync(ct) is not null;
    }

    private static async Task<bool> HasOverlapAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        Guid? excludeId,
        DateTimeOffset startTime,
        DateTimeOffset endTime,
        CancellationToken ct)
    {
        var sql = excludeId.HasValue
            ? @"SELECT 1 FROM appointments
                WHERE barbershop_id = @barbershopId
                  AND barber_id = @barberId
                  AND id <> @excludeId
                  AND status IN (1, 2)
                  AND appointment_time < @endTime
                  AND end_time > @startTime
                LIMIT 1"
            : @"SELECT 1 FROM appointments
                WHERE barbershop_id = @barbershopId
                  AND barber_id = @barberId
                  AND status IN (1, 2)
                  AND appointment_time < @endTime
                  AND end_time > @startTime
                LIMIT 1";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("startTime", NpgsqlDbType.TimestampTz) { Value = startTime });
        cmd.Parameters.Add(new NpgsqlParameter("endTime", NpgsqlDbType.TimestampTz) { Value = endTime });

        if (excludeId.HasValue)
        {
            cmd.Parameters.Add(new NpgsqlParameter("excludeId", NpgsqlDbType.Uuid) { Value = excludeId.Value });
        }

        return await cmd.ExecuteScalarAsync(ct) is not null;
    }

    private static async Task<int?> GetCurrentStatusAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT status
            FROM appointments
            WHERE id = @id AND barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is null ? null : Convert.ToInt32(result);
    }

    private sealed record CurrentAppointment(Guid BarberId, Guid ServiceId, int Status);

    private static async Task<CurrentAppointment?> GetCurrentAppointmentAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT barber_id, service_id, status
            FROM appointments
            WHERE id = @id AND barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new CurrentAppointment(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetInt32(2));
    }

    private static async Task<IReadOnlyList<AppointmentDto>> QueryAppointmentsAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        DateTimeOffset from,
        DateTimeOffset to,
        int? status,
        Guid? barberId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT a.id, a.barber_id, a.service_id, a.customer_id,
                   a.appointment_time, a.end_time, a.status, a.notes,
                   u.name AS barber_name, c.name AS customer_name, s.name AS service_name
            FROM appointments a
            JOIN users u ON u.id = a.barber_id
            JOIN customers c ON c.id = a.customer_id
            JOIN services s ON s.id = a.service_id
            WHERE a.barbershop_id = @barbershopId
              AND a.appointment_time >= @fromTime
              AND a.appointment_time < @toTime
              AND (@status IS NULL OR a.status = @status)
              AND (@barberId IS NULL OR a.barber_id = @barberId)
            ORDER BY a.appointment_time", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("fromTime", NpgsqlDbType.TimestampTz) { Value = from });
        cmd.Parameters.Add(new NpgsqlParameter("toTime", NpgsqlDbType.TimestampTz) { Value = to });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer) { Value = (object?)status ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = (object?)barberId ?? DBNull.Value });

        var results = new List<AppointmentDto>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new AppointmentDto(
                Id: reader.GetGuid(0),
                BarberId: reader.GetGuid(1),
                ServiceId: reader.GetGuid(2),
                CustomerId: reader.GetGuid(3),
                AppointmentTime: reader.GetFieldValue<DateTimeOffset>(4),
                EndTime: reader.GetFieldValue<DateTimeOffset>(5),
                Status: reader.GetInt32(6),
                Notes: reader.IsDBNull(7) ? null : reader.GetString(7),
                BarberName: reader.GetString(8),
                CustomerName: reader.GetString(9),
                ServiceName: reader.GetString(10)));
        }

        return results;
    }

    // ─── SQL helpers — writes ─────────────────────────────────────────────────

    private static async Task<Guid> InsertAppointmentAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid barberId,
        Guid serviceId,
        Guid customerId,
        DateTimeOffset appointmentTime,
        DateTimeOffset endTime,
        string? notes,
        CancellationToken ct)
    {
        var id = Guid.NewGuid();

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO appointments
                (id, barbershop_id, barber_id, service_id, customer_id,
                 appointment_time, end_time, status, notes, created_at)
            VALUES
                (@id, @barbershopId, @barberId, @serviceId, @customerId,
                 @appointmentTime, @endTime, @status, @notes, NOW())", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("serviceId", NpgsqlDbType.Uuid) { Value = serviceId });
        cmd.Parameters.Add(new NpgsqlParameter("customerId", NpgsqlDbType.Uuid) { Value = customerId });
        cmd.Parameters.Add(new NpgsqlParameter("appointmentTime", NpgsqlDbType.TimestampTz) { Value = appointmentTime });
        cmd.Parameters.Add(new NpgsqlParameter("endTime", NpgsqlDbType.TimestampTz) { Value = endTime });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer) { Value = 1 }); // Pending
        cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)notes?.Trim() ?? DBNull.Value });

        await cmd.ExecuteNonQueryAsync(ct);
        return id;
    }

    private static async Task UpdateRescheduleAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        Guid barberId,
        Guid serviceId,
        DateTimeOffset appointmentTime,
        DateTimeOffset endTime,
        string? notes,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET barber_id = @barberId,
                service_id = @serviceId,
                appointment_time = @appointmentTime,
                end_time = @endTime,
                notes = @notes
            WHERE id = @id AND barbershop_id = @barbershopId", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("serviceId", NpgsqlDbType.Uuid) { Value = serviceId });
        cmd.Parameters.Add(new NpgsqlParameter("appointmentTime", NpgsqlDbType.TimestampTz) { Value = appointmentTime });
        cmd.Parameters.Add(new NpgsqlParameter("endTime", NpgsqlDbType.TimestampTz) { Value = endTime });
        cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)notes?.Trim() ?? DBNull.Value });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetCancelledAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        string? notes,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET status = 3, notes = @notes
            WHERE id = @id AND barbershop_id = @barbershopId", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)notes?.Trim() ?? DBNull.Value });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task SetStatusAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        int status,
        string? notes,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET status = @status, notes = @notes
            WHERE id = @id AND barbershop_id = @barbershopId", conn);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer) { Value = status });
        cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)notes?.Trim() ?? DBNull.Value });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── State machine helpers ────────────────────────────────────────────────

    /// <summary>
    /// Returns true when a terminal state (Cancelled=3 or Completed=4) is being changed
    /// to a DIFFERENT status — which is not allowed by the state machine.
    /// </summary>
    private static bool IsTerminalAndChanging(int currentStatus, int newStatus)
    {
        var isTerminal = currentStatus is (int)AppointmentStatus.Cancelled
                                       or (int)AppointmentStatus.Completed;
        return isTerminal && currentStatus != newStatus;
    }
}
