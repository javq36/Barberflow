using System.Security.Claims;
using Npgsql;
using NpgsqlTypes;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;

namespace BarberFlow.API.Endpoints;

internal static class ServicesEndpoints
{
    internal static IEndpointRouteBuilder MapServicesEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        app.MapPost(ApiConstants.Routes.Services, async (CreateServiceRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (string.IsNullOrWhiteSpace(request.Name) || request.Price < 0)
            {
                return Results.BadRequest(new { message = "Invalid service payload." });
            }

            var normalizedDuration = request.DurationMinutes > 0 ? request.DurationMinutes : 30;
            var normalizedImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();

            if (normalizedImageUrl is not null && normalizedImageUrl.Length > 4_000_000)
            {
                return Results.BadRequest(new { message = "Service image is too large." });
            }

            var serviceId = Guid.NewGuid();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                INSERT INTO services (id, barbershop_id, name, duration_minutes, price, active, image_url)
                VALUES (@id, @barbershopId, @name, @duration, @price, @active, @imageUrl)", conn);

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = serviceId });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
            cmd.Parameters.Add(new NpgsqlParameter("duration", NpgsqlDbType.Integer) { Value = normalizedDuration });
            cmd.Parameters.Add(new NpgsqlParameter("price", NpgsqlDbType.Numeric) { Value = request.Price });
            cmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.Active });
            cmd.Parameters.Add(new NpgsqlParameter("imageUrl", NpgsqlDbType.Text) { Value = (object?)normalizedImageUrl ?? DBNull.Value });

            await cmd.ExecuteNonQueryAsync(ct);

            return Results.Created($"{ApiConstants.Routes.Services}/{serviceId}", new
            {
                id = serviceId,
                barbershopId,
                request.Name,
                DurationMinutes = normalizedDuration,
                request.Price,
                request.Active,
                imageUrl = normalizedImageUrl
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.Services, async (ClaimsPrincipal user, string? search, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var searchPattern = string.IsNullOrWhiteSpace(search) ? null : $"%{search.Trim()}%";
            var rows = new List<object>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT id, name, duration_minutes, price, active, image_url
                FROM services
                WHERE barbershop_id = @barbershopId
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
                    durationMinutes = reader.GetInt32(2),
                    price = reader.IsDBNull(3) ? 0m : reader.GetDecimal(3),
                    active = reader.GetBoolean(4),
                    imageUrl = reader.IsDBNull(5) ? null : reader.GetString(5)
                });
            }

            return Results.Ok(rows);
        }).RequireAuthorization();

        app.MapPut($"{ApiConstants.Routes.Services}/{{id:guid}}", async (Guid id, UpdateServiceRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            if (string.IsNullOrWhiteSpace(request.Name) || request.Price < 0)
            {
                return Results.BadRequest(new { message = "Invalid service payload." });
            }

            var normalizedDuration = request.DurationMinutes > 0 ? request.DurationMinutes : 30;
            var normalizedImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl) ? null : request.ImageUrl.Trim();

            if (normalizedImageUrl is not null && normalizedImageUrl.Length > 4_000_000)
            {
                return Results.BadRequest(new { message = "Service image is too large." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                UPDATE services
                SET name = @name,
                    duration_minutes = @duration,
                    price = @price,
                    active = @active,
                    image_url = @imageUrl
                WHERE id = @id AND barbershop_id = @barbershopId", conn);

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
            cmd.Parameters.Add(new NpgsqlParameter("duration", NpgsqlDbType.Integer) { Value = normalizedDuration });
            cmd.Parameters.Add(new NpgsqlParameter("price", NpgsqlDbType.Numeric) { Value = request.Price });
            cmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.Active });
            cmd.Parameters.Add(new NpgsqlParameter("imageUrl", NpgsqlDbType.Text) { Value = (object?)normalizedImageUrl ?? DBNull.Value });

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        app.MapDelete($"{ApiConstants.Routes.Services}/{{id:guid}}", async (Guid id, ClaimsPrincipal user, CancellationToken ct) =>
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

            await using var cmd = new NpgsqlCommand("DELETE FROM services WHERE id = @id AND barbershop_id = @barbershopId", conn);
            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
