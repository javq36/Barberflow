using System.Security.Claims;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;

namespace BarberFlow.API.Endpoints;

internal static class AppointmentsEndpoints
{
    internal static IEndpointRouteBuilder MapAppointmentsEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        // POST /appointments
        app.MapPost(ApiConstants.Routes.Appointments, async (
            CreateAppointmentRequest request,
            ClaimsPrincipal user,
            IBookingService bookingService,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(
                    title: ApiConstants.Messages.OwnerOnlyAction,
                    statusCode: StatusCodes.Status403Forbidden);
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

            var command = new CreateAppointmentCommand(
                request.BarberId,
                request.ServiceId,
                request.CustomerId,
                new DateTimeOffset(request.AppointmentTime, TimeSpan.Zero),
                request.Notes);

            var result = await bookingService.CreateAppointmentAsync(barbershopId, command, ct);

            if (!result.IsSuccess)
            {
                return MapFailureResult(result.ErrorCode!, result.ErrorMessage!);
            }

            var appointmentTime = new DateTimeOffset(request.AppointmentTime, TimeSpan.Zero);
            return Results.Created(
                $"{ApiConstants.Routes.Appointments}/{result.AppointmentId}",
                new
                {
                    id = result.AppointmentId,
                    barbershopId,
                    request.BarberId,
                    request.ServiceId,
                    request.CustomerId,
                    appointmentTime,
                    status = 1,
                    request.Notes
                });
        }).RequireAuthorization();

        // GET /appointments
        app.MapGet(ApiConstants.Routes.Appointments, async (
            ClaimsPrincipal user,
            IBookingService bookingService,
            DateTimeOffset? from,
            DateTimeOffset? to,
            int? status,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var effectiveFrom = from ?? DateTimeOffset.UtcNow.AddDays(-7);
            var effectiveTo = to ?? DateTimeOffset.UtcNow.AddDays(30);

            if (effectiveTo <= effectiveFrom)
            {
                return Results.BadRequest(new { message = "'to' must be greater than 'from'." });
            }

            // When the caller is a Barber, automatically scope results to their own appointments only.
            Guid? callerBarberId = null;
            var callerRole = user.FindFirstValue(ClaimTypes.Role);
            if (string.Equals(callerRole, "Barber", StringComparison.OrdinalIgnoreCase))
            {
                var callerIdClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
                if (Guid.TryParse(callerIdClaim, out var parsedBarberId))
                {
                    callerBarberId = parsedBarberId;
                }
            }

            var query = new GetAppointmentsQuery(effectiveFrom, effectiveTo, status, callerBarberId);
            var appointments = await bookingService.GetAppointmentsAsync(barbershopId, query, ct);

            var rows = appointments.Select(a => new
            {
                id = a.Id,
                barberId = a.BarberId,
                serviceId = a.ServiceId,
                customerId = a.CustomerId,
                appointmentTime = a.AppointmentTime,
                endTime = a.EndTime,
                status = a.Status,
                notes = a.Notes,
                barberName = a.BarberName,
                customerName = a.CustomerName,
                serviceName = a.ServiceName
            });

            return Results.Ok(rows);
        }).RequireAuthorization();

