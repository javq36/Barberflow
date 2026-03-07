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

bool IsOwner(ClaimsPrincipal user) =>
    string.Equals(user.FindFirstValue(ClaimTypes.Role), "Owner", StringComparison.OrdinalIgnoreCase);

bool TryGetBarbershopId(ClaimsPrincipal user, out Guid barbershopId, out IResult? error)
{
    barbershopId = Guid.Empty;
    error = null;

    var barbershopClaim = user.FindFirstValue("barbershop_id");
    if (!Guid.TryParse(barbershopClaim, out barbershopId))
    {
        error = Results.BadRequest(new { message = ApiConstants.Messages.BarbershopClaimMissing });
        return false;
    }

    return true;
}

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

app.MapPost(ApiConstants.Routes.Services, async (CreateServiceRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (string.IsNullOrWhiteSpace(request.Name) || request.DurationMinutes <= 0 || request.Price < 0)
    {
        return Results.BadRequest(new { message = "Invalid service payload." });
    }

    var serviceId = Guid.NewGuid();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        INSERT INTO services (id, barbershop_id, name, duration_minutes, price, active)
        VALUES (@id, @barbershopId, @name, @duration, @price, @active)", conn);

    cmd.Parameters.AddWithValue("id", serviceId);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("duration", request.DurationMinutes);
    cmd.Parameters.AddWithValue("price", request.Price);
    cmd.Parameters.AddWithValue("active", request.Active);

    await cmd.ExecuteNonQueryAsync(ct);

    return Results.Created($"{ApiConstants.Routes.Services}/{serviceId}", new
    {
        id = serviceId,
        barbershopId,
        request.Name,
        request.DurationMinutes,
        request.Price,
        request.Active
    });
}).RequireAuthorization();

app.MapGet(ApiConstants.Routes.Services, async (ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var rows = new List<object>();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        SELECT id, name, duration_minutes, price, active
        FROM services
        WHERE barbershop_id = @barbershopId
        ORDER BY name", conn);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    while (await reader.ReadAsync(ct))
    {
        rows.Add(new
        {
            id = reader.GetGuid(0),
            name = reader.GetString(1),
            durationMinutes = reader.GetInt32(2),
            price = reader.IsDBNull(3) ? 0m : reader.GetDecimal(3),
            active = reader.GetBoolean(4)
        });
    }

    return Results.Ok(rows);
}).RequireAuthorization();

app.MapPut($"{ApiConstants.Routes.Services}/{{id:guid}}", async (Guid id, UpdateServiceRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (string.IsNullOrWhiteSpace(request.Name) || request.DurationMinutes <= 0 || request.Price < 0)
    {
        return Results.BadRequest(new { message = "Invalid service payload." });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        UPDATE services
        SET name = @name,
            duration_minutes = @duration,
            price = @price,
            active = @active
        WHERE id = @id AND barbershop_id = @barbershopId", conn);

    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("duration", request.DurationMinutes);
    cmd.Parameters.AddWithValue("price", request.Price);
    cmd.Parameters.AddWithValue("active", request.Active);

    var affected = await cmd.ExecuteNonQueryAsync(ct);
    return affected == 0 ? Results.NotFound() : Results.NoContent();
}).RequireAuthorization();

app.MapDelete($"{ApiConstants.Routes.Services}/{{id:guid}}", async (Guid id, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand("DELETE FROM services WHERE id = @id AND barbershop_id = @barbershopId", conn);
    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);

    var affected = await cmd.ExecuteNonQueryAsync(ct);
    return affected == 0 ? Results.NotFound() : Results.NoContent();
}).RequireAuthorization();

app.MapPost(ApiConstants.Routes.Barbers, async (CreateBarberRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
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
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var rows = new List<object>();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        SELECT id, name, email, phone, active, created_at
        FROM users
        WHERE barbershop_id = @barbershopId AND role = 3
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
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
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

    await using var cmd = new NpgsqlCommand(@"
        UPDATE users
        SET name = @name,
            email = @email,
            phone = @phone,
            active = @active
        WHERE id = @id AND barbershop_id = @barbershopId AND role = 3", conn);

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
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        UPDATE users
        SET active = FALSE
        WHERE id = @id AND barbershop_id = @barbershopId AND role = 3", conn);

    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);

    var affected = await cmd.ExecuteNonQueryAsync(ct);
    return affected == 0 ? Results.NotFound() : Results.NoContent();
}).RequireAuthorization();

app.MapPost(ApiConstants.Routes.Customers, async (CreateCustomerRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Customer name is required." });
    }

    var customerId = Guid.NewGuid();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        INSERT INTO customers (id, barbershop_id, name, phone, email, notes, created_at)
        VALUES (@id, @barbershopId, @name, @phone, @email, @notes, NOW())", conn);

    cmd.Parameters.AddWithValue("id", customerId);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("email", (object?)request.Email?.Trim().ToLowerInvariant() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

    await cmd.ExecuteNonQueryAsync(ct);

    return Results.Created($"{ApiConstants.Routes.Customers}/{customerId}", new
    {
        id = customerId,
        barbershopId,
        name = request.Name.Trim(),
        request.Phone,
        request.Email,
        request.Notes
    });
}).RequireAuthorization();

