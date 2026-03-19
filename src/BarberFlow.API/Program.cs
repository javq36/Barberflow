using Microsoft.EntityFrameworkCore;
using BarberFlow.Infrastructure;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using BarberFlow.API.Constants;
using BarberFlow.API.HealthChecks;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Diagnostics;
using BarberFlow.API.Contracts;
using System.IdentityModel.Tokens.Jwt;
using Npgsql;
using System.Data;
using System.Net;
using System.Threading.RateLimiting;


var builder = WebApplication.CreateBuilder(args);

// Configura DbContext con la cadena de conexi�n de appsettings.json
var connectionString = ResolveDefaultConnectionString(builder.Configuration);
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

if (IsInsecureJwtKey(key))
{
    throw new InvalidOperationException("JWT key is insecure. Use a strong non-placeholder secret with at least 32 characters.");
}

if (Encoding.UTF8.GetByteCount(key) < 32)
{
    throw new InvalidOperationException("JWT key is too short. Use at least 32 bytes of entropy.");
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
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("AuthSensitive", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var route = context.Request.Path.ToString().ToLowerInvariant();

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"{ip}:{route}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 8,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
                AutoReplenishment = true
            });
    });
});
var configuredCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()
    ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim())
    .ToArray()
    ?? Array.Empty<string>();

var defaultCorsOrigins = new[]
{
    "http://localhost:3000",
    "http://localhost:3001",
    "https://localhost:3000",
    "https://localhost:3001"
};

var strictAllowedOrigins = defaultCorsOrigins
    .Concat(configuredCorsOrigins)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

builder.Services.AddCors(options =>
{
    options.AddPolicy("WebClient", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
                strictAllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
                (builder.Environment.IsDevelopment() && IsLocalNetworkFrontendOrigin(origin)))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database");

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

await EnsureServicesImageColumnAsync(connectionString, app.Logger, CancellationToken.None);

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GlobalExceptionHandler");

        if (exceptionHandlerFeature?.Error is not null)
        {
            logger.LogError(exceptionHandlerFeature.Error, "Unhandled exception while processing request.");
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";

        await context.Response.WriteAsJsonAsync(new
        {
            message = "Unexpected server error.",
            traceId = context.TraceIdentifier
        });
    });
});

app.UseStatusCodePages(async statusContext =>
{
    var response = statusContext.HttpContext.Response;
    if (response.HasStarted)
    {
        return;
    }

    response.ContentType = "application/json";
    await response.WriteAsJsonAsync(new
    {
        message = $"Request failed with status code {response.StatusCode}.",
        traceId = statusContext.HttpContext.TraceIdentifier
    });
});

app.UseCors("WebClient");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

bool IsInsecureJwtKey(string jwtKey)
{
    var normalized = jwtKey.Trim();
    var knownPlaceholders = new[]
    {
        "CHANGE_ME_WITH_AT_LEAST_32_CHAR_RANDOM_SECRET",
        "DEV_ONLY_CHANGE_ME_WITH_AT_LEAST_32_CHAR_SECRET",
        "your_super_secret_key_change_me"
    };

    return knownPlaceholders.Contains(normalized, StringComparer.Ordinal);
}

string ResolveDefaultConnectionString(IConfiguration configuration)
{
    var configured = configuration.GetConnectionString("DefaultConnection");
    if (IsValidConfiguredConnectionString(configured))
    {
        return configured!.Trim();
    }

    var railwayDatabaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrWhiteSpace(railwayDatabaseUrl))
    {
        return ConvertDatabaseUrlToNpgsqlConnectionString(railwayDatabaseUrl.Trim());
    }

    throw new InvalidOperationException(
        "Database connection is not configured. Set ConnectionStrings:DefaultConnection " +
        "(or env var ConnectionStrings__DefaultConnection) or set DATABASE_URL.");
}

bool IsValidConfiguredConnectionString(string? value)
{
    if (string.IsNullOrWhiteSpace(value))
    {
        return false;
    }

    return !string.Equals(
        value.Trim(),
        "SET_ME_IN_USER_SECRETS_OR_ENV",
        StringComparison.OrdinalIgnoreCase);
}

