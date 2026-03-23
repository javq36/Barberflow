using System.Text.Json;
using BarberFlow.Application.Helpers;
using BarberFlow.Application.Services;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Dispatches OpenAI tool_call names to real BarberFlow service methods.
/// Every query is scoped by <c>barbershopId</c> (multi-tenancy).
/// Returns a JSON string for each tool (success or structured error).
/// </summary>
public sealed class ToolExecutor
{
    private readonly string _connectionString;
    private readonly IAvailabilityService _availability;
    private readonly IBookingService _booking;
    private readonly ILogger<ToolExecutor> _logger;

    private static readonly JsonSerializerOptions Json =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ToolExecutor(
        string connectionString,
        IAvailabilityService availability,
        IBookingService booking,
        ILogger<ToolExecutor> logger)
    {
        _connectionString = connectionString;
        _availability = availability;
        _booking = booking;
        _logger = logger;
    }

    /// <summary>
    /// Executes a single tool call and returns a JSON string result.
    /// Never throws — errors are returned as structured JSON.
    /// </summary>
    public async Task<string> ExecuteAsync(
        string toolName,
        JsonElement args,
        Guid barbershopId,
        string customerPhone,
        string timezone,
        CancellationToken ct)
    {
        try
        {
            return toolName switch
            {
                "get_services" => await GetServicesAsync(barbershopId, ct),
                "get_barbers" => await GetBarbersAsync(barbershopId, ct),
                "check_availability" => await CheckAvailabilityAsync(barbershopId, args, timezone, ct),
                "book_appointment" => await BookAppointmentAsync(barbershopId, customerPhone, args, ct),
                "get_my_appointments" => await GetMyAppointmentsAsync(barbershopId, customerPhone, ct),
                "cancel_appointment" => await CancelAppointmentAsync(barbershopId, args, ct),
                _ => ErrorJson($"Herramienta desconocida: {toolName}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Tool execution failed. Tool={ToolName}", toolName);
            return ErrorJson("Error interno al ejecutar la herramienta. Intentá de nuevo.");
        }
    }

    // ─── Tool implementations ─────────────────────────────────────────────────

    private async Task<string> GetServicesAsync(Guid barbershopId, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, name, duration_minutes, price
            FROM services
            WHERE barbershop_id = @barbershopId AND active = TRUE
            ORDER BY name", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var services = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            services.Add(new
            {
                id = reader.GetGuid(0).ToString(),
                name = reader.GetString(1),
                durationMinutes = reader.GetInt32(2),
                price = reader.IsDBNull(3) ? 0m : reader.GetDecimal(3)
            });
        }

