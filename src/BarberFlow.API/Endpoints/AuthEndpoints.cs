using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using BarberFlow.API.Constants;
using BarberFlow.API.Contracts;
using BarberFlow.Domain.Enums;

namespace BarberFlow.API.Endpoints;

internal static class AuthEndpoints
{
    internal static IEndpointRouteBuilder MapAuthEndpoints(
        this IEndpointRouteBuilder app,
        string connectionString,
        string issuer,
        string audience,
        string key,
        IConfigurationSection jwtSection)
    {
        app.MapPost(ApiConstants.Routes.AuthRegisterOwner, async (RegisterOwnerRequest request, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) ||
                string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new { message = "Name, email and password are required." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using (var existsCmd = new NpgsqlCommand("SELECT 1 FROM users WHERE email = @email LIMIT 1", conn))
            {
                existsCmd.Parameters.AddWithValue("email", request.Email.Trim().ToLowerInvariant());
                var exists = await existsCmd.ExecuteScalarAsync(ct);
                if (exists is not null)
                {
                    return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
                }
            }

            var userId = Guid.NewGuid();
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);

            try
            {
                await using var insertCmd = new NpgsqlCommand(@"
                    INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
                    VALUES (@id, NULL, @name, @email, @phone, @role, @passwordHash, TRUE, NOW())", conn);

                insertCmd.Parameters.AddWithValue("id", userId);
                insertCmd.Parameters.AddWithValue("name", request.Name.Trim());
                insertCmd.Parameters.AddWithValue("email", request.Email.Trim().ToLowerInvariant());
                insertCmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
                insertCmd.Parameters.AddWithValue("role", (int)UserRole.Owner);
                insertCmd.Parameters.AddWithValue("passwordHash", passwordHash);

                await insertCmd.ExecuteNonQueryAsync(ct);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return Results.Conflict(new { message = ApiConstants.Messages.EmailAlreadyExists });
            }

            return Results.Created(ApiConstants.Routes.AuthMe, new
            {
                id = userId,
                email = request.Email.Trim().ToLowerInvariant(),
                role = "Owner"
            });
        }).RequireRateLimiting("AuthSensitive");

        app.MapPost(ApiConstants.Routes.AuthLogin, async (LoginRequest request, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new { message = "Email and password are required." });
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            Guid userId;
            string email;
            string name;
            string? phone;
            int role;
            string passwordHash;
            Guid? barbershopId;

            await using (var cmd = new NpgsqlCommand(@"
                SELECT id, email, name, phone, role, password_hash, barbershop_id
                FROM users
                WHERE email = @email AND active = TRUE
                LIMIT 1", conn))
            {
                cmd.Parameters.AddWithValue("email", request.Email.Trim().ToLowerInvariant());
                await using var reader = await cmd.ExecuteReaderAsync(ct);

                if (!await reader.ReadAsync(ct))
                {
                    return Results.Unauthorized();
                }

                userId = reader.GetGuid(0);
                email = reader.GetString(1);
                name = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                phone = reader.IsDBNull(3) ? null : reader.GetString(3);
                role = reader.GetInt32(4);
                passwordHash = reader.IsDBNull(5) ? string.Empty : reader.GetString(5);
                barbershopId = reader.IsDBNull(6) ? null : reader.GetGuid(6);
            }

            if (string.IsNullOrWhiteSpace(passwordHash) || !BCrypt.Net.BCrypt.Verify(request.Password, passwordHash))
            {
                return Results.Unauthorized();
            }

            var roleName = role switch
            {
                1 => "SuperAdmin",
                2 => "Owner",
                3 => "Barber",
                4 => "Customer",
                _ => "Unknown"
            };

            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new(JwtRegisteredClaimNames.Email, email),
                new(ClaimTypes.Email, email),
                new(ClaimTypes.NameIdentifier, userId.ToString()),
                new(ClaimTypes.Name, name),
                new(ClaimTypes.Role, roleName)
            };

            if (barbershopId.HasValue)
            {
                claims.Add(new Claim("barbershop_id", barbershopId.Value.ToString()));
            }

            var expiresInMinutes = int.TryParse(jwtSection["ExpirationMinutes"], out var value)
                ? value
                : 60;

            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
            var expiresAt = DateTime.UtcNow.AddMinutes(expiresInMinutes);

            var jwt = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: expiresAt,
                signingCredentials: credentials);

            var token = new JwtSecurityTokenHandler().WriteToken(jwt);

            return Results.Ok(new
            {
                accessToken = token,
                tokenType = "Bearer",
                expiresAt,
                user = new
                {
                    id = userId,
                    name,
                    email,
                    phone,
                    role = roleName,
                    barbershopId
                }
            });
        }).RequireRateLimiting("AuthSensitive");

        app.MapGet(ApiConstants.Routes.HealthAuth, (ClaimsPrincipal user) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
            return Results.Ok(new
            {
                status = ApiConstants.Messages.StatusOk,
                message = ApiConstants.Messages.JwtTokenValid,
                userId
            });
        }).RequireAuthorization();

        app.MapGet(ApiConstants.Routes.AuthMe, (ClaimsPrincipal user) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
            var email = user.FindFirstValue(JwtRegisteredClaimNames.Email)
                ?? user.FindFirstValue(ClaimTypes.Email);
            var name = user.FindFirstValue(ClaimTypes.Name);
            var userRole = user.FindFirstValue(ClaimTypes.Role);
            var barbershopId = user.FindFirstValue("barbershop_id");

            return Results.Ok(new
            {
                id = userId,
                name,
                email,
                role = userRole,
                barbershopId
            });
        }).RequireAuthorization();

        return app;
    }
}