app.MapGet(ApiConstants.Routes.Customers, async (ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var rows = new List<object>();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        SELECT id, name, phone, email, notes, created_at
        FROM customers
        WHERE barbershop_id = @barbershopId
        ORDER BY name", conn);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);

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
            createdAt = reader.GetDateTime(5)
        });
    }

    return Results.Ok(rows);
}).RequireAuthorization();

app.MapPut($"{ApiConstants.Routes.Customers}/{{id:guid}}", async (Guid id, UpdateCustomerRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Customer name is required." });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        UPDATE customers
        SET name = @name,
            phone = @phone,
            email = @email,
            notes = @notes
        WHERE id = @id AND barbershop_id = @barbershopId", conn);

    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("email", (object?)request.Email?.Trim().ToLowerInvariant() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

    var affected = await cmd.ExecuteNonQueryAsync(ct);
    return affected == 0 ? Results.NotFound() : Results.NoContent();
}).RequireAuthorization();

app.MapDelete($"{ApiConstants.Routes.Customers}/{{id:guid}}", async (Guid id, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand("DELETE FROM customers WHERE id = @id AND barbershop_id = @barbershopId", conn);
    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);

    var affected = await cmd.ExecuteNonQueryAsync(ct);
    return affected == 0 ? Results.NotFound() : Results.NoContent();
}).RequireAuthorization();

