using System.Security.Claims;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Services;

namespace BarberFlow.API.Endpoints;

internal static class BookingRulesEndpoints
{
    private static readonly int[] ValidSlotDurations = [15, 30, 45, 60];

    internal static IEndpointRouteBuilder MapBookingRulesEndpoints(
        this IEndpointRouteBuilder app)
    {
        // GET /barbershops/me/booking-rules
        // Returns booking rules for the caller's barbershop (resolved from JWT).
        // Auth: Owner only.
        app.MapGet($"{ApiConstants.Routes.BarbershopsMe}/booking-rules",
            async (ClaimsPrincipal user,
                   IBookingRulesService bookingRulesService,
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

                var rules = await bookingRulesService.GetByBarbershopIdAsync(barbershopId, ct);

                if (rules is null)
                {
                    return Results.NotFound();
                }

                var response = new BookingRulesResponse(
                    rules.Id,
                    rules.BarbershopId,
                    rules.SlotDurationMinutes,
                    rules.MaxDaysInAdvance,
                    rules.MinNoticeHours,
                    rules.BufferMinutes);

                return Results.Ok(response);
            }).RequireAuthorization();

        // PUT /barbershops/me/booking-rules
        // Creates or updates booking rules for the caller's barbershop.
        // Auth: Owner only.
        app.MapPut($"{ApiConstants.Routes.BarbershopsMe}/booking-rules",
            async (UpsertBookingRulesApiRequest request,
                   ClaimsPrincipal user,
                   IBookingRulesService bookingRulesService,
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

                if (!ValidSlotDurations.Contains(request.SlotDurationMinutes))
                {
                    return Results.BadRequest(new
                    {
                        message = "slot_duration_minutes must be 15, 30, 45, or 60."
                    });
                }

                if (request.MaxDaysInAdvance < 1)
                {
                    return Results.BadRequest(new
                    {
                        message = "max_days_in_advance must be at least 1."
                    });
                }

                if (request.MinNoticeHours < 0)
                {
                    return Results.BadRequest(new
                    {
                        message = "min_notice_hours must be 0 or greater."
                    });
                }

                if (request.BufferMinutes < 0)
                {
                    return Results.BadRequest(new
                    {
                        message = "buffer_minutes must be 0 or greater."
                    });
                }

                var serviceRequest = new UpsertBookingRulesRequest(
                    request.SlotDurationMinutes,
                    request.MaxDaysInAdvance,
                    request.MinNoticeHours,
                    request.BufferMinutes);

                var rules = await bookingRulesService.UpsertAsync(barbershopId, serviceRequest, ct);

                var response = new BookingRulesResponse(
                    rules.Id,
                    rules.BarbershopId,
                    rules.SlotDurationMinutes,
                    rules.MaxDaysInAdvance,
                    rules.MinNoticeHours,
                    rules.BufferMinutes);

                return Results.Ok(response);
            }).RequireAuthorization();

        return app;
    }
}
