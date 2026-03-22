using System.Security.Claims;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.API.Endpoints;

internal static class TimeOffEndpoints
{
    internal static IEndpointRouteBuilder MapTimeOffEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        // GET /barbers/{barberId}/time-off
        // Auth: Owner or Barber of the same barbershop
        app.MapGet($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/time-off",
            async (Guid barberId, DateOnly? from, DateOnly? to,
                   ClaimsPrincipal user, ITimeOffService timeOffService, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var claimError))
            {
                return claimError!;
            }

            var callerId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            var isOwner = EndpointHelpers.IsOwner(user);
            var isSameBarber = string.Equals(callerId, barberId.ToString(), StringComparison.OrdinalIgnoreCase);

            if (!isOwner && !isSameBarber)
            {
                return Results.Problem(
                    title: ApiConstants.Messages.OwnerOnlyAction,
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var entries = await timeOffService.GetByBarberIdAsync(barbershopId, barberId, from, to, ct);
            return Results.Ok(new { data = entries });
        }).RequireAuthorization();

        // POST /barbers/{barberId}/time-off
        // Auth: Owner only
        app.MapPost($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/time-off",
            async (Guid barberId, TimeOffCreateRequest request,
                   ClaimsPrincipal user, ITimeOffService timeOffService, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(
                    title: ApiConstants.Messages.OwnerOnlyAction,
                    statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var claimError))
            {
                return claimError!;
            }

            if (string.IsNullOrWhiteSpace(request.StartDate) || string.IsNullOrWhiteSpace(request.EndDate))
            {
                return Results.BadRequest(new { message = "startDate and endDate are required." });
            }

            if (!await BarberExistsInBarbershopAsync(connectionString, barbershopId, barberId, ct))
            {
                return Results.NotFound(new { message = ApiConstants.Messages.ResourceOutOfTenantScope });
            }

            var serviceRequest = new Application.Services.CreateTimeOffRequest(
                request.StartDate,
                request.EndDate,
                request.Reason);

            var (result, entry) = await timeOffService.CreateAsync(barbershopId, barberId, serviceRequest, ct);

            return result switch
            {
                CreateTimeOffResult.Created => Results.Created(
                    $"{ApiConstants.Routes.Barbers}/{barberId}/time-off/{entry!.Id}",
                    entry),
                CreateTimeOffResult.PastDate => Results.BadRequest(
                    new { message = "start_date must be today or future, and end_date must be >= start_date." }),
                CreateTimeOffResult.Overlap => Results.Conflict(
                    new { message = "Time off overlaps with an existing entry for this barber." }),
                _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError)
            };
        }).RequireAuthorization();

        // DELETE /barbers/{barberId}/time-off/{id}
        // Auth: Owner only
        app.MapDelete($"{ApiConstants.Routes.Barbers}/{{barberId:guid}}/time-off/{{id:guid}}",
            async (Guid barberId, Guid id,
                   ClaimsPrincipal user, ITimeOffService timeOffService, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(
                    title: ApiConstants.Messages.OwnerOnlyAction,
                    statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var claimError))
            {
                return claimError!;
            }

            var deleted = await timeOffService.DeleteAsync(barbershopId, barberId, id, ct);
            return deleted ? Results.NoContent() : Results.NotFound();
        }).RequireAuthorization();

        return app;
    }

    private static async Task<bool> BarberExistsInBarbershopAsync(
        string connectionString,
        Guid barbershopId,
        Guid barberId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand($@"
            SELECT 1 FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId
              AND role = {(int)UserRole.Barber} AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is not null;
    }
}
