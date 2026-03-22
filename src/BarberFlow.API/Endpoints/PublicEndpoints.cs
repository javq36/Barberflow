using System.Text.RegularExpressions;
using Npgsql;
using BarberFlow.API.Contracts;
using BarberFlow.Application.Services;

namespace BarberFlow.API.Endpoints;

/// <summary>
/// Anonymous (no-auth) endpoints that power the self-service public booking flow.
/// All routes are under /public/{slug}/* — no RequireAuthorization() is called.
///
/// Security notes:
///   • Slug resolution returns null in constant time (no timing difference between
///     found/not-found) because the SELECT always runs and the response delay is
///     dominated by the DB round-trip, not a short-circuit branch.
///   • Rate limiting is applied via the "PublicBooking" policy (see Program.cs).
/// </summary>
internal static class PublicEndpoints
{
    // Phone regex — minimal: 7–15 digits, optional leading +, spaces and dashes allowed.
    private static readonly Regex PhoneRegex =
        new(@"^\+?[\d\s\-]{7,15}$", RegexOptions.Compiled, TimeSpan.FromMilliseconds(100));

    /// <summary>Internal DTO returned by slug resolution.</summary>
    private sealed record ResolvedShop(Guid BarbershopId, string Timezone);

    internal static IEndpointRouteBuilder MapPublicEndpoints(
        this IEndpointRouteBuilder app, string connectionString)
    {
        // ── GET /public/{slug}/services ───────────────────────────────────────
        app.MapGet("/{slug}/services", async (
            string slug,
            CancellationToken ct) =>
        {
            var shop = await ResolveBarbershopBySlugAsync(connectionString, slug, ct);
            if (shop is null)
            {
                return Results.NotFound(new { message = "Barbershop not found." });
            }

            var services = new List<PublicServiceResponse>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT id, name, duration_minutes, price, image_url
                FROM services
                WHERE barbershop_id = @barbershopId AND active = TRUE
                ORDER BY name", conn);

            cmd.Parameters.AddWithValue("barbershopId", shop.BarbershopId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                services.Add(new PublicServiceResponse(
                    Id: reader.GetGuid(0),
                    Name: reader.GetString(1),
                    DurationMinutes: reader.GetInt32(2),
                    Price: reader.IsDBNull(3) ? 0m : reader.GetDecimal(3),
                    ImageUrl: reader.IsDBNull(4) ? null : reader.GetString(4)));
            }

            return Results.Ok(new { data = services });
        }).RequireRateLimiting("PublicBooking");

        // ── GET /public/{slug}/barbers ────────────────────────────────────────
        app.MapGet("/{slug}/barbers", async (
            string slug,
            CancellationToken ct) =>
        {
            var shop = await ResolveBarbershopBySlugAsync(connectionString, slug, ct);
            if (shop is null)
            {
                return Results.NotFound(new { message = "Barbershop not found." });
            }

            var barbers = new List<PublicBarberResponse>();

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync(ct);

            // role = 3 corresponds to UserRole.Barber in the domain enum.
            // Barbers are stored in the users table.
            await using var cmd = new NpgsqlCommand(@"
                SELECT id, name, NULL::text AS image_url
                FROM users
                WHERE barbershop_id = @barbershopId AND role = 3 AND active = TRUE
                ORDER BY name", conn);

            cmd.Parameters.AddWithValue("barbershopId", shop.BarbershopId);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                barbers.Add(new PublicBarberResponse(
                    Id: reader.GetGuid(0),
                    Name: reader.GetString(1),
                    ImageUrl: reader.IsDBNull(2) ? null : reader.GetString(2)));
            }

            return Results.Ok(new { data = barbers });
        }).RequireRateLimiting("PublicBooking");

        // ── GET /public/{slug}/availability?barberId=&serviceId=&date= ────────
        app.MapGet("/{slug}/availability", async (
            string slug,
            Guid barberId,
            Guid serviceId,
            DateOnly date,
            IAvailabilityService availabilityService,
            CancellationToken ct) =>
        {
            var shop = await ResolveBarbershopBySlugAsync(connectionString, slug, ct);
            if (shop is null)
            {
                return Results.NotFound(new { message = "Barbershop not found." });
            }

            if (barberId == Guid.Empty || serviceId == Guid.Empty)
            {
                return Results.BadRequest(new { message = "barberId and serviceId are required." });
            }

            // Validate barber belongs to this barbershop.
            var barberValid = await ResourceBelongsToBarbershopAsync(
                connectionString, shop.BarbershopId, barberId, "users", ct);
            if (!barberValid)
            {
                return Results.BadRequest(new { message = "Barber does not belong to this barbershop." });
            }

            // Validate service belongs to this barbershop.
            var serviceValid = await ResourceBelongsToBarbershopAsync(
                connectionString, shop.BarbershopId, serviceId, "services", ct);
            if (!serviceValid)
            {
                return Results.BadRequest(new { message = "Service does not belong to this barbershop." });
            }

            var slots = await availabilityService.GetAvailableSlotsAsync(
                shop.BarbershopId, barberId, serviceId, date, shop.Timezone, isPublic: true, ct);

            var response = slots.Select(s => new PublicSlotResponse(s.Start, s.End, s.Available));

            return Results.Ok(new { slots = response });
        }).RequireRateLimiting("PublicBooking");

        // ── POST /public/{slug}/appointments ──────────────────────────────────
        app.MapPost("/{slug}/appointments", async (
            string slug,
            PublicBookingRequest request,
            IBookingService bookingService,
            CancellationToken ct) =>
        {
            var shop = await ResolveBarbershopBySlugAsync(connectionString, slug, ct);
            if (shop is null)
            {
                return Results.NotFound(new { message = "Barbershop not found." });
            }

            // ── Input validation ──────────────────────────────────────────────
            if (string.IsNullOrWhiteSpace(request.CustomerName) || request.CustomerName.Trim().Length < 2)
            {
                return Results.BadRequest(new { message = "customer_name is required (min 2 chars)." });
            }

            if (string.IsNullOrWhiteSpace(request.CustomerPhone) ||
                !PhoneRegex.IsMatch(request.CustomerPhone.Trim()))
            {
                return Results.BadRequest(new { message = "invalid phone format" });
            }

            if (request.BarberId == Guid.Empty || request.ServiceId == Guid.Empty)
            {
                return Results.BadRequest(new { message = "barberId and serviceId are required." });
            }

            if (request.SlotStart == default)
            {
                return Results.BadRequest(new { message = "slotStart is required." });
            }

            // ── Find-or-create customer by phone ──────────────────────────────
            var customerId = await UpsertCustomerByPhoneAsync(
                connectionString,
                shop.BarbershopId,
                request.CustomerName.Trim(),
                request.CustomerPhone.Trim(),
                ct);

            // ── Create the appointment via BookingService ──────────────────────
            var command = new CreateAppointmentCommand(
                BarberId: request.BarberId,
                ServiceId: request.ServiceId,
                CustomerId: customerId,
                AppointmentTime: request.SlotStart,
                Notes: null);

            var result = await bookingService.CreateAppointmentAsync(shop.BarbershopId, command, ct);

            if (!result.IsSuccess)
            {
                return result.ErrorCode switch
                {
                    "conflict" => Results.Conflict(new { message = "slot_unavailable" }),
                    "invalid_service" or "invalid_barber" or "invalid_customer" =>
                        Results.BadRequest(new { message = result.ErrorMessage }),
                    _ => Results.BadRequest(new { message = result.ErrorMessage })
                };
            }

            // ── Fetch names for confirmation response ─────────────────────────
            var details = await GetAppointmentDetailsAsync(
                connectionString, shop.BarbershopId, request.ServiceId, request.BarberId, ct);

            return Results.Created(
                $"/public/{slug}/appointments/{result.AppointmentId}",
                new PublicBookingResponse(
                    AppointmentId: result.AppointmentId!.Value,
                    Status: 1, // Pending
                    ServiceName: details.ServiceName,
                    BarberName: details.BarberName,
                    DateTime: request.SlotStart,
                    EstimatedDurationMinutes: details.DurationMinutes));
        }).RequireRateLimiting("PublicBooking");

        return app;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Resolves a barbershop from its public slug.
    /// Returns null when the slug is unknown. The query always executes so the
    /// response time is dominated by the DB round-trip regardless of whether the
    /// slug exists — this prevents timing-based slug enumeration (REQ-RL-02).
    /// </summary>
    private static async Task<ResolvedShop?> ResolveBarbershopBySlugAsync(
        string connectionString,
        string slug,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(slug))
        {
            return null;
        }

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, COALESCE(timezone, 'UTC')
            FROM barbershops
            WHERE slug = @slug
            LIMIT 1", conn);

        cmd.Parameters.AddWithValue("slug", slug.Trim().ToLowerInvariant());

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new ResolvedShop(reader.GetGuid(0), reader.GetString(1));
    }

