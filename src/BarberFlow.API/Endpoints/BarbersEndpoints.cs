using System.Security.Claims;
using Npgsql;
using NpgsqlTypes;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Helpers;
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

            if (!EndpointHelpers.IsValidName(request.Name))
            {
                return Results.BadRequest(new { message = "Barber name is required and must not exceed 100 characters." });
            }

            var normalizedEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            if (normalizedEmail is not null && !EndpointHelpers.IsValidEmail(normalizedEmail))
            {
                return Results.BadRequest(new { message = "Invalid email format." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            if (normalizedEmail is not null)
            {
                await using var existsCmd = new NpgsqlCommand("SELECT 1 FROM users WHERE email = @email LIMIT 1", conn);
                existsCmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = normalizedEmail });
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

                insertCmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = barberId });
                insertCmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
                insertCmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
                insertCmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = (object?)normalizedEmail ?? DBNull.Value });
                insertCmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = (object?)PhoneNormalizer.Normalize(request.Phone) ?? DBNull.Value });
                insertCmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.IsActive });
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

        app.MapGet(ApiConstants.Routes.Barbers, async (ClaimsPrincipal user, string? search, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var searchPattern = string.IsNullOrWhiteSpace(search) ? null : $"%{search.Trim()}%";
            var rows = new List<object>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand($@"
                SELECT id, name, email, phone, active, created_at
                FROM users
                WHERE barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}
                  AND (@searchPattern IS NULL OR name ILIKE @searchPattern)
                ORDER BY name", conn);
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("searchPattern", NpgsqlDbType.Text) { Value = (object?)searchPattern ?? DBNull.Value });

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
                    createdAt = reader.GetFieldValue<DateTime>(5)
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

            if (!EndpointHelpers.IsValidName(request.Name))
            {
                return Results.BadRequest(new { message = "Barber name is required and must not exceed 100 characters." });
            }

            var normalizedEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            if (normalizedEmail is not null && !EndpointHelpers.IsValidEmail(normalizedEmail))
            {
                return Results.BadRequest(new { message = "Invalid email format." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            if (normalizedEmail is not null)
            {
                await using var existsCmd = new NpgsqlCommand("SELECT 1 FROM users WHERE email = @email AND id <> @id LIMIT 1", conn);
                existsCmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = normalizedEmail });
                existsCmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
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

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
            cmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = (object?)normalizedEmail ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = (object?)PhoneNormalizer.Normalize(request.Phone) ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.IsActive });

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

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
