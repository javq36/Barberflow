using System.Data;
using System.Security.Claims;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;

namespace BarberFlow.API.Endpoints;

internal static class BarbershopsEndpoints
{
    internal static IEndpointRouteBuilder MapBarbershopsEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        app.MapPost(ApiConstants.Routes.Barbershops, async (CreateBarbershopRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userIdClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
            var roleClaim = user.FindFirstValue(ClaimTypes.Role);

            if (!Guid.TryParse(userIdClaim, out var ownerId))
            {
                return Results.Unauthorized();
            }

            if (!string.Equals(roleClaim, "Owner", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Forbid();
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { message = "Barbershop name is required." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);
            await using var transaction = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);

            Guid? existingBarbershopId;
            await using (var ownerLockCmd = new NpgsqlCommand(@"
                SELECT barbershop_id
                FROM users
                WHERE id = @ownerId
                FOR UPDATE", conn, transaction))
            {
                ownerLockCmd.Parameters.AddWithValue("ownerId", ownerId);
                var currentValue = await ownerLockCmd.ExecuteScalarAsync(ct);

                existingBarbershopId = currentValue is null || currentValue == DBNull.Value
                    ? null
                    : (Guid)currentValue;
            }

            if (existingBarbershopId.HasValue)
            {
                await transaction.RollbackAsync(ct);
                return Results.Conflict(new { message = "Owner already has a barbershop assigned." });
            }

            var barbershopId = Guid.NewGuid();

            await using (var createShopCmd = new NpgsqlCommand(@"
                INSERT INTO barbershops (id, name, phone, address, timezone, created_at)
                VALUES (@id, @name, @phone, @address, @timezone, NOW())", conn, transaction))
            {
                createShopCmd.Parameters.AddWithValue("id", barbershopId);
                createShopCmd.Parameters.AddWithValue("name", request.Name.Trim());
                createShopCmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
                createShopCmd.Parameters.AddWithValue("address", (object?)request.Address?.Trim() ?? DBNull.Value);
                createShopCmd.Parameters.AddWithValue("timezone", string.IsNullOrWhiteSpace(request.Timezone) ? "UTC" : request.Timezone.Trim());

                await createShopCmd.ExecuteNonQueryAsync(ct);
            }

            await using (var assignOwnerCmd = new NpgsqlCommand(@"
                UPDATE users
                SET barbershop_id = @barbershopId
                WHERE id = @ownerId", conn, transaction))
            {
                assignOwnerCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                assignOwnerCmd.Parameters.AddWithValue("ownerId", ownerId);
                var affected = await assignOwnerCmd.ExecuteNonQueryAsync(ct);
                if (affected == 0)
                {
                    await transaction.RollbackAsync(ct);
                    return Results.BadRequest(new { message = "Owner account was not found for barbershop assignment." });
                }
            }

            await transaction.CommitAsync(ct);

            return Results.Created($"{ApiConstants.Routes.Barbershops}/{barbershopId}", new
            {
                id = barbershopId,
                name = request.Name.Trim(),
                phone = request.Phone,
                address = request.Address,
                timezone = string.IsNullOrWhiteSpace(request.Timezone) ? "UTC" : request.Timezone.Trim()
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.BarbershopsMe, async (ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.CanManageBarbershopProfile(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT id, name, phone, address, timezone, created_at
                FROM barbershops
                WHERE id = @id
                LIMIT 1", conn);
            cmd.Parameters.AddWithValue("id", barbershopId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
            {
                return Results.NotFound();
            }

            return Results.Ok(new
            {
                id = reader.GetGuid(0),
                name = reader.GetString(1),
                phone = reader.IsDBNull(2) ? null : reader.GetString(2),
                address = reader.IsDBNull(3) ? null : reader.GetString(3),
                timezone = reader.IsDBNull(4) ? "UTC" : reader.GetString(4),
                createdAt = reader.GetDateTime(5)
            });
        }).RequireAuthorization();

        app.MapPut(ApiConstants.Routes.BarbershopsMe, async (UpdateBarbershopRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.CanManageBarbershopProfile(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { message = "Barbershop name is required." });
            }

            var normalizedName = request.Name.Trim();
            var normalizedPhone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            var normalizedAddress = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
            var normalizedTimezone = string.IsNullOrWhiteSpace(request.Timezone) ? "UTC" : request.Timezone.Trim();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                UPDATE barbershops
                SET name = @name,
                    phone = @phone,
                    address = @address,
                    timezone = @timezone
                WHERE id = @id", conn);

            cmd.Parameters.AddWithValue("id", barbershopId);
            cmd.Parameters.AddWithValue("name", normalizedName);
            cmd.Parameters.AddWithValue("phone", (object?)normalizedPhone ?? DBNull.Value);
            cmd.Parameters.AddWithValue("address", (object?)normalizedAddress ?? DBNull.Value);
            cmd.Parameters.AddWithValue("timezone", normalizedTimezone);

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            if (affected == 0)
            {
                return Results.NotFound();
            }

            return Results.Ok(new
            {
                id = barbershopId,
                name = normalizedName,
                phone = normalizedPhone,
                address = normalizedAddress,
                timezone = normalizedTimezone
            });
        }).RequireAuthorization();

        return app;
    }
}
