using Microsoft.EntityFrameworkCore;
using BarberFlow.Infrastructure;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using BarberFlow.API.Constants;
using BarberFlow.API.HealthChecks;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using BarberFlow.API.Contracts;
using System.IdentityModel.Tokens.Jwt;
using Npgsql;
using System.Data;


var builder = WebApplication.CreateBuilder(args);

// Configura DbContext con la cadena de conexi�n de appsettings.json
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<BarberFlowDbContext>(options =>
    options.UseNpgsql(connectionString));

var jwtSection = builder.Configuration.GetSection("Jwt");
var issuer = jwtSection["Issuer"];
var audience = jwtSection["Audience"];
var key = jwtSection["Key"];

if (string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(audience) || string.IsNullOrWhiteSpace(key))
{
    throw new InvalidOperationException(ApiConstants.Messages.JwtConfigMissing);
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = issuer,
            ValidAudience = audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database");

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks(ApiConstants.Routes.HealthReady);

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

    // Step 1: Prevent duplicated users by email.
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

    // Step 2: Create owner without barbershop. Barbershop is created in a separate step.
    await using (var insertCmd = new NpgsqlCommand(@"
        INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
        VALUES (@id, NULL, @name, @email, @phone, @role, @passwordHash, TRUE, NOW())", conn))
    {
        insertCmd.Parameters.AddWithValue("id", userId);
        insertCmd.Parameters.AddWithValue("name", request.Name.Trim());
        insertCmd.Parameters.AddWithValue("email", request.Email.Trim().ToLowerInvariant());
        insertCmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
        insertCmd.Parameters.AddWithValue("role", 2); // Owner
        insertCmd.Parameters.AddWithValue("passwordHash", passwordHash);

        await insertCmd.ExecuteNonQueryAsync(ct);
    }

    return Results.Created(ApiConstants.Routes.AuthMe, new
    {
        id = userId,
        email = request.Email.Trim().ToLowerInvariant(),
        role = "Owner"
    });
});

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
});

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
    var role = user.FindFirstValue(ClaimTypes.Role);
    var barbershopId = user.FindFirstValue("barbershop_id");

    return Results.Ok(new
    {
        id = userId,
        name,
        email,
        role,
        barbershopId
    });
}).RequireAuthorization();

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
        await assignOwnerCmd.ExecuteNonQueryAsync(ct);
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

app.Run();
