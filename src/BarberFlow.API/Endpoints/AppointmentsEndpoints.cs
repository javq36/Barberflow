using System.Security.Claims;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Domain.Enums;

namespace BarberFlow.API.Endpoints;

internal static class AppointmentsEndpoints
{
    internal static IEndpointRouteBuilder MapAppointmentsEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        app.MapPost(ApiConstants.Routes.Appointments, async (CreateAppointmentRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (request.BarberId == Guid.Empty ||
                request.ServiceId == Guid.Empty ||
                request.CustomerId == Guid.Empty ||
                request.AppointmentTime == default)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentPayload });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            int durationMinutes;
            await using (var serviceCmd = new NpgsqlCommand(@"
                SELECT duration_minutes
                FROM services
                WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
                LIMIT 1", conn))
            {
                serviceCmd.Parameters.AddWithValue("serviceId", request.ServiceId);
                serviceCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var durationResult = await serviceCmd.ExecuteScalarAsync(ct);
                if (durationResult is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "service" });
                }

                durationMinutes = Convert.ToInt32(durationResult);
            }

            await using (var barberCmd = new NpgsqlCommand($@"
                SELECT 1
                FROM users
                WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber} AND active = TRUE
                LIMIT 1", conn))
            {
                barberCmd.Parameters.AddWithValue("barberId", request.BarberId);
                barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var barberExists = await barberCmd.ExecuteScalarAsync(ct);
                if (barberExists is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
                }
            }

            await using (var customerCmd = new NpgsqlCommand(@"
                SELECT 1
                FROM customers
                WHERE id = @customerId AND barbershop_id = @barbershopId AND active = TRUE
                LIMIT 1", conn))
            {
                customerCmd.Parameters.AddWithValue("customerId", request.CustomerId);
                customerCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var customerExists = await customerCmd.ExecuteScalarAsync(ct);
                if (customerExists is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "customer" });
                }
            }

            var appointmentTime = request.AppointmentTime;
            var endTime = appointmentTime.AddMinutes(durationMinutes);

            await using (var overlapCmd = new NpgsqlCommand(@"
                SELECT 1
                FROM appointments
                WHERE barbershop_id = @barbershopId
                  AND barber_id = @barberId
                  AND status IN (1, 2)
                  AND appointment_time < @endTime
                  AND end_time > @startTime
                LIMIT 1", conn))
            {
                overlapCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                overlapCmd.Parameters.AddWithValue("barberId", request.BarberId);
                overlapCmd.Parameters.AddWithValue("startTime", appointmentTime);
                overlapCmd.Parameters.AddWithValue("endTime", endTime);

                var overlap = await overlapCmd.ExecuteScalarAsync(ct);
                if (overlap is not null)
                {
                    return Results.Conflict(new { message = ApiConstants.Messages.AppointmentTimeCollision });
                }
            }

            var appointmentId = Guid.NewGuid();

            await using (var insertCmd = new NpgsqlCommand(@"
                INSERT INTO appointments (id, barbershop_id, barber_id, service_id, customer_id, appointment_time, end_time, status, notes, created_at)
                VALUES (@id, @barbershopId, @barberId, @serviceId, @customerId, @appointmentTime, @endTime, @status, @notes, NOW())", conn))
            {
                insertCmd.Parameters.AddWithValue("id", appointmentId);
                insertCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                insertCmd.Parameters.AddWithValue("barberId", request.BarberId);
                insertCmd.Parameters.AddWithValue("serviceId", request.ServiceId);
                insertCmd.Parameters.AddWithValue("customerId", request.CustomerId);
                insertCmd.Parameters.AddWithValue("appointmentTime", appointmentTime);
                insertCmd.Parameters.AddWithValue("endTime", endTime);
                insertCmd.Parameters.AddWithValue("status", 1); // Pending
                insertCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

                await insertCmd.ExecuteNonQueryAsync(ct);
            }

            return Results.Created($"{ApiConstants.Routes.Appointments}/{appointmentId}", new
            {
                id = appointmentId,
                barbershopId,
                request.BarberId,
                request.ServiceId,
                request.CustomerId,
                appointmentTime,
                endTime,
                status = 1,
                request.Notes
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.Appointments, async (ClaimsPrincipal user, DateTimeOffset? from, DateTimeOffset? to, int? status, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var fromTime = from ?? DateTimeOffset.UtcNow.AddDays(-7);
            var toTime = to ?? DateTimeOffset.UtcNow.AddDays(30);

            if (toTime <= fromTime)
            {
                return Results.BadRequest(new { message = "'to' must be greater than 'from'." });
            }

            var rows = new List<object>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT a.id, a.barber_id, a.service_id, a.customer_id, a.appointment_time, a.end_time, a.status, a.notes,
                       u.name AS barber_name, c.name AS customer_name, s.name AS service_name
                FROM appointments a
                JOIN users u ON u.id = a.barber_id
                JOIN customers c ON c.id = a.customer_id
                JOIN services s ON s.id = a.service_id
                WHERE a.barbershop_id = @barbershopId
                  AND a.appointment_time >= @fromTime
                  AND a.appointment_time < @toTime
                  AND (@status IS NULL OR a.status = @status)
                ORDER BY a.appointment_time", conn);

            cmd.Parameters.AddWithValue("barbershopId", barbershopId);
            cmd.Parameters.AddWithValue("fromTime", fromTime);
            cmd.Parameters.AddWithValue("toTime", toTime);
            cmd.Parameters.AddWithValue("status", (object?)status ?? DBNull.Value);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                rows.Add(new
                {
                    id = reader.GetGuid(0),
                    barberId = reader.GetGuid(1),
                    serviceId = reader.GetGuid(2),
                    customerId = reader.GetGuid(3),
                    appointmentTime = reader.GetFieldValue<DateTimeOffset>(4),
                    endTime = reader.GetFieldValue<DateTimeOffset>(5),
                    status = reader.GetInt32(6),
                    notes = reader.IsDBNull(7) ? null : reader.GetString(7),
                    barberName = reader.GetString(8),
                    customerName = reader.GetString(9),
                    serviceName = reader.GetString(10)
                });
            }

            return Results.Ok(rows);
        }).RequireAuthorization();

        app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsStatusSuffix}", async (
            Guid id,
            UpdateAppointmentStatusRequest request,
            ClaimsPrincipal user,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (!Enum.IsDefined(request.Status))
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentStatus });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            int currentStatus;
            await using (var getStatusCmd = new NpgsqlCommand(@"
                SELECT status
                FROM appointments
                WHERE id = @id AND barbershop_id = @barbershopId
                LIMIT 1", conn))
            {
                getStatusCmd.Parameters.AddWithValue("id", id);
                getStatusCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var result = await getStatusCmd.ExecuteScalarAsync(ct);
                if (result is null)
                {
                    return Results.NotFound();
                }

                currentStatus = Convert.ToInt32(result);
            }

            if ((currentStatus == (int)AppointmentStatus.Cancelled || currentStatus == (int)AppointmentStatus.Completed)
                && (int)request.Status != currentStatus)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeUpdated });
            }

            await using (var updateCmd = new NpgsqlCommand(@"
                UPDATE appointments
                SET status = @status,
                    notes = @notes
                WHERE id = @id AND barbershop_id = @barbershopId", conn))
            {
                updateCmd.Parameters.AddWithValue("id", id);
                updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                updateCmd.Parameters.AddWithValue("status", (int)request.Status);
                updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

                await updateCmd.ExecuteNonQueryAsync(ct);
            }

            return Results.Ok(new
            {
                id,
                status = (int)request.Status,
                notes = request.Notes
            });
        }).RequireAuthorization();

        app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsRescheduleSuffix}", async (
            Guid id,
            RescheduleAppointmentRequest request,
            ClaimsPrincipal user,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (request.AppointmentTime == default)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentPayload });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            Guid currentBarberId;
            Guid currentServiceId;
            int currentStatus;

            await using (var getCurrentCmd = new NpgsqlCommand(@"
                SELECT barber_id, service_id, status
                FROM appointments
                WHERE id = @id AND barbershop_id = @barbershopId
                LIMIT 1", conn))
            {
                getCurrentCmd.Parameters.AddWithValue("id", id);
                getCurrentCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                await using var rdr = await getCurrentCmd.ExecuteReaderAsync(ct);
                if (!await rdr.ReadAsync(ct))
                {
                    return Results.NotFound();
                }

                currentBarberId = rdr.GetGuid(0);
                currentServiceId = rdr.GetGuid(1);
                currentStatus = rdr.GetInt32(2);
            }

            if (currentStatus == 3 || currentStatus == 4)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeUpdated });
            }

            var nextBarberId = request.BarberId ?? currentBarberId;
            var nextServiceId = request.ServiceId ?? currentServiceId;

            int durationMinutes;
            await using (var serviceCmd = new NpgsqlCommand(@"
                SELECT duration_minutes
                FROM services
                WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
                LIMIT 1", conn))
            {
                serviceCmd.Parameters.AddWithValue("serviceId", nextServiceId);
                serviceCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var durationResult = await serviceCmd.ExecuteScalarAsync(ct);
                if (durationResult is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "service" });
                }

                durationMinutes = Convert.ToInt32(durationResult);
            }

            await using (var barberCmd = new NpgsqlCommand($@"
                SELECT 1
                FROM users
                WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber} AND active = TRUE
                LIMIT 1", conn))
            {
                barberCmd.Parameters.AddWithValue("barberId", nextBarberId);
                barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var barberExists = await barberCmd.ExecuteScalarAsync(ct);
                if (barberExists is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
                }
            }

            var nextStart = request.AppointmentTime;
            var nextEnd = nextStart.AddMinutes(durationMinutes);

            await using (var overlapCmd = new NpgsqlCommand(@"
                SELECT 1
                FROM appointments
                WHERE barbershop_id = @barbershopId
                  AND barber_id = @barberId
                  AND id <> @appointmentId
                  AND status IN (1, 2)
                  AND appointment_time < @endTime
                  AND end_time > @startTime
                LIMIT 1", conn))
            {
                overlapCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                overlapCmd.Parameters.AddWithValue("barberId", nextBarberId);
                overlapCmd.Parameters.AddWithValue("appointmentId", id);
                overlapCmd.Parameters.AddWithValue("startTime", nextStart);
                overlapCmd.Parameters.AddWithValue("endTime", nextEnd);

                var overlap = await overlapCmd.ExecuteScalarAsync(ct);
                if (overlap is not null)
                {
                    return Results.Conflict(new { message = ApiConstants.Messages.AppointmentRescheduleCollision });
                }
            }

            await using (var updateCmd = new NpgsqlCommand(@"
                UPDATE appointments
                SET barber_id = @barberId,
                    service_id = @serviceId,
                    appointment_time = @appointmentTime,
                    end_time = @endTime,
                    notes = @notes
                WHERE id = @id AND barbershop_id = @barbershopId", conn))
            {
                updateCmd.Parameters.AddWithValue("id", id);
                updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                updateCmd.Parameters.AddWithValue("barberId", nextBarberId);
                updateCmd.Parameters.AddWithValue("serviceId", nextServiceId);
                updateCmd.Parameters.AddWithValue("appointmentTime", nextStart);
                updateCmd.Parameters.AddWithValue("endTime", nextEnd);
                updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

                await updateCmd.ExecuteNonQueryAsync(ct);
            }

            return Results.Ok(new
            {
                id,
                barberId = nextBarberId,
                serviceId = nextServiceId,
                appointmentTime = (DateTimeOffset)nextStart,
                endTime = (DateTimeOffset)nextEnd,
                notes = request.Notes
            });
        }).RequireAuthorization();

        app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsCancelSuffix}", async (
            Guid id,
            CancelAppointmentRequest request,
            ClaimsPrincipal user,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            int currentStatus;
            await using (var getStatusCmd = new NpgsqlCommand(@"
                SELECT status
                FROM appointments
                WHERE id = @id AND barbershop_id = @barbershopId
                LIMIT 1", conn))
            {
                getStatusCmd.Parameters.AddWithValue("id", id);
                getStatusCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var result = await getStatusCmd.ExecuteScalarAsync(ct);
                if (result is null)
                {
                    return Results.NotFound();
                }

                currentStatus = Convert.ToInt32(result);
            }

            if (currentStatus == 4)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeCancelled });
            }

            await using (var updateCmd = new NpgsqlCommand(@"
                UPDATE appointments
                SET status = 3,
                    notes = @notes
                WHERE id = @id AND barbershop_id = @barbershopId", conn))
            {
                updateCmd.Parameters.AddWithValue("id", id);
                updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);
                await updateCmd.ExecuteNonQueryAsync(ct);
            }

            return Results.Ok(new
            {
                id,
                status = 3,
                notes = request.Notes
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.AvailabilitySlots, async (Guid barberId, Guid serviceId, DateOnly date, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (barberId == Guid.Empty || serviceId == Guid.Empty)
            {
                return Results.BadRequest(new { message = "barberId and serviceId are required." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            int durationMinutes;
            await using (var serviceCmd = new NpgsqlCommand(@"
                SELECT duration_minutes
                FROM services
                WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
                LIMIT 1", conn))
            {
                serviceCmd.Parameters.AddWithValue("serviceId", serviceId);
                serviceCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var durationResult = await serviceCmd.ExecuteScalarAsync(ct);
                if (durationResult is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "service" });
                }

                durationMinutes = Convert.ToInt32(durationResult);
            }

            await using (var barberCmd = new NpgsqlCommand($@"
                SELECT 1
                FROM users
                WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber} AND active = TRUE
                LIMIT 1", conn))
            {
                barberCmd.Parameters.AddWithValue("barberId", barberId);
                barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

                var barberExists = await barberCmd.ExecuteScalarAsync(ct);
                if (barberExists is null)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
                }
            }

            var dayStart = date.ToDateTime(TimeOnly.Parse("09:00"));
            var dayEnd = date.ToDateTime(TimeOnly.Parse("18:00"));
            const int slotIntervalMinutes = 30;

            var busyRanges = new List<(DateTime start, DateTime end)>();
            await using (var busyCmd = new NpgsqlCommand(@"
                SELECT appointment_time, end_time
                FROM appointments
                WHERE barbershop_id = @barbershopId
                  AND barber_id = @barberId
                  AND status IN (1, 2)
                  AND appointment_time < @dayEnd
                  AND end_time > @dayStart
                ORDER BY appointment_time", conn))
            {
                busyCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                busyCmd.Parameters.AddWithValue("barberId", barberId);
                busyCmd.Parameters.AddWithValue("dayStart", dayStart);
                busyCmd.Parameters.AddWithValue("dayEnd", dayEnd);

                await using var busyReader = await busyCmd.ExecuteReaderAsync(ct);
                while (await busyReader.ReadAsync(ct))
                {
                    busyRanges.Add((busyReader.GetDateTime(0), busyReader.GetDateTime(1)));
                }
            }

            var slots = new List<object>();

            for (var cursor = dayStart; cursor.AddMinutes(durationMinutes) <= dayEnd; cursor = cursor.AddMinutes(slotIntervalMinutes))
            {
                var proposedEnd = cursor.AddMinutes(durationMinutes);
                var overlaps = busyRanges.Any(r => cursor < r.end && proposedEnd > r.start);

                if (!overlaps)
                {
                    slots.Add(new
                    {
                        start = cursor,
                        end = proposedEnd
                    });
                }
            }

            return Results.Ok(new
            {
                barberId,
                serviceId,
                date,
                durationMinutes,
                slotIntervalMinutes,
                slots
            });
        }).RequireAuthorization();

        return app;
    }
}