app.MapPost(ApiConstants.Routes.Appointments, async (CreateAppointmentRequest request, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (request.BarberId == Guid.Empty ||
        request.ServiceId == Guid.Empty ||
        request.CustomerId == Guid.Empty ||
        request.AppointmentTime == default)
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentPayload });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    int durationMinutes;
    await using (var serviceCmd = new NpgsqlCommand(@"
        SELECT duration_minutes
        FROM services
        WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
        LIMIT 1", conn))
    {
        serviceCmd.Parameters.AddWithValue("serviceId", request.ServiceId);
        serviceCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var durationResult = await serviceCmd.ExecuteScalarAsync(ct);
        if (durationResult is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "service" });
        }

        durationMinutes = Convert.ToInt32(durationResult);
    }

    await using (var barberCmd = new NpgsqlCommand(@"
        SELECT 1
        FROM users
        WHERE id = @barberId AND barbershop_id = @barbershopId AND role = 3 AND active = TRUE
        LIMIT 1", conn))
    {
        barberCmd.Parameters.AddWithValue("barberId", request.BarberId);
        barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var barberExists = await barberCmd.ExecuteScalarAsync(ct);
        if (barberExists is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
        }
    }

    await using (var customerCmd = new NpgsqlCommand(@"
        SELECT 1
        FROM customers
        WHERE id = @customerId AND barbershop_id = @barbershopId
        LIMIT 1", conn))
    {
        customerCmd.Parameters.AddWithValue("customerId", request.CustomerId);
        customerCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var customerExists = await customerCmd.ExecuteScalarAsync(ct);
        if (customerExists is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "customer" });
        }
    }

    var appointmentTime = request.AppointmentTime;
    var endTime = appointmentTime.AddMinutes(durationMinutes);

    await using (var overlapCmd = new NpgsqlCommand(@"
        SELECT 1
        FROM appointments
        WHERE barbershop_id = @barbershopId
          AND barber_id = @barberId
          AND status IN (1, 2)
          AND appointment_time < @endTime
          AND end_time > @startTime
        LIMIT 1", conn))
    {
        overlapCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        overlapCmd.Parameters.AddWithValue("barberId", request.BarberId);
        overlapCmd.Parameters.AddWithValue("startTime", appointmentTime);
        overlapCmd.Parameters.AddWithValue("endTime", endTime);

        var overlap = await overlapCmd.ExecuteScalarAsync(ct);
        if (overlap is not null)
        {
            return Results.Conflict(new { message = ApiConstants.Messages.AppointmentTimeCollision });
        }
    }

    var appointmentId = Guid.NewGuid();

    await using (var insertCmd = new NpgsqlCommand(@"
        INSERT INTO appointments (id, barbershop_id, barber_id, service_id, customer_id, appointment_time, end_time, status, notes, created_at)
        VALUES (@id, @barbershopId, @barberId, @serviceId, @customerId, @appointmentTime, @endTime, @status, @notes, NOW())", conn))
    {
        insertCmd.Parameters.AddWithValue("id", appointmentId);
        insertCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        insertCmd.Parameters.AddWithValue("barberId", request.BarberId);
        insertCmd.Parameters.AddWithValue("serviceId", request.ServiceId);
        insertCmd.Parameters.AddWithValue("customerId", request.CustomerId);
        insertCmd.Parameters.AddWithValue("appointmentTime", appointmentTime);
        insertCmd.Parameters.AddWithValue("endTime", endTime);
        insertCmd.Parameters.AddWithValue("status", 1); // Pending
        insertCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

        await insertCmd.ExecuteNonQueryAsync(ct);
    }

    return Results.Created($"{ApiConstants.Routes.Appointments}/{appointmentId}", new
    {
        id = appointmentId,
        barbershopId,
        request.BarberId,
        request.ServiceId,
        request.CustomerId,
        appointmentTime,
        endTime,
        status = 1,
        request.Notes
    });
}).RequireAuthorization();

app.MapGet(ApiConstants.Routes.Appointments, async (ClaimsPrincipal user, DateTime? from, DateTime? to, CancellationToken ct) =>
{
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var fromTime = from ?? DateTime.UtcNow.AddDays(-7);
    var toTime = to ?? DateTime.UtcNow.AddDays(30);

    if (toTime <= fromTime)
    {
        return Results.BadRequest(new { message = "'to' must be greater than 'from'." });
    }

    var rows = new List<object>();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        SELECT a.id, a.barber_id, a.service_id, a.customer_id, a.appointment_time, a.end_time, a.status, a.notes,
               u.name AS barber_name, c.name AS customer_name, s.name AS service_name
        FROM appointments a
        JOIN users u ON u.id = a.barber_id
        JOIN customers c ON c.id = a.customer_id
        JOIN services s ON s.id = a.service_id
        WHERE a.barbershop_id = @barbershopId
          AND a.appointment_time >= @fromTime
          AND a.appointment_time < @toTime
        ORDER BY a.appointment_time", conn);

    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("fromTime", fromTime);
    cmd.Parameters.AddWithValue("toTime", toTime);

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    while (await reader.ReadAsync(ct))
    {
        rows.Add(new
        {
            id = reader.GetGuid(0),
            barberId = reader.GetGuid(1),
            serviceId = reader.GetGuid(2),
            customerId = reader.GetGuid(3),
            appointmentTime = reader.GetDateTime(4),
            endTime = reader.GetDateTime(5),
            status = reader.GetInt32(6),
            notes = reader.IsDBNull(7) ? null : reader.GetString(7),
            barberName = reader.GetString(8),
            customerName = reader.GetString(9),
            serviceName = reader.GetString(10)
        });
    }

    return Results.Ok(rows);
}).RequireAuthorization();

app.MapGet(ApiConstants.Routes.AvailabilitySlots, async (Guid barberId, Guid serviceId, DateOnly date, ClaimsPrincipal user, CancellationToken ct) =>
{
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (barberId == Guid.Empty || serviceId == Guid.Empty)
    {
        return Results.BadRequest(new { message = "barberId and serviceId are required." });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    int durationMinutes;
    await using (var serviceCmd = new NpgsqlCommand(@"
        SELECT duration_minutes
        FROM services
        WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
        LIMIT 1", conn))
    {
        serviceCmd.Parameters.AddWithValue("serviceId", serviceId);
        serviceCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var durationResult = await serviceCmd.ExecuteScalarAsync(ct);
        if (durationResult is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "service" });
        }

        durationMinutes = Convert.ToInt32(durationResult);
    }

    await using (var barberCmd = new NpgsqlCommand(@"
        SELECT 1
        FROM users
        WHERE id = @barberId AND barbershop_id = @barbershopId AND role = 3 AND active = TRUE
        LIMIT 1", conn))
    {
        barberCmd.Parameters.AddWithValue("barberId", barberId);
        barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var barberExists = await barberCmd.ExecuteScalarAsync(ct);
        if (barberExists is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
        }
    }

    var dayStart = date.ToDateTime(TimeOnly.Parse("09:00"));
    var dayEnd = date.ToDateTime(TimeOnly.Parse("18:00"));
    const int slotIntervalMinutes = 30;

    var busyRanges = new List<(DateTime start, DateTime end)>();
    await using (var busyCmd = new NpgsqlCommand(@"
        SELECT appointment_time, end_time
        FROM appointments
        WHERE barbershop_id = @barbershopId
          AND barber_id = @barberId
          AND status IN (1, 2)
          AND appointment_time < @dayEnd
          AND end_time > @dayStart
        ORDER BY appointment_time", conn))
    {
        busyCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        busyCmd.Parameters.AddWithValue("barberId", barberId);
        busyCmd.Parameters.AddWithValue("dayStart", dayStart);
        busyCmd.Parameters.AddWithValue("dayEnd", dayEnd);

        await using var busyReader = await busyCmd.ExecuteReaderAsync(ct);
        while (await busyReader.ReadAsync(ct))
        {
            busyRanges.Add((busyReader.GetDateTime(0), busyReader.GetDateTime(1)));
        }
    }

    var slots = new List<object>();

    for (var cursor = dayStart; cursor.AddMinutes(durationMinutes) <= dayEnd; cursor = cursor.AddMinutes(slotIntervalMinutes))
    {
        var proposedEnd = cursor.AddMinutes(durationMinutes);
        var overlaps = busyRanges.Any(r => cursor < r.end && proposedEnd > r.start);

        if (!overlaps)
        {
            slots.Add(new
            {
                start = cursor,
                end = proposedEnd
            });
        }
    }

    return Results.Ok(new
    {
        barberId,
        serviceId,
        date,
        durationMinutes,
        slotIntervalMinutes,
        slots
    });
}).RequireAuthorization();

app.Run();