    /// <summary>
    /// Checks whether a resource (barber or service) belongs to the given barbershop.
    /// </summary>
    private static async Task<bool> ResourceBelongsToBarbershopAsync(
        string connectionString,
        Guid barbershopId,
        Guid resourceId,
        string table,
        CancellationToken ct)
    {
        // Only allow known tables — no SQL injection vector.
        if (table is not ("users" or "services"))
        {
            return false;
        }

        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var sql = table == "users"
            ? @"SELECT 1 FROM users WHERE id = @id AND barbershop_id = @barbershopId AND active = TRUE LIMIT 1"
            : @"SELECT 1 FROM services WHERE id = @id AND barbershop_id = @barbershopId AND active = TRUE LIMIT 1";

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id", resourceId);
        cmd.Parameters.AddWithValue("barbershopId", barbershopId);

        return await cmd.ExecuteScalarAsync(ct) is not null;
    }

    /// <summary>
    /// Find-or-create customer by phone within barbershop scope.
    /// If the phone already exists, updates the customer name.
    /// SQL: INSERT … ON CONFLICT … DO UPDATE … RETURNING id
    /// </summary>
    private static async Task<Guid> UpsertCustomerByPhoneAsync(
        string connectionString,
        Guid barbershopId,
        string name,
        string phone,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO customers (id, barbershop_id, name, phone, active, created_at)
            VALUES (gen_random_uuid(), @barbershopId, @name, @phone, TRUE, NOW())
            ON CONFLICT (barbershop_id, phone) WHERE phone IS NOT NULL
            DO UPDATE SET name = EXCLUDED.name
            RETURNING id", conn);

        cmd.Parameters.AddWithValue("barbershopId", barbershopId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("phone", phone);

        var result = await cmd.ExecuteScalarAsync(ct);
        return (Guid)result!;
    }

    /// <summary>Internal DTO for appointment detail lookup.</summary>
    private sealed record AppointmentDetails(string ServiceName, string BarberName, int DurationMinutes);

    /// <summary>
    /// Fetches service name, barber name, and service duration for the confirmation response.
    /// Falls back to safe defaults if rows are not found.
    /// </summary>
    private static async Task<AppointmentDetails> GetAppointmentDetailsAsync(
        string connectionString,
        Guid barbershopId,
        Guid serviceId,
        Guid barberId,
        CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(connectionString);
        await conn.OpenAsync(ct);

        string serviceName = "Unknown Service";
        int durationMinutes = 30;
        string barberName = "Unknown Barber";

        await using (var svcCmd = new NpgsqlCommand(@"
            SELECT name, duration_minutes
            FROM services
            WHERE id = @serviceId AND barbershop_id = @barbershopId
            LIMIT 1", conn))
        {
            svcCmd.Parameters.AddWithValue("serviceId", serviceId);
            svcCmd.Parameters.AddWithValue("barbershopId", barbershopId);

            await using var svcReader = await svcCmd.ExecuteReaderAsync(ct);
            if (await svcReader.ReadAsync(ct))
            {
                serviceName = svcReader.GetString(0);
                durationMinutes = svcReader.GetInt32(1);
            }
        }

        await using (var barberCmd = new NpgsqlCommand(@"
            SELECT name
            FROM users
            WHERE id = @barberId AND barbershop_id = @barbershopId
            LIMIT 1", conn))
        {
            barberCmd.Parameters.AddWithValue("barberId", barberId);
            barberCmd.Parameters.AddWithValue("barbershopId", barbershopId);

            await using var barberReader = await barberCmd.ExecuteReaderAsync(ct);
            if (await barberReader.ReadAsync(ct))
            {
                barberName = barberReader.GetString(0);
            }
        }

        return new AppointmentDetails(serviceName, barberName, durationMinutes);
    }
}