string ConvertDatabaseUrlToNpgsqlConnectionString(string databaseUrl)
{
    if (databaseUrl.StartsWith("Host=", StringComparison.OrdinalIgnoreCase))
    {
        return databaseUrl;
    }

    if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri) ||
        !(string.Equals(uri.Scheme, "postgres", StringComparison.OrdinalIgnoreCase) ||
          string.Equals(uri.Scheme, "postgresql", StringComparison.OrdinalIgnoreCase)))
    {
        return databaseUrl;
    }

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Database = uri.AbsolutePath.Trim('/'),
    };

    if (!string.IsNullOrWhiteSpace(uri.UserInfo))
    {
        var parts = uri.UserInfo.Split(':', 2);
        builder.Username = Uri.UnescapeDataString(parts[0]);
        if (parts.Length > 1)
        {
            builder.Password = Uri.UnescapeDataString(parts[1]);
        }
    }

    if (!string.IsNullOrWhiteSpace(uri.Query))
    {
        var query = uri.Query.TrimStart('?');
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            var key = Uri.UnescapeDataString(kv[0]);
            var value = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

            switch (key.ToLowerInvariant())
            {
                case "sslmode":
                    if (Enum.TryParse<SslMode>(value, ignoreCase: true, out var sslMode))
                    {
                        builder.SslMode = sslMode;
                    }
                    break;
                case "trust server certificate":
                case "trustservercertificate":
                    // Accepted for compatibility with legacy connection strings.
                    break;
                default:
                    break;
            }
        }
    }

    return builder.ConnectionString;
}

bool IsOwner(ClaimsPrincipal user) =>
    string.Equals(user.FindFirstValue(ClaimTypes.Role), "Owner", StringComparison.OrdinalIgnoreCase);

bool IsSuperAdmin(ClaimsPrincipal user) =>
    string.Equals(user.FindFirstValue(ClaimTypes.Role), "SuperAdmin", StringComparison.OrdinalIgnoreCase);

bool CanManageBarbershopProfile(ClaimsPrincipal user) => IsOwner(user) || IsSuperAdmin(user);

bool IsLocalNetworkFrontendOrigin(string? origin)
{
    if (string.IsNullOrWhiteSpace(origin) || !Uri.TryCreate(origin, UriKind.Absolute, out var uri))
    {
        return false;
    }

    var isHttp = string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase);
    var isHttps = string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

    if (!isHttp && !isHttps)
    {
        return false;
    }

    if (uri.IsLoopback)
    {
        return uri.Port is 3000 or 3001;
    }

    if (!IPAddress.TryParse(uri.Host, out var ipAddress))
    {
        return false;
    }

    return uri.Port is 3000 or 3001 && IsPrivateIpv4(ipAddress);
}

