using System.Security.Claims;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Services;

namespace BarberFlow.API.Endpoints;

internal static class WorkingHoursEndpoints
{
    internal static IEndpointRouteBuilder MapWorkingHoursEndpoints(
        this IEndpointRouteBuilder app)
    {
        // GET /barbers/{barberId}/working-hours
        // Auth: Owner or the Barber themselves (same barbershop enforced by service)
        app.MapGet($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/working-hours",
            async (Guid barberId,
                   ClaimsPrincipal user,
                   IWorkingHoursService workingHoursService,
                   CancellationToken ct) =>
            {
                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                var callerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
                var isOwner = EndpointHelpers.IsOwner(user);
                var isSameBarber = string.Equals(callerId, barberId.ToString(), StringComparison.OrdinalIgnoreCase);

                if (!isOwner && !isSameBarber)
                {
                    return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
                }

                var hours = await workingHoursService.GetByBarberIdAsync(barbershopId, barberId, ct);

                var response = hours.Select(h => new WorkingHourResponse(
                    h.Id, h.BarberId, h.DayOfWeek, h.StartTime, h.EndTime, h.IsActive));

                return Results.Ok(response);
            }).RequireAuthorization();

        // POST /barbers/{barberId}/working-hours
        // Auth: Owner only — upserts a single day's working-hour block
        app.MapPost($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/working-hours",
            async (Guid barberId,
                   UpsertWorkingHourApiRequest request,
                   ClaimsPrincipal user,
                   IWorkingHoursService workingHoursService,
                   CancellationToken ct) =>
            {
                if (!EndpointHelpers.IsOwner(user))
                {
                    return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
                }

                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                if (request.DayOfWeek < 0 || request.DayOfWeek > 6)
                {
                    return Results.BadRequest(new { message = "day_of_week must be between 0 and 6." });
                }

                if (string.IsNullOrWhiteSpace(request.StartTime) || string.IsNullOrWhiteSpace(request.EndTime))
                {
                    return Results.BadRequest(new { message = "start_time and end_time are required in HH:mm format." });
                }

                if (!TimeSpan.TryParse(request.StartTime, out var start) ||
                    !TimeSpan.TryParse(request.EndTime, out var end))
                {
                    return Results.BadRequest(new { message = "start_time and end_time must be in HH:mm format." });
                }

                if (end <= start)
                {
                    return Results.BadRequest(new { message = "end_time must be after start_time." });
                }

                WorkingHourDto result;
                try
                {
                    var serviceRequest = new UpsertWorkingHourRequest(
                        request.DayOfWeek, request.StartTime, request.EndTime, request.IsActive);

                    result = await workingHoursService.UpsertAsync(barbershopId, barberId, serviceRequest, ct);
                }
                catch (KeyNotFoundException)
                {
                    return Results.Json(new { message = "Barbero no encontrado en esta barbería." }, statusCode: 403);
                }
                catch (ArgumentException ex)
                {
                    return Results.BadRequest(new { message = ex.Message });
                }

                var response = new WorkingHourResponse(
                    result.Id, result.BarberId, result.DayOfWeek,
                    result.StartTime, result.EndTime, result.IsActive);

                return Results.Created(
                    $"{ApiConstants.Routes.Barbers}/{barberId}/working-hours/{result.Id}",
                    response);
            }).RequireAuthorization();

        // DELETE /barbers/{barberId}/working-hours/{id}
        // Auth: Owner only
        app.MapDelete($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/working-hours/{{id:guid}}",
            async (Guid barberId,
                   Guid id,
                   ClaimsPrincipal user,
                   IWorkingHoursService workingHoursService,
                   CancellationToken ct) =>
            {
                if (!EndpointHelpers.IsOwner(user))
                {
                    return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
                }

                if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
                {
                    return error!;
                }

                var deleted = await workingHoursService.DeleteAsync(barbershopId, barberId, id, ct);
                return deleted ? Results.NoContent() : Results.NotFound();
            }).RequireAuthorization();

        return app;
    }
}
