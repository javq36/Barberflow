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
    private readonly IWhatsAppOutboxService? _whatsAppOutbox;

    public BookingService(string connectionString, IWhatsAppOutboxService? whatsAppOutbox = null)
    {
        _connectionString = connectionString;
        _whatsAppOutbox = whatsAppOutbox;
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

        var validation = await ValidateCreateCommandAsync(conn, barbershopId, command, ct);
        if (validation.Error is not null)
        {
            return validation.Error;
        }

        var customerInfo = await GetCustomerOptInAsync(conn, barbershopId, command.CustomerId, ct);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            var appointmentId = await InsertAppointmentAsync(
                conn, tx, barbershopId,
                command.BarberId, command.ServiceId, command.CustomerId,
                command.AppointmentTime, validation.EndTime, command.Notes, ct);

            await TryEnqueueConfirmationAsync(
                conn, tx, barbershopId, customerInfo,
                command.BarberId, command.ServiceId, command.AppointmentTime, ct);

            await tx.CommitAsync(ct);
            return AppointmentResult.Success(appointmentId);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private sealed record CreateValidationResult(DateTimeOffset EndTime, AppointmentResult? Error);

    private static async Task<CreateValidationResult> ValidateCreateCommandAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        CreateAppointmentCommand command,
        CancellationToken ct)
    {
        var durationMinutes = await GetServiceDurationAsync(conn, barbershopId, command.ServiceId, ct);
        if (durationMinutes is null)
        {
            return new CreateValidationResult(default,
                AppointmentResult.Failure("invalid_service",
                    "Resource does not belong to this barbershop or is inactive."));
        }

        var barberOk = await BarberBelongsToBarbershopAsync(conn, barbershopId, command.BarberId, ct);
        if (!barberOk)
        {
            return new CreateValidationResult(default,
                AppointmentResult.Failure("invalid_barber",
                    "Resource does not belong to this barbershop or is inactive."));
        }

        var customerOk = await CustomerBelongsToBarbershopAsync(conn, barbershopId, command.CustomerId, ct);
        if (!customerOk)
        {
            return new CreateValidationResult(default,
                AppointmentResult.Failure("invalid_customer",
                    "Resource does not belong to this barbershop or is inactive."));
        }

        var endTime = command.AppointmentTime.AddMinutes(durationMinutes.Value);
        var hasOverlap = await HasOverlapAsync(
            conn, barbershopId, command.BarberId,
            excludeId: null,
            command.AppointmentTime, endTime, ct);

        if (hasOverlap)
        {
            return new CreateValidationResult(default,
                AppointmentResult.Failure("conflict",
                    "Barber is not available at the selected time."));
        }

        return new CreateValidationResult(endTime, null);
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

        var validation = await ValidateRescheduleCommandAsync(conn, barbershopId, command, ct);
        if (validation.Error is not null)
        {
            return validation.Error;
        }

        var customerInfo = await GetCustomerOptInForAppointmentAsync(conn, barbershopId, command.AppointmentId, ct);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            await UpdateRescheduleAsync(
                conn, tx, barbershopId, command.AppointmentId,
                validation.NextBarberId, validation.NextServiceId,
                command.NewAppointmentTime, validation.NextEnd, command.Notes, ct);

            // Enqueue a new confirmation for the rescheduled time if customer is opted in.
            await TryEnqueueConfirmationAsync(
                conn, tx, barbershopId, customerInfo,
                validation.NextBarberId, validation.NextServiceId, command.NewAppointmentTime, ct);

            await tx.CommitAsync(ct);
            return AppointmentResult.Success(command.AppointmentId);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private sealed record RescheduleValidationResult(
        Guid NextBarberId, Guid NextServiceId, DateTimeOffset NextEnd, AppointmentResult? Error);

    private static async Task<RescheduleValidationResult> ValidateRescheduleCommandAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        RescheduleAppointmentCommand command,
        CancellationToken ct)
    {
        var current = await GetCurrentAppointmentAsync(conn, barbershopId, command.AppointmentId, ct);
        if (current is null)
        {
            return new RescheduleValidationResult(default, default, default,
                AppointmentResult.Failure("not_found", "Appointment not found."));
        }

        if (current.Status is 3 or 4)
        {
            return new RescheduleValidationResult(default, default, default,
                AppointmentResult.Failure("invalid_state",
                    "Appointment cannot be updated in its current state."));
        }

        var nextBarberId = command.BarberId ?? current.BarberId;
        var nextServiceId = command.ServiceId ?? current.ServiceId;

        var resourceCheck = await ValidateRescheduleResourcesAsync(
            conn, barbershopId, nextBarberId, nextServiceId, command, ct);

        return resourceCheck;
    }

    /// <summary>
    /// Validates barber/service membership and time-slot availability for a reschedule.
    /// Returns a failure result on the first violation, or a success result with computed values.
    /// </summary>
    private static async Task<RescheduleValidationResult> ValidateRescheduleResourcesAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid nextBarberId,
        Guid nextServiceId,
        RescheduleAppointmentCommand command,
        CancellationToken ct)
    {
        var durationMinutes = await GetServiceDurationAsync(conn, barbershopId, nextServiceId, ct);
        if (durationMinutes is null)
        {
            return new RescheduleValidationResult(default, default, default,
                AppointmentResult.Failure("invalid_service",
                    "Resource does not belong to this barbershop or is inactive."));
        }

        var barberOk = await BarberBelongsToBarbershopAsync(conn, barbershopId, nextBarberId, ct);
        if (!barberOk)
        {
            return new RescheduleValidationResult(default, default, default,
                AppointmentResult.Failure("invalid_barber",
                    "Resource does not belong to this barbershop or is inactive."));
        }

        var nextEnd = command.NewAppointmentTime.AddMinutes(durationMinutes.Value);
        var hasOverlap = await HasOverlapAsync(
            conn, barbershopId, nextBarberId,
            excludeId: command.AppointmentId,
            command.NewAppointmentTime, nextEnd, ct);

        if (hasOverlap)
        {
            return new RescheduleValidationResult(default, default, default,
                AppointmentResult.Failure("conflict",
                    "Barber is not available at the selected reschedule time."));
        }

        return new RescheduleValidationResult(nextBarberId, nextServiceId, nextEnd, null);
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

        // Fetch customer opt-in before the transaction.
        var customerInfo = await GetCustomerOptInForAppointmentAsync(conn, barbershopId, command.AppointmentId, ct);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            await SetCancelledAsync(conn, tx, barbershopId, command.AppointmentId, command.Notes, ct);

            await TryEnqueueCancellationAsync(
                conn, tx, barbershopId, command.AppointmentId, customerInfo, ct);

            await tx.CommitAsync(ct);
            return AppointmentResult.Success(command.AppointmentId);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
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

        // When transitioning to Cancelled, use a transaction so the status update
        // and the WhatsApp outbox insert are atomic (same pattern as CancelAppointmentAsync).
        if (command.Status == AppointmentStatus.Cancelled)
        {
            return await UpdateStatusWithCancellationNotificationAsync(
                conn, barbershopId, command, ct);
        }

        await SetStatusAsync(conn, barbershopId, command.AppointmentId, (int)command.Status, command.Notes, ct);
        return AppointmentResult.Success(command.AppointmentId);
    }

    private async Task<AppointmentResult> UpdateStatusWithCancellationNotificationAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        UpdateAppointmentStatusCommand command,
        CancellationToken ct)
    {
        // Fetch customer opt-in before the transaction.
        var customerInfo = await GetCustomerOptInForAppointmentAsync(conn, barbershopId, command.AppointmentId, ct);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            await SetStatusInTxAsync(conn, tx, barbershopId, command.AppointmentId, (int)command.Status, command.Notes, ct);

            await TryEnqueueCancellationAsync(
                conn, tx, barbershopId, command.AppointmentId, customerInfo, ct);

            await tx.CommitAsync(ct);
            return AppointmentResult.Success(command.AppointmentId);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
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
        NpgsqlTransaction tx,
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
                 @appointmentTime, @endTime, @status, @notes, NOW())", conn, tx);

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
        NpgsqlTransaction tx,
        Guid barbershopId,
        Guid appointmentId,
        Guid barberId,
        Guid serviceId,
        DateTimeOffset appointmentTime,
        DateTimeOffset endTime,
        string? notes,
        CancellationToken ct)
    {
        // Reset reminder_sent_at so the reminder service picks up the new time.
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET barber_id = @barberId,
                service_id = @serviceId,
                appointment_time = @appointmentTime,
                end_time = @endTime,
                notes = @notes,
                reminder_sent_at = NULL
            WHERE id = @id AND barbershop_id = @barbershopId", conn, tx);

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
        NpgsqlTransaction tx,
        Guid barbershopId,
        Guid appointmentId,
        string? notes,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET status = 3, notes = @notes
            WHERE id = @id AND barbershop_id = @barbershopId", conn, tx);

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

    private static async Task SetStatusInTxAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barbershopId,
        Guid appointmentId,
        int status,
        string? notes,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET status = @status, notes = @notes
            WHERE id = @id AND barbershop_id = @barbershopId", conn, tx);

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

    // ─── WhatsApp notification helpers ───────────────────────────────────────

    /// <summary>
    /// Enqueues a booking confirmation/reschedule confirmation outbox row if the customer
    /// is opted in and has a valid phone. No-op if <see cref="_whatsAppOutbox"/> is null
    /// or customer is not opted in.
    /// </summary>
    private async Task TryEnqueueConfirmationAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barbershopId,
        CustomerOptInInfo? customerInfo,
        Guid barberId,
        Guid serviceId,
        DateTimeOffset appointmentTime,
        CancellationToken ct)
    {
        if (_whatsAppOutbox is null
            || customerInfo is not { OptInWhatsApp: true }
            || string.IsNullOrWhiteSpace(customerInfo.Phone))
        {
            return;
        }

        var barbershopName = await GetBarbershopNameAsync(conn, tx, barbershopId, ct);
        var barberName = await GetBarberNameAsync(conn, tx, barberId, ct);
        var serviceName = await GetServiceNameAsync(conn, tx, serviceId, ct);

        await _whatsAppOutbox.EnqueueAsync(
            connection: conn,
            barbershopId: barbershopId,
            customerPhone: customerInfo.Phone,
            templateName: BarberFlow.Domain.Enums.WhatsAppTemplateName.AppointmentConfirmation,
            templateVariables: new Dictionary<string, string>
            {
                ["customer_name"] = customerInfo.Name,
                ["barbershop_name"] = barbershopName,
                ["appointment_date"] = appointmentTime.ToString("yyyy-MM-dd"),
                ["appointment_time"] = appointmentTime.ToString("HH:mm"),
                ["barber_name"] = barberName,
                ["service_name"] = serviceName
            },
            transaction: tx,
            ct: ct);
    }

    /// <summary>
    /// Enqueues a cancellation outbox row if the customer is opted in and has a valid phone.
    /// No-op if <see cref="_whatsAppOutbox"/> is null or customer is not opted in.
    /// </summary>
    private async Task TryEnqueueCancellationAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barbershopId,
        Guid appointmentId,
        CustomerOptInInfo? customerInfo,
        CancellationToken ct)
    {
        if (_whatsAppOutbox is null
            || customerInfo is not { OptInWhatsApp: true }
            || string.IsNullOrWhiteSpace(customerInfo.Phone))
        {
            return;
        }

        var barbershopName = await GetBarbershopNameAsync(conn, tx, barbershopId, ct);
        var appointmentTime = await GetAppointmentTimeAsync(conn, tx, barbershopId, appointmentId, ct);

        await _whatsAppOutbox.EnqueueAsync(
            connection: conn,
            barbershopId: barbershopId,
            customerPhone: customerInfo.Phone,
            templateName: BarberFlow.Domain.Enums.WhatsAppTemplateName.AppointmentCancellation,
            templateVariables: new Dictionary<string, string>
            {
                ["customer_name"] = customerInfo.Name,
                ["barbershop_name"] = barbershopName,
                ["appointment_date"] = appointmentTime.ToString("yyyy-MM-dd"),
                ["appointment_time"] = appointmentTime.ToString("HH:mm")
            },
            transaction: tx,
            ct: ct);
    }

    // ─── WhatsApp opt-in helpers ──────────────────────────────────────────────

    private sealed record CustomerOptInInfo(bool OptInWhatsApp, string? Phone, string Name);

    /// <summary>
    /// Returns customer opt-in status and phone for a given customer.
    /// Returns null if the customer is not found or does not belong to the barbershop.
    /// </summary>
    private static async Task<CustomerOptInInfo?> GetCustomerOptInAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid customerId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT opt_in_whatsapp, phone, name
            FROM customers
            WHERE id = @customerId AND barbershop_id = @barbershopId AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("customerId", NpgsqlDbType.Uuid) { Value = customerId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new CustomerOptInInfo(
            OptInWhatsApp: reader.GetBoolean(0),
            Phone: reader.IsDBNull(1) ? null : reader.GetString(1),
            Name: reader.GetString(2));
    }

    /// <summary>
    /// Returns customer opt-in status and phone for the customer linked to the given appointment.
    /// Returns null if not found.
    /// </summary>
    private static async Task<CustomerOptInInfo?> GetCustomerOptInForAppointmentAsync(
        NpgsqlConnection conn,
        Guid barbershopId,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT c.opt_in_whatsapp, c.phone, c.name
            FROM appointments a
            JOIN customers c ON c.id = a.customer_id
            WHERE a.id = @appointmentId AND a.barbershop_id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("appointmentId", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new CustomerOptInInfo(
            OptInWhatsApp: reader.GetBoolean(0),
            Phone: reader.IsDBNull(1) ? null : reader.GetString(1),
            Name: reader.GetString(2));
    }

    private static async Task<string> GetBarbershopNameAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barbershopId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT name FROM barbershops WHERE id = @id LIMIT 1", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is string name ? name : string.Empty;
    }

    private static async Task<string> GetBarberNameAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barberId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT name FROM users WHERE id = @id LIMIT 1", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = barberId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is string name ? name : string.Empty;
    }

    private static async Task<string> GetServiceNameAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid serviceId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT name FROM services WHERE id = @id LIMIT 1", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = serviceId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is string name ? name : string.Empty;
    }

    private static async Task<DateTimeOffset> GetAppointmentTimeAsync(
        NpgsqlConnection conn,
        NpgsqlTransaction tx,
        Guid barbershopId,
        Guid appointmentId,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT appointment_time FROM appointments
            WHERE id = @id AND barbershop_id = @barbershopId LIMIT 1", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is DateTimeOffset dto ? dto : DateTimeOffset.UtcNow;
    }
}