bool IsPrivateIpv4(IPAddress ipAddress)
{
    if (ipAddress.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
    {
        return false;
    }

    var bytes = ipAddress.GetAddressBytes();

    // RFC1918 private ranges.
    return bytes[0] == 10 ||
           (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
           (bytes[0] == 192 && bytes[1] == 168);
}

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

async Task<bool> HasServicesImageColumnAsync(NpgsqlConnection conn, CancellationToken ct)
{
    await using var cmd = new NpgsqlCommand(@"
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'services'
              AND column_name = 'image_url'
        )", conn);

    var exists = await cmd.ExecuteScalarAsync(ct);
    return exists is bool value && value;
}

async Task EnsureServicesImageColumnAsync(string? connString, ILogger logger, CancellationToken ct)
{
    if (string.IsNullOrWhiteSpace(connString))
    {
        logger.LogWarning("DefaultConnection is missing. Skipping services.image_url column check.");
        return;
    }

    try
    {
        await using var conn = new NpgsqlConnection(connString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            ALTER TABLE IF EXISTS public.services
            ADD COLUMN IF NOT EXISTS image_url TEXT;", conn);

        await cmd.ExecuteNonQueryAsync(ct);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not ensure services.image_url column at startup.");
    }
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
    try
    {
        await using var insertCmd = new NpgsqlCommand(@"
            INSERT INTO users (id, barbershop_id, name, email, phone, role, password_hash, active, created_at)
            VALUES (@id, NULL, @name, @email, @phone, @role, @passwordHash, TRUE, NOW())", conn);

        insertCmd.Parameters.AddWithValue("id", userId);
        insertCmd.Parameters.AddWithValue("name", request.Name.Trim());
        insertCmd.Parameters.AddWithValue("email", request.Email.Trim().ToLowerInvariant());
        insertCmd.Parameters.AddWithValue("phone", (object?)request.Phone?.Trim() ?? DBNull.Value);
        insertCmd.Parameters.AddWithValue("role", 2); // Owner
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

    Guid? existingBarbershopId;
    await using (var ownerLockCmd = new NpgsqlCommand(@"
        SELECT barbershop_id
        FROM users
        WHERE id = @ownerId
        FOR UPDATE", conn, transaction))
    {
        ownerLockCmd.Parameters.AddWithValue("ownerId", ownerId);
        var currentValue = await ownerLockCmd.ExecuteScalarAsync(ct);

        if (currentValue is null || currentValue == DBNull.Value)
        {
            existingBarbershopId = null;
        }
        else
        {
            existingBarbershopId = (Guid)currentValue;
        }
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
    if (!CanManageBarbershopProfile(user))
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
    if (!CanManageBarbershopProfile(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
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

    if (string.IsNullOrWhiteSpace(request.Name) || request.Price < 0)
    {
        return Results.BadRequest(new { message = "Invalid service payload." });
    }

    var normalizedDuration = request.DurationMinutes > 0
        ? request.DurationMinutes
        : 30;

    var normalizedImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl)
        ? null
        : request.ImageUrl.Trim();

    if (normalizedImageUrl is not null && normalizedImageUrl.Length > 4_000_000)
    {
        return Results.BadRequest(new { message = "Service image is too large." });
    }

    var serviceId = Guid.NewGuid();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    var hasImageColumn = await HasServicesImageColumnAsync(conn, ct);

    var insertSql = hasImageColumn
        ? @"
        INSERT INTO services (id, barbershop_id, name, duration_minutes, price, active, image_url)
        VALUES (@id, @barbershopId, @name, @duration, @price, @active, @imageUrl)"
        : @"
        INSERT INTO services (id, barbershop_id, name, duration_minutes, price, active)
        VALUES (@id, @barbershopId, @name, @duration, @price, @active)";

    await using var cmd = new NpgsqlCommand(insertSql, conn);

    cmd.Parameters.AddWithValue("id", serviceId);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("duration", normalizedDuration);
    cmd.Parameters.AddWithValue("price", request.Price);
    cmd.Parameters.AddWithValue("active", request.Active);
    if (hasImageColumn)
    {
        cmd.Parameters.AddWithValue("imageUrl", (object?)normalizedImageUrl ?? DBNull.Value);
    }

    await cmd.ExecuteNonQueryAsync(ct);

    return Results.Created($"{ApiConstants.Routes.Services}/{serviceId}", new
    {
        id = serviceId,
        barbershopId,
        request.Name,
        DurationMinutes = normalizedDuration,
        request.Price,
        request.Active,
        imageUrl = hasImageColumn ? normalizedImageUrl : null
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

    var hasImageColumn = await HasServicesImageColumnAsync(conn, ct);

    var selectSql = hasImageColumn
        ? @"
        SELECT id, name, duration_minutes, price, active, image_url
        FROM services
        WHERE barbershop_id = @barbershopId
        ORDER BY name"
        : @"
        SELECT id, name, duration_minutes, price, active
        FROM services
        WHERE barbershop_id = @barbershopId
        ORDER BY name";

    await using var cmd = new NpgsqlCommand(selectSql, conn);
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
            active = reader.GetBoolean(4),
            imageUrl = hasImageColumn && !reader.IsDBNull(5) ? reader.GetString(5) : null
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

    if (string.IsNullOrWhiteSpace(request.Name) || request.Price < 0)
    {
        return Results.BadRequest(new { message = "Invalid service payload." });
    }

    var normalizedDuration = request.DurationMinutes > 0
        ? request.DurationMinutes
        : 30;

    var normalizedImageUrl = string.IsNullOrWhiteSpace(request.ImageUrl)
        ? null
        : request.ImageUrl.Trim();

    if (normalizedImageUrl is not null && normalizedImageUrl.Length > 4_000_000)
    {
        return Results.BadRequest(new { message = "Service image is too large." });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    var hasImageColumn = await HasServicesImageColumnAsync(conn, ct);

    var updateSql = hasImageColumn
        ? @"
        UPDATE services
        SET name = @name,
            duration_minutes = @duration,
            price = @price,
            active = @active,
            image_url = @imageUrl
        WHERE id = @id AND barbershop_id = @barbershopId"
        : @"
        UPDATE services
        SET name = @name,
            duration_minutes = @duration,
            price = @price,
            active = @active
        WHERE id = @id AND barbershop_id = @barbershopId";

    await using var cmd = new NpgsqlCommand(updateSql, conn);

    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("duration", normalizedDuration);
    cmd.Parameters.AddWithValue("price", request.Price);
    cmd.Parameters.AddWithValue("active", request.Active);
    if (hasImageColumn)
    {
        cmd.Parameters.AddWithValue("imageUrl", (object?)normalizedImageUrl ?? DBNull.Value);
    }

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

    var normalizedPhone = string.IsNullOrWhiteSpace(request.Phone)
        ? string.Empty
        : new string(request.Phone.Where(char.IsDigit).ToArray());

    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Customer name is required." });
    }

    if (normalizedPhone.Length != 10)
    {
        return Results.BadRequest(new { message = "Customer phone must contain exactly 10 digits." });
    }

    var customerId = Guid.NewGuid();

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    await using var cmd = new NpgsqlCommand(@"
        INSERT INTO customers (id, barbershop_id, name, phone, email, notes, active, created_at)
        VALUES (@id, @barbershopId, @name, @phone, @email, @notes, @active, NOW())", conn);

    cmd.Parameters.AddWithValue("id", customerId);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("phone", normalizedPhone);
    cmd.Parameters.AddWithValue("email", (object?)request.Email?.Trim().ToLowerInvariant() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("active", request.IsActive);

    await cmd.ExecuteNonQueryAsync(ct);

    return Results.Created($"{ApiConstants.Routes.Customers}/{customerId}", new
    {
        id = customerId,
        barbershopId,
        name = request.Name.Trim(),
        phone = normalizedPhone,
        request.Email,
        request.Notes,
        isActive = request.IsActive
    });
}).RequireAuthorization();

app.MapGet(ApiConstants.Routes.Customers, async (ClaimsPrincipal user, string? query, CancellationToken ct) =>
{
    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var normalizedQuery = string.IsNullOrWhiteSpace(query)
        ? string.Empty
        : query.Trim();
    var queryPattern = string.IsNullOrWhiteSpace(normalizedQuery)
        ? string.Empty
        : $"%{normalizedQuery}%";

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
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("queryPattern", queryPattern);

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
            createdAt = reader.GetDateTime(6)
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

    var normalizedPhone = string.IsNullOrWhiteSpace(request.Phone)
        ? string.Empty
        : new string(request.Phone.Where(char.IsDigit).ToArray());

    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Customer name is required." });
    }

    if (normalizedPhone.Length != 10)
    {
        return Results.BadRequest(new { message = "Customer phone must contain exactly 10 digits." });
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

    cmd.Parameters.AddWithValue("id", id);
    cmd.Parameters.AddWithValue("barbershopId", barbershopId);
    cmd.Parameters.AddWithValue("name", request.Name.Trim());
    cmd.Parameters.AddWithValue("phone", normalizedPhone);
    cmd.Parameters.AddWithValue("email", (object?)request.Email?.Trim().ToLowerInvariant() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);
    cmd.Parameters.AddWithValue("active", request.IsActive);

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

    await using var cmd = new NpgsqlCommand(@"
        UPDATE customers
        SET active = FALSE
        WHERE id = @id AND barbershop_id = @barbershopId", conn);
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
        WHERE id = @customerId AND barbershop_id = @barbershopId AND active = TRUE
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

app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsStatusSuffix}", async (
    Guid id,
    UpdateAppointmentStatusRequest request,
    ClaimsPrincipal user,
    CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    var validStatuses = new[] { 1, 2, 3, 4 };
    if (!validStatuses.Contains(request.Status))
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentStatus });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    int currentStatus;
    await using (var getStatusCmd = new NpgsqlCommand(@"
        SELECT status
        FROM appointments
        WHERE id = @id AND barbershop_id = @barbershopId
        LIMIT 1", conn))
    {
        getStatusCmd.Parameters.AddWithValue("id", id);
        getStatusCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await getStatusCmd.ExecuteScalarAsync(ct);
        if (result is null)
        {
            return Results.NotFound();
        }

        currentStatus = Convert.ToInt32(result);
    }

    if ((currentStatus == 3 || currentStatus == 4) && request.Status != currentStatus)
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeUpdated });
    }

    await using (var updateCmd = new NpgsqlCommand(@"
        UPDATE appointments
        SET status = @status,
            notes = @notes
        WHERE id = @id AND barbershop_id = @barbershopId", conn))
    {
        updateCmd.Parameters.AddWithValue("id", id);
        updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        updateCmd.Parameters.AddWithValue("status", request.Status);
        updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

        await updateCmd.ExecuteNonQueryAsync(ct);
    }

    return Results.Ok(new
    {
        id,
        status = request.Status,
        notes = request.Notes
    });
}).RequireAuthorization();

app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsRescheduleSuffix}", async (
    Guid id,
    RescheduleAppointmentRequest request,
    ClaimsPrincipal user,
    CancellationToken ct) =>
{
    if (!IsOwner(user))
    {
        return Results.Problem(title: ApiConstants.Messages.OwnerOnlyAction, statusCode: StatusCodes.Status403Forbidden);
    }

    if (!TryGetBarbershopId(user, out var barbershopId, out var error))
    {
        return error!;
    }

    if (request.AppointmentTime == default)
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.InvalidAppointmentPayload });
    }

    await using var conn = new NpgsqlConnection(connectionString);
    await conn.OpenAsync(ct);

    Guid currentBarberId;
    Guid currentServiceId;
    int currentStatus;

    await using (var getCurrentCmd = new NpgsqlCommand(@"
        SELECT barber_id, service_id, status
        FROM appointments
        WHERE id = @id AND barbershop_id = @barbershopId
        LIMIT 1", conn))
    {
        getCurrentCmd.Parameters.AddWithValue("id", id);
        getCurrentCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        await using var reader = await getCurrentCmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return Results.NotFound();
        }

        currentBarberId = reader.GetGuid(0);
        currentServiceId = reader.GetGuid(1);
        currentStatus = reader.GetInt32(2);
    }

    if (currentStatus == 3 || currentStatus == 4)
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeUpdated });
    }

    var nextBarberId = request.BarberId ?? currentBarberId;
    var nextServiceId = request.ServiceId ?? currentServiceId;

    int durationMinutes;
    await using (var serviceCmd = new NpgsqlCommand(@"
        SELECT duration_minutes
        FROM services
        WHERE id = @serviceId AND barbershop_id = @barbershopId AND active = TRUE
        LIMIT 1", conn))
    {
        serviceCmd.Parameters.AddWithValue("serviceId", nextServiceId);
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
        barberCmd.Parameters.AddWithValue("barberId", nextBarberId);
        barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var barberExists = await barberCmd.ExecuteScalarAsync(ct);
        if (barberExists is null)
        {
            return Results.BadRequest(new { message = ApiConstants.Messages.ResourceOutOfTenantScope, resource = "barber" });
        }
    }

    var nextStart = request.AppointmentTime;
    var nextEnd = nextStart.AddMinutes(durationMinutes);

    await using (var overlapCmd = new NpgsqlCommand(@"
        SELECT 1
        FROM appointments
        WHERE barbershop_id = @barbershopId
          AND barber_id = @barberId
          AND id <> @appointmentId
          AND status IN (1, 2)
          AND appointment_time < @endTime
          AND end_time > @startTime
        LIMIT 1", conn))
    {
        overlapCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        overlapCmd.Parameters.AddWithValue("barberId", nextBarberId);
        overlapCmd.Parameters.AddWithValue("appointmentId", id);
        overlapCmd.Parameters.AddWithValue("startTime", nextStart);
        overlapCmd.Parameters.AddWithValue("endTime", nextEnd);

        var overlap = await overlapCmd.ExecuteScalarAsync(ct);
        if (overlap is not null)
        {
            return Results.Conflict(new { message = ApiConstants.Messages.AppointmentRescheduleCollision });
        }
    }

    await using (var updateCmd = new NpgsqlCommand(@"
        UPDATE appointments
        SET barber_id = @barberId,
            service_id = @serviceId,
            appointment_time = @appointmentTime,
            end_time = @endTime,
            notes = @notes
        WHERE id = @id AND barbershop_id = @barbershopId", conn))
    {
        updateCmd.Parameters.AddWithValue("id", id);
        updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        updateCmd.Parameters.AddWithValue("barberId", nextBarberId);
        updateCmd.Parameters.AddWithValue("serviceId", nextServiceId);
        updateCmd.Parameters.AddWithValue("appointmentTime", nextStart);
        updateCmd.Parameters.AddWithValue("endTime", nextEnd);
        updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);

        await updateCmd.ExecuteNonQueryAsync(ct);
    }

    return Results.Ok(new
    {
        id,
        barberId = nextBarberId,
        serviceId = nextServiceId,
        appointmentTime = nextStart,
        endTime = nextEnd,
        notes = request.Notes
    });
}).RequireAuthorization();

app.MapPatch($"{ApiConstants.Routes.Appointments}/{{id:guid}}{ApiConstants.Routes.AppointmentsCancelSuffix}", async (
    Guid id,
    CancelAppointmentRequest request,
    ClaimsPrincipal user,
    CancellationToken ct) =>
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

    int currentStatus;
    await using (var getStatusCmd = new NpgsqlCommand(@"
        SELECT status
        FROM appointments
        WHERE id = @id AND barbershop_id = @barbershopId
        LIMIT 1", conn))
    {
        getStatusCmd.Parameters.AddWithValue("id", id);
        getStatusCmd.Parameters.AddWithValue("barbershopId", barbershopId);

        var result = await getStatusCmd.ExecuteScalarAsync(ct);
        if (result is null)
        {
            return Results.NotFound();
        }

        currentStatus = Convert.ToInt32(result);
    }

    if (currentStatus == 4)
    {
        return Results.BadRequest(new { message = ApiConstants.Messages.AppointmentCannotBeCancelled });
    }

    await using (var updateCmd = new NpgsqlCommand(@"
        UPDATE appointments
        SET status = 3,
            notes = @notes
        WHERE id = @id AND barbershop_id = @barbershopId", conn))
    {
        updateCmd.Parameters.AddWithValue("id", id);
        updateCmd.Parameters.AddWithValue("barbershopId", barbershopId);
        updateCmd.Parameters.AddWithValue("notes", (object?)request.Notes?.Trim() ?? DBNull.Value);
        await updateCmd.ExecuteNonQueryAsync(ct);
    }

    return Results.Ok(new
    {
        id,
        status = 3,
        notes = request.Notes
    });
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
