using System.Security.Claims;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Domain.Enums;

namespace BarberFlow.API.Endpoints;

internal static class BarberCredentialsEndpoints
{
    private const int MinPasswordLength = 8;

    internal static IEndpointRouteBuilder MapBarberCredentialsEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        // POST /barbers/{barberId}/credentials — set initial credentials (owner only)
        app.MapPost("/barbers/{barberId:guid}/credentials",
            async (Guid barberId, SetBarberCredentialsRequest request, ClaimsPrincipal user, CancellationToken ct) =>
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

            var validationError = ValidateCredentialRequest(request.Email, request.Password);
            if (validationError is not null)
            {
                return validationError;
            }

            var normalizedEmail = request.Email.Trim().ToLowerInvariant();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            var barber = await FetchBarberAsync(conn, barberId, barbershopId, ct);
            if (barber is null)
            {
                return Results.NotFound(new { message = ApiConstants.Messages.BarberCredentialsNotFound });
            }

            if (barber.HasPasswordHash)
            {
                return Results.Conflict(new { message = ApiConstants.Messages.BarberCredentialsAlreadySet });
            }

            var emailConflict = await CheckEmailConflictAsync(conn, normalizedEmail, barberId, ct);
            if (emailConflict)
            {
                return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
            }

            var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

            await using var updateCmd = new NpgsqlCommand($@"
                UPDATE users
                SET email = @email, password_hash = @passwordHash
                WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}", conn);

            updateCmd.Parameters.AddWithValue("email", normalizedEmail);
            updateCmd.Parameters.AddWithValue("passwordHash", passwordHash);
            updateCmd.Parameters.AddWithValue("barberId", barberId);
            updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);

            await updateCmd.ExecuteNonQueryAsync(ct);
            return Results.Ok(new { message = "Credentials set successfully." });
        }).RequireAuthorization();

        // PUT /barbers/{barberId}/credentials — reset password (owner only)
        app.MapPut("/barbers/{barberId:guid}/credentials",
            async (Guid barberId, ResetBarberPasswordRequest request, ClaimsPrincipal user, CancellationToken ct) =>
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

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < MinPasswordLength)
            {
                return Results.BadRequest(new { message = ApiConstants.Messages.PasswordTooShort });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            var barber = await FetchBarberAsync(conn, barberId, barbershopId, ct);
            if (barber is null)
            {
                return Results.NotFound(new { message = ApiConstants.Messages.BarberCredentialsNotFound });
            }

            var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

            await using var updateCmd = new NpgsqlCommand($@"
                UPDATE users
                SET password_hash = @passwordHash
                WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}", conn);

            updateCmd.Parameters.AddWithValue("passwordHash", passwordHash);
            updateCmd.Parameters.AddWithValue("barberId", barberId);
            updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);

            await updateCmd.ExecuteNonQueryAsync(ct);
            return Results.Ok(new { message = "Password reset successfully." });
        }).RequireAuthorization();

        return app;
    }

    private static IResult? ValidateCredentialRequest(string email, string password)
    {
        if (string.IsNullOrWhiteSpace(email) || !EndpointHelpers.IsValidEmail(email.Trim()))
        {
            return Results.BadRequest(new { message = "Invalid email format." });
        }

        if (string.IsNullOrWhiteSpace(password) || password.Length < MinPasswordLength)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.PasswordTooShort });
        }

        return null;
    }

    private static async Task<BarberRow?> FetchBarberAsync(
        NpgsqlConnection conn, Guid barberId, Guid barbershopId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand($@"
            SELECT password_hash IS NOT NULL AND password_hash <> ''
            FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId AND role = {(int)UserRole.Barber}
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("barberId", barberId);
        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await cmd.ExecuteScalarAsync(ct);
        if (result is null || result == DBNull.Value)
        {
            return null;
        }

        return new BarberRow(HasPasswordHash: (bool)result);
    }

    private static async Task<bool> CheckEmailConflictAsync(
        NpgsqlConnection conn, string normalizedEmail, Guid excludeId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(
            "SELECT 1 FROM users WHERE email = @email AND id <> @excludeId LIMIT 1", conn);

        cmd.Parameters.AddWithValue("email", normalizedEmail);
        cmd.Parameters.AddWithValue("excludeId", excludeId);

        var exists = await cmd.ExecuteScalarAsync(ct);
        return exists is not null;
    }

    private sealed record BarberRow(bool HasPasswordHash);
}