        return JsonSerializer.Serialize(new { services }, Json);
    }

    private async Task<string> GetBarbersAsync(Guid barbershopId, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT u.id, u.name
            FROM users u
            WHERE u.barbershop_id = @barbershopId AND u.role = 3 AND u.active = TRUE
            ORDER BY u.name", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });

        var barbers = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            barbers.Add(new { id = reader.GetGuid(0).ToString(), name = reader.GetString(1) });
        }

        return JsonSerializer.Serialize(new { barbers }, Json);
    }

    private async Task<string> CheckAvailabilityAsync(
        Guid barbershopId, JsonElement args, string timezone, CancellationToken ct)
    {
        if (!args.TryGetProperty("barber_id", out var barberIdEl) ||
            !Guid.TryParse(barberIdEl.GetString(), out var barberId))
        {
            return ErrorJson("barber_id inválido.");
        }

        if (!args.TryGetProperty("service_id", out var serviceIdEl) ||
            !Guid.TryParse(serviceIdEl.GetString(), out var serviceId))
        {
            return ErrorJson("service_id inválido.");
        }

        if (!args.TryGetProperty("date", out var dateEl) ||
            !DateOnly.TryParse(dateEl.GetString(), out var date))
        {
            return ErrorJson("date inválido. Usá formato YYYY-MM-DD.");
        }

        var slots = await _availability.GetAvailableSlotsAsync(
            barbershopId, barberId, serviceId, date, timezone, isPublic: true, ct);

        var available = slots
            .Where(s => s.Available)
            .Select(s => new { start = s.Start.ToString("o"), end = s.End.ToString("o") })
            .ToList();

        return JsonSerializer.Serialize(new { date = date.ToString("yyyy-MM-dd"), availableSlots = available }, Json);
    }

    private async Task<string> BookAppointmentAsync(
        Guid barbershopId, string customerPhone, JsonElement args, CancellationToken ct)
    {
        if (!args.TryGetProperty("barber_id", out var barberIdEl) ||
            !Guid.TryParse(barberIdEl.GetString(), out var barberId))
        {
            return ErrorJson("barber_id inválido.");
        }

        if (!args.TryGetProperty("service_id", out var serviceIdEl) ||
            !Guid.TryParse(serviceIdEl.GetString(), out var serviceId))
        {
            return ErrorJson("service_id inválido.");
        }

        if (!args.TryGetProperty("slot_start", out var slotStartEl) ||
            !DateTimeOffset.TryParse(slotStartEl.GetString(), out var slotStart))
        {
            return ErrorJson("slot_start inválido. Usá formato ISO 8601.");
        }

        // Npgsql 9 requires offset 0 (UTC) for TIMESTAMPTZ columns.
        // OpenAI may return the local timezone offset (e.g. -05:00 for Colombia).
        var slotStartUtc = slotStart.ToUniversalTime();

        var customerName = args.TryGetProperty("customer_name", out var nameEl)
            ? nameEl.GetString() ?? "Cliente"
            : "Cliente";

        var normalizedPhone = PhoneNormalizer.Normalize(customerPhone) ?? customerPhone;
        var customerId = await UpsertCustomerByPhoneAsync(barbershopId, customerName, normalizedPhone, ct);

        var command = new CreateAppointmentCommand(barberId, serviceId, customerId, slotStartUtc, null);
        var result = await _booking.CreateAppointmentAsync(barbershopId, command, ct);

        if (!result.IsSuccess)
        {
            return ErrorJson(result.ErrorCode == "conflict"
                ? "El horario ya no está disponible. Por favor elegí otro."
                : result.ErrorMessage ?? "No se pudo crear la reserva.");
        }

        return JsonSerializer.Serialize(new
        {
            success = true,
            appointmentId = result.AppointmentId!.Value.ToString(),
            message = "Reserva creada exitosamente."
        }, Json);
    }

    private async Task<string> GetMyAppointmentsAsync(
        Guid barbershopId, string customerPhone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT a.id, a.appointment_time, a.status, s.name AS service, u.name AS barber
            FROM appointments a
            JOIN services s ON s.id = a.service_id
            JOIN users u ON u.id = a.barber_id
            JOIN customers c ON c.id = a.customer_id
            WHERE a.barbershop_id = @barbershopId
              AND c.phone = @phone
              AND a.status IN (1, 2)
              AND a.appointment_time > NOW()
            ORDER BY a.appointment_time
            LIMIT 10", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = customerPhone });

        var appointments = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var time = reader.GetFieldValue<DateTimeOffset>(1);
            appointments.Add(new
            {
                id = reader.GetGuid(0).ToString(),
                appointmentTime = time.ToString("o"),
                status = reader.GetInt32(2),
                service = reader.GetString(3),
                barber = reader.GetString(4)
            });
        }

        return JsonSerializer.Serialize(new { appointments }, Json);
    }

    private async Task<string> CancelAppointmentAsync(Guid barbershopId, JsonElement args, CancellationToken ct)
    {
        if (!args.TryGetProperty("appointment_id", out var apptIdEl) ||
            !Guid.TryParse(apptIdEl.GetString(), out var appointmentId))
        {
            return ErrorJson("appointment_id inválido.");
        }

        var result = await _booking.CancelAppointmentAsync(
            barbershopId,
            new CancelAppointmentCommand(appointmentId, "Cancelado por el cliente vía WhatsApp"),
            ct);

        if (!result.IsSuccess)
        {
            return ErrorJson(result.ErrorMessage ?? "No se pudo cancelar el turno.");
        }

        return JsonSerializer.Serialize(new { success = true, message = "Turno cancelado exitosamente." }, Json);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private async Task<Guid> UpsertCustomerByPhoneAsync(
        Guid barbershopId, string name, string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO customers (id, barbershop_id, name, phone, active, created_at)
            VALUES (gen_random_uuid(), @barbershopId, @name, @phone, TRUE, NOW())
            ON CONFLICT (barbershop_id, phone) WHERE phone IS NOT NULL
            DO UPDATE SET name = EXCLUDED.name
            RETURNING id", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("name", NpgsqlDbType.Text) { Value = name });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        var result = await cmd.ExecuteScalarAsync(ct);
        return (Guid)result!;
    }

    private static string ErrorJson(string message) =>
        JsonSerializer.Serialize(new { error = true, message }, Json);
}
