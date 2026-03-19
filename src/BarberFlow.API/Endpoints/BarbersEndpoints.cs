using System.Security.Claims;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Domain.Enums;

namespace BarberFlow.API.Endpoints;

internal static class BarbersEndpoints
{
    internal static IEndpointRouteBuilder MapBarbersEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        app.MapPost(ApiConstants.Routes.Barbers, async (CreateBarberRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { message = "Barber name is required." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            var normalizedEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            if (!string.IsNullOrWhiteSpace(normalizedEmail))
            {
                await using var existsCmd = new NpgsqlCommand("SELECT 1 FROM users WHERE email = @email LIMIT 1", conn);
                existsCmd.Parameters.AddWithValue("email", normalizedEmail);
                var exists = await existsCmd.ExecuteScalarAsync(ct);
                if (exists is not null)
                {
                    return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
                }
            }

            var barberId = Guid.NewGuid();
            try
            {
                await using var insertCmd = new NpgsqlCommand(@"
                    INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
                    VALUES (@id, @barbershopId, @name, @email, @phone, 3, NULL, @active, NOW())", conn);

                insertCmd.Parameters.AddWithValue("id", barberId);
                insertCmd.Parameters.AddWithValue("barbershopId", barbershopId);
                insertCmd.Parameters.AddWithValue("name", request.Name.Trim());
                insertCmd.Parameters.AddWithValue("email", (object?)normalizedEmail ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("active", request.IsActive);
                await insertCmd.ExecuteNonQueryAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
            }

            return Results.Created($"{ApiConstants.Routes.Barbers}/{barberId}", new
            {
                id = barberId,
                barbershopId,
                name = request.Name.Trim(),
                email = normalizedEmail,
                phone = request.Phone,
                isActive = request.IsActive
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.Barbers, async (ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var rows = new List<object>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand($@"
                SELECT id, name, email, phone, active, created_at
                FROM users
                WHERE barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}
                ORDER BY name", conn);
            cmd.Parameters.AddWithValue("barbershopId", barbershopId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                rows.Add(new
                {
                    id = reader.GetGuid(0),
                    name = reader.GetString(1),
                    email = reader.IsDBNull(2) ? null : reader.GetString(2),
                    phone = reader.IsDBNull(3) ? null : reader.GetString(3),
                    isActive = reader.GetBoolean(4),
                    createdAt = reader.GetDateTime(5)
                });
            }

            return Results.Ok(rows);
        }).RequireAuthorization();

        app.MapPut($"{ApiConstants.Routes.Barbers}/{{id:guid}}", async (Guid id, UpdateBarberRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { message = "Barber name is required." });
            }

            var normalizedEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            if (!string.IsNullOrWhiteSpace(normalizedEmail))
            {
                await using var existsCmd = new NpgsqlCommand("SELECT 1 FROM users WHERE email = @email AND id <> @id LIMIT 1", conn);
                existsCmd.Parameters.AddWithValue("email", normalizedEmail);
                existsCmd.Parameters.AddWithValue("id", id);
                var exists = await existsCmd.ExecuteScalarAsync(ct);
                if (exists is not null)
                {
                    return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
                }
            }

            await using var cmd = new NpgsqlCommand($@"
                UPDATE users
                SET name = @name,
                    email = @email,
                    phone = @phone,
                    active = @active
                WHERE id = @id AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}", conn);

            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("barbershopId", barbershopId);
            cmd.Parameters.AddWithValue("name", request.Name.Trim());
            cmd.Parameters.AddWithValue("email", (object?)normalizedEmail ?? DBNull.Value);
            cmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("active", request.IsActive);

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        app.MapDelete($"{ApiConstants.Routes.Barbers}/{{id:guid}}", async (Guid id, ClaimsPrincipal user, CancellationToken ct) =>
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

            await using var cmd = new NpgsqlCommand($@"
                UPDATE users
                SET active = FALSE
                WHERE id = @id AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}", conn);

            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("barbershopId", barbershopId);

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
