using Microsoft.EntityFrameworkCore;
using BarberFlow.Infrastructure;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using BarberFlow.API.Constants;
using BarberFlow.API.HealthChecks;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Diagnostics;
using Npgsql;
using System.Threading.RateLimiting;
using BarberFlow.API.Endpoints;
// Application service interfaces — concrete implementations registered in later tasks (T03–T08)
using BarberFlow.Application.Services;


var builder = WebApplication.CreateBuilder(args);

// Configura DbContext con la cadena de conexión de appsettings.json
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

    // Public booking endpoints: 5 requests per minute per IP (REQ-RL-01 / REQ-PUB-04).
    options.AddPolicy("PublicBooking", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: $"public:{ip}",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
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
                (builder.Environment.IsDevelopment() && EndpointHelpers.IsLocalNetworkFrontendOrigin(origin)))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
builder.Services.AddHealthChecks()
    .AddCheck<DatabaseHealthCheck>("database");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ── Application Service Layer (DI seams) ─────────────────────────────────────
// Concrete implementations are introduced in later tasks. Each registration is
// marked with the task that provides the implementation so the TODOs are
// traceable in the backlog.
//
builder.Services.AddSingleton<IWorkingHoursService>(_ => new WorkingHoursService(connectionString));
builder.Services.AddScoped<ITimeOffService>(_ => new TimeOffService(connectionString));
builder.Services.AddScoped<IBookingRulesService>(_ => new BookingRulesService(connectionString));
builder.Services.AddScoped<IAvailabilityService>(sp =>
    new AvailabilityService(connectionString, sp.GetRequiredService<IBookingRulesService>()));
builder.Services.AddScoped<IBookingService>(_ => new BookingService(connectionString));
// ─────────────────────────────────────────────────────────────────────────────

var app = builder.Build();

await EnsureServicesImageColumnAsync(connectionString, app.Logger, CancellationToken.None);

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

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Permitted-Cross-Domain-Policies"] = "none";
    if (!app.Environment.IsDevelopment())
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});

app.UseCors("WebClient");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks(ApiConstants.Routes.HealthReady);

app.MapAuthEndpoints(connectionString, issuer!, audience!, key!, jwtSection)
   .MapBarbershopsEndpoints(connectionString)
   .MapServicesEndpoints(connectionString)
   .MapBarbersEndpoints(connectionString)
   .MapBarberCredentialsEndpoints(connectionString)
   .MapCustomersEndpoints(connectionString)
   .MapAppointmentsEndpoints(connectionString)
   .MapWorkingHoursEndpoints()
   .MapTimeOffEndpoints(connectionString)
   .MapBookingRulesEndpoints();

// Public booking endpoints — no authentication required (T10).
// The group is mapped under /public so all child routes resolve as /public/{slug}/*.
app.MapGroup("/public")
   .MapPublicEndpoints(connectionString);

app.Run();

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

    var connBuilder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Database = uri.AbsolutePath.Trim('/'),
    };

    if (!string.IsNullOrWhiteSpace(uri.UserInfo))
    {
        var parts = uri.UserInfo.Split(':', 2);
        connBuilder.Username = Uri.UnescapeDataString(parts[0]);
        if (parts.Length > 1)
        {
            connBuilder.Password = Uri.UnescapeDataString(parts[1]);
        }
    }

    if (!string.IsNullOrWhiteSpace(uri.Query))
    {
        var query = uri.Query.TrimStart('?');
        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = pair.Split('=', 2);
            var kvKey = Uri.UnescapeDataString(kv[0]);
            var value = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

            switch (kvKey.ToLowerInvariant())
            {
                case "sslmode":
                    if (Enum.TryParse<SslMode>(value, ignoreCase: true, out var sslMode))
                    {
                        connBuilder.SslMode = sslMode;
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

    return connBuilder.ConnectionString;
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
