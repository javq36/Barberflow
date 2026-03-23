using System.Security.Claims;
using Npgsql;
using NpgsqlTypes;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Helpers;

namespace BarberFlow.API.Endpoints;

internal static class CustomersEndpoints
{
    internal static IEndpointRouteBuilder MapCustomersEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        app.MapPost(ApiConstants.Routes.Customers, async (CreateCustomerRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var normalizedPhone = PhoneNormalizer.Normalize(request.Phone);

            if (!EndpointHelpers.IsValidName(request.Name))
            {
                return Results.BadRequest(new { message = "Customer name is required and must not exceed 100 characters." });
            }

            if (string.IsNullOrWhiteSpace(normalizedPhone) || !normalizedPhone.StartsWith('+'))
            {
                return Results.BadRequest(new { message = "Customer phone must be a valid international number (e.g. +573224760877)." });
            }

            var normalizedCustomerEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            if (normalizedCustomerEmail is not null && !EndpointHelpers.IsValidEmail(normalizedCustomerEmail))
            {
                return Results.BadRequest(new { message = "Invalid email format." });
            }

            var customerId = Guid.NewGuid();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                INSERT INTO customers (id, barbershop_id, name, phone, email, notes, active, created_at)
                VALUES (@id, @barbershopId, @name, @phone, @email, @notes, @active, NOW())", conn);

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = customerId });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
            cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = normalizedPhone });
            cmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = (object?)normalizedCustomerEmail ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)request.Notes?.Trim() ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.IsActive });

            await cmd.ExecuteNonQueryAsync(ct);

            return Results.Created($"{ApiConstants.Routes.Customers}/{customerId}", new
            {
                id = customerId,
                barbershopId,
                name = request.Name.Trim(),
                phone = normalizedPhone,
                email = normalizedCustomerEmail,
                notes = request.Notes?.Trim(),
                isActive = request.IsActive
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.Customers, async (ClaimsPrincipal user, string? query, CancellationToken ct) =>
        {
            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var normalizedQuery = string.IsNullOrWhiteSpace(query) ? string.Empty : query.Trim();
            var queryPattern = string.IsNullOrWhiteSpace(normalizedQuery) ? string.Empty : $"%{normalizedQuery}%";

            var rows = new List<object>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT id, name, phone, email, notes, active, created_at
                FROM customers
                WHERE barbershop_id = @barbershopId
                            AND active = TRUE
                            AND (
                                @queryPattern = ''
                                OR COALESCE(name, '') ILIKE @queryPattern
                                OR COALESCE(phone, '') ILIKE @queryPattern
                            )
                ORDER BY name", conn);
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("queryPattern", NpgsqlDbType.Text) { Value = queryPattern });

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                rows.Add(new
                {
                    id = reader.GetGuid(0),
                    name = reader.IsDBNull(1) ? null : reader.GetString(1),
                    phone = reader.IsDBNull(2) ? null : reader.GetString(2),
                    email = reader.IsDBNull(3) ? null : reader.GetString(3),
                    notes = reader.IsDBNull(4) ? null : reader.GetString(4),
                    isActive = reader.GetBoolean(5),
                    createdAt = reader.GetFieldValue<DateTime>(6)
                });
            }

            return Results.Ok(rows);
        }).RequireAuthorization();

        app.MapPut($"{ApiConstants.Routes.Customers}/{{id:guid}}", async (Guid id, UpdateCustomerRequest request, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            var normalizedPhone = PhoneNormalizer.Normalize(request.Phone);

            if (!EndpointHelpers.IsValidName(request.Name))
            {
                return Results.BadRequest(new { message = "Customer name is required and must not exceed 100 characters." });
            }

            if (string.IsNullOrWhiteSpace(normalizedPhone) || !normalizedPhone.StartsWith('+'))
            {
                return Results.BadRequest(new { message = "Customer phone must be a valid international number (e.g. +573224760877)." });
            }

            var normalizedCustomerEmail = string.IsNullOrWhiteSpace(request.Email)
                ? null
                : request.Email.Trim().ToLowerInvariant();

            if (normalizedCustomerEmail is not null && !EndpointHelpers.IsValidEmail(normalizedCustomerEmail))
            {
                return Results.BadRequest(new { message = "Invalid email format." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                UPDATE customers
                SET name = @name,
                    phone = @phone,
                    email = @email,
                    notes = @notes,
                    active = @active
                WHERE id = @id AND barbershop_id = @barbershopId", conn);

            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
            cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = request.Name.Trim() });
            cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = normalizedPhone });
            cmd.Parameters.Add(new NpgsqlParameter("email", NpgsqlDbType.Text) { Value = (object?)normalizedCustomerEmail ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("notes", NpgsqlDbType.Text) { Value = (object?)request.Notes?.Trim() ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("active", NpgsqlDbType.Boolean) { Value = request.IsActive });

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        app.MapDelete($"{ApiConstants.Routes.Customers}/{{id:guid}}", async (Guid id, ClaimsPrincipal user, CancellationToken ct) =>
        {
            if (!EndpointHelpers.IsOwner(user))
            {
                return Results.Json(new { message = "Solo el dueño puede realizar esta acción." }, statusCode: 403);
            }

            if (!EndpointHelpers.TryGetBarbershopId(user, out var barbershopId, out var error))
            {
                return error!;
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                UPDATE customers
                SET active = FALSE
                WHERE id = @id AND barbershop_id = @barbershopId", conn);
            cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
            cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            return affected == 0 ? Results.NotFound() : Results.NoContent();
        }).RequireAuthorization();

        return app;
    }
}