        // PATCH /appointments/{id}/status
        app.MapPatch(
            $"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsStatusSuffix}",
            async (
                Guid id,
                UpdateAppointmentStatusRequest request,
                ClaimsPrincipal user,
                IBookingService bookingService,
                CancellationToken ct) =>
            {
                if (!EndpointHelpers.IsOwner(user))
                {
                    return Results.Problem(
                        title: ApiConstants.Messages.OwnerOnlyAction,
                        statusCode: StatusCodes.Status403Forbidden);
                }

                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                if (!Enum.IsDefined(request.Status))
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentStatus });
                }

                var command = new UpdateAppointmentStatusCommand(id, request.Status, request.Notes);
                var result = await bookingService.UpdateStatusAsync(barbershopId, command, ct);

                if (!result.IsSuccess)
                {
                    return MapFailureResult(result.ErrorCode!, result.ErrorMessage!);
                }

                return Results.Ok(new
                {
                    id,
                    status = (int)request.Status,
                    notes = request.Notes
                });
            }).RequireAuthorization();

        // PATCH /appointments/{id}/reschedule
        app.MapPatch(
            $"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsRescheduleSuffix}",
            async (
                Guid id,
                RescheduleAppointmentRequest request,
                ClaimsPrincipal user,
                IBookingService bookingService,
                CancellationToken ct) =>
            {
                if (!EndpointHelpers.IsOwner(user))
                {
                    return Results.Problem(
                        title: ApiConstants.Messages.OwnerOnlyAction,
                        statusCode: StatusCodes.Status403Forbidden);
                }

                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                if (request.AppointmentTime == default)
                {
                    return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentPayload });
                }

                var command = new RescheduleAppointmentCommand(
                    id,
                    new DateTimeOffset(request.AppointmentTime, TimeSpan.Zero),
                    request.BarberId,
                    request.ServiceId,
                    request.Notes);

                var result = await bookingService.RescheduleAppointmentAsync(barbershopId, command, ct);

                if (!result.IsSuccess)
                {
                    return MapFailureResult(result.ErrorCode!, result.ErrorMessage!);
                }

                return Results.Ok(new
                {
                    id,
                    barberId = request.BarberId,
                    serviceId = request.ServiceId,
                    appointmentTime = (DateTimeOffset)new DateTimeOffset(request.AppointmentTime, TimeSpan.Zero),
                    notes = request.Notes
                });
            }).RequireAuthorization();

        // PATCH /appointments/{id}/cancel
        app.MapPatch(
            $"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsCancelSuffix}",
            async (
                Guid id,
                CancelAppointmentRequest request,
                ClaimsPrincipal user,
                IBookingService bookingService,
                CancellationToken ct) =>
            {
                if (!EndpointHelpers.IsOwner(user))
                {
                    return Results.Problem(
                        title: ApiConstants.Messages.OwnerOnlyAction,
                        statusCode: StatusCodes.Status403Forbidden);
                }

                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                var command = new CancelAppointmentCommand(id, request.Notes);
                var result = await bookingService.CancelAppointmentAsync(barbershopId, command, ct);

                if (!result.IsSuccess)
                {
                    return MapFailureResult(result.ErrorCode!, result.ErrorMessage!);
                }

                return Results.Ok(new
                {
                    id,
                    status = 3,
                    notes = request.Notes
                });
            }).RequireAuthorization();

        // GET /availability/slots?barberId=&serviceId=&date=
        // Delegates to IAvailabilityService — NO MORE hardcoded 09:00–18:00
        app.MapGet(ApiConstants.Routes.AvailabilitySlots, async (
            Guid barberId,
            Guid serviceId,
            DateOnly date,
            ClaimsPrincipal user,
            IAvailabilityService availabilityService,
            CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (barberId == Guid.Empty || serviceId == Guid.Empty)
            {
                return Results.BadRequest(new { message = "barberId and serviceId are required." });
            }

            var timezone = await GetBarbershopTimezoneAsync(connectionString, barbershopId, ct);

            var slots = await availabilityService.GetAvailableSlotsAsync(
                barbershopId, barberId, serviceId, date, timezone, isPublic: false, ct);

            return Results.Ok(new
            {
                barberId,
                serviceId,
                date,
                slots = slots.Select(s => new
                {
                    start = s.Start,
                    end = s.End,
                    available = s.Available
                })
            });
        }).RequireAuthorization();

        return app;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /// <summary>
    /// Maps a service-layer error code to the appropriate HTTP result.
    /// </summary>
    private static IResult MapFailureResult(string errorCode, string errorMessage) =>
        errorCode switch
        {
            "not_found" => Results.NotFound(),
            "conflict" => Results.Conflict(new { message = errorMessage }),
            "invalid_state" => Results.BadRequest(new { message = errorMessage }),
            "already_completed" => Results.BadRequest(new { message = errorMessage }),
            _ => Results.BadRequest(new { message = errorMessage })
        };

    /// <summary>
    /// Fetches the IANA timezone for the barbershop.
    /// Falls back to "UTC" if the column is null or the barbershop is not found.
    /// </summary>
    private static async Task<string> GetBarbershopTimezoneAsync(
        string connectionString,
        Guid barbershopId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT COALESCE(timezone, 'UTC')
            FROM barbershops
            WHERE id = @barbershopId
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is string tz && !string.IsNullOrWhiteSpace(tz) ? tz : "UTC";
    }
}
