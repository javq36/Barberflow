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
    private readonly IWhatsAppOutboxService _outbox;
    private readonly ILogger<ToolExecutor> _logger;

    private static readonly JsonSerializerOptions Json =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public ToolExecutor(
        string connectionString,
        IAvailabilityService availability,
        IBookingService booking,
        IWhatsAppOutboxService outbox,
        ILogger<ToolExecutor> logger)
    {
        _connectionString = connectionString;
        _availability = availability;
        _booking = booking;
        _outbox = outbox;
        _logger = logger;
    }

    /// <summary>
    /// Executes a single tool call and returns a JSON string result.
    /// Never throws — errors are returned as structured JSON.
    /// Pass <paramref name="barberId"/> for barber-scoped tools; null for customer tools.
    /// </summary>
    public async Task<string> ExecuteAsync(
        string toolName,
        JsonElement args,
        Guid barbershopId,
        string customerPhone,
        string timezone,
        Guid? barberId,
        CancellationToken ct)
    {
        try
        {
            return toolName switch
            {
                "get_services" => await GetServicesAsync(barbershopId, ct),
                "get_barbers" => await GetBarbersAsync(barbershopId, ct),
                "check_availability" => await CheckAvailabilityAsync(barbershopId, args, timezone, ct),
                "book_appointment" => await BookAppointmentAsync(barbershopId, customerPhone, args, timezone, ct),
                "get_my_appointments" => await GetMyAppointmentsAsync(barbershopId, customerPhone, ct),
                "cancel_appointment" => await CancelAppointmentAsync(barbershopId, args, ct),
                "delay_appointment" when barberId.HasValue =>
                    await DelayAppointmentAsync(barbershopId, barberId.Value, args, timezone, ct),
                "get_my_agenda" when barberId.HasValue =>
                    await GetMyAgendaAsync(barbershopId, barberId.Value, args, timezone, ct),
                _ => ErrorJson($"Herramienta desconocida: {toolName}")
            };
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("overlap") || ex.Message.Contains("conflict") || ex.Message.Contains("available"))
        {
            _logger.LogWarning(ex, "Scheduling conflict. Tool={ToolName}", toolName);
            return ErrorJson("Ese horario ya no está disponible, por favor elegí otro.");
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning(ex, "Resource not found. Tool={ToolName}", toolName);
            return ErrorJson("No encontré ese servicio o barbero.");
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid argument. Tool={ToolName}", toolName);
            return ErrorJson("La fecha o el dato ingresado no es válido.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Tool execution failed. Tool={ToolName}", toolName);
            return ErrorJson("Hubo un problema al procesar tu solicitud, intentá de nuevo");
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

        // Convert UTC slots to barbershop local time so OpenAI presents human-readable
        // local times to the customer (not UTC times).
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var available = slots
            .Where(s => s.Available)
            .Select(s => new
            {
                start = TimeZoneInfo.ConvertTimeFromUtc(s.Start.UtcDateTime, tz).ToString("HH:mm"),
                end   = TimeZoneInfo.ConvertTimeFromUtc(s.End.UtcDateTime,   tz).ToString("HH:mm")
            })
            .ToList();

        return JsonSerializer.Serialize(
            new { date = date.ToString("yyyy-MM-dd"), timezone, availableSlots = available }, Json);
    }

    private async Task<string> BookAppointmentAsync(
        Guid barbershopId, string customerPhone, JsonElement args, string timezone, CancellationToken ct)
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

        var slotStartStr = slotStartEl.GetString();

        // Npgsql 9 requires offset 0 (UTC) for TIMESTAMPTZ columns.
        // OpenAI sends local time without offset (e.g. "2026-03-24T15:00:00").
        // If there is no explicit offset and the string doesn't end with 'Z',
        // treat the value as barbershop local time and attach the correct offset.
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        if (slotStart.Offset == TimeSpan.Zero && !slotStartStr!.EndsWith("Z", StringComparison.OrdinalIgnoreCase))
        {
            // It's ambiguous — assume barbershop local
            var localDt = new DateTimeOffset(slotStart.DateTime, tz.GetUtcOffset(slotStart.DateTime));
            slotStart = localDt;
        }

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

    // ─── Barber tools ──────────────────────────────────────────────────────────

    private async Task<string> DelayAppointmentAsync(
        Guid barbershopId, Guid barberId, JsonElement args, string timezone, CancellationToken ct)
    {
        if (!args.TryGetProperty("minutes", out var minutesEl) || !minutesEl.TryGetInt32(out var minutes))
            return ErrorJson("Parámetro 'minutes' inválido.");

        if (minutes > 60)
            return ErrorJson("El retraso máximo es de 60 minutos.");

        if (minutes <= 0)
            return ErrorJson("El retraso debe ser mayor a 0 minutos.");

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var appt = await QueryNextAppointmentAsync(conn, barbershopId, barberId, ct);
        if (appt is null)
            return ErrorJson("No tenés citas próximas para retrasar.");

        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var oldLocal = TimeZoneInfo.ConvertTimeFromUtc(appt.AppointmentTime.UtcDateTime, tz);
        var newUtc = appt.AppointmentTime.AddMinutes(minutes);
        var newLocal = TimeZoneInfo.ConvertTimeFromUtc(newUtc.UtcDateTime, tz);

        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            await UpdateAppointmentTimeAsync(conn, tx, appt.AppointmentId, minutes, ct);
            await EnqueueDelayNotificationAsync(conn, tx, barbershopId, appt, newLocal, ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        _logger.LogInformation(
            "Appointment {Id} delayed {Min}min by barber {BarberId}.", appt.AppointmentId, minutes, barberId);

        return JsonSerializer.Serialize(new
        {
            success = true,
            appointmentId = appt.AppointmentId.ToString(),
            customerName = appt.CustomerName,
            oldTime = oldLocal.ToString("HH:mm"),
            newTime = newLocal.ToString("HH:mm"),
            message = $"Cita de {appt.CustomerName} retrasada de {oldLocal:HH:mm} a {newLocal:HH:mm}."
        }, Json);
    }

    /// <summary>
    /// Returns the barber's appointments for the requested date (defaults to today).
    /// "Próxima cita" queries are handled by the AI selecting the next relevant
    /// appointment from the returned list — no special code path is needed here.
    /// </summary>
    private async Task<string> GetMyAgendaAsync(
        Guid barbershopId, Guid barberId, JsonElement args, string timezone, CancellationToken ct)
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

        DateOnly targetDate;
        if (args.TryGetProperty("date", out var dateEl) && dateEl.ValueKind == JsonValueKind.String)
        {
            if (!DateOnly.TryParse(dateEl.GetString(), out targetDate))
                return ErrorJson("Fecha inválida. Usá formato YYYY-MM-DD.");
        }
        else
        {
            targetDate = DateOnly.FromDateTime(today);
        }

        var (startUtc, endUtc) = GetDayBoundariesUtc(targetDate, tz);

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var appointments = await QueryAgendaAppointmentsAsync(
            conn, barbershopId, barberId, startUtc, endUtc, tz, ct);

        var message = appointments.Count == 0 ? "No tenés citas para este día" : null;

        return JsonSerializer.Serialize(new
        {
            date = targetDate.ToString("yyyy-MM-dd"),
            timezone,
            appointments,
            count = appointments.Count,
            message
        }, Json);
    }

    private static (DateTime startUtc, DateTime endUtc) GetDayBoundariesUtc(DateOnly date, TimeZoneInfo tz)
    {
        var startUtc = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue), tz);
        var endUtc   = TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MaxValue), tz);
        return (startUtc, endUtc);
    }

    private static async Task<List<object>> QueryAgendaAppointmentsAsync(
        NpgsqlConnection conn, Guid barbershopId, Guid barberId,
        DateTime startUtc, DateTime endUtc, TimeZoneInfo tz, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT a.id, a.appointment_time, a.end_time, a.status,
                   c.name AS customer_name, s.name AS service_name, s.duration_minutes
            FROM appointments a
            JOIN customers c ON c.id = a.customer_id
            JOIN services  s ON s.id = a.service_id
            WHERE a.barbershop_id = @barbershopId
              AND a.barber_id = @barberId
              AND a.appointment_time >= @startUtc
              AND a.appointment_time <= @endUtc
              AND a.status IN (1, 2)
            ORDER BY a.appointment_time", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId",     NpgsqlDbType.Uuid) { Value = barberId });
        cmd.Parameters.Add(new NpgsqlParameter("startUtc", NpgsqlDbType.TimestampTz) { Value = startUtc });
        cmd.Parameters.Add(new NpgsqlParameter("endUtc",   NpgsqlDbType.TimestampTz) { Value = endUtc });

        var appointments = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var timeUtc   = reader.GetFieldValue<DateTimeOffset>(1);
            var timeLocal = TimeZoneInfo.ConvertTimeFromUtc(timeUtc.UtcDateTime, tz);
            appointments.Add(new
            {
                time           = timeLocal.ToString("HH:mm"),
                customerName   = reader.GetString(4),
                serviceName    = reader.GetString(5),
                status         = reader.GetInt32(3),
                durationMinutes = reader.GetInt32(6)
            });
        }

        return appointments;
    }

    // ─── Barber SQL helpers ────────────────────────────────────────────────────

    private async Task<NextAppointmentRow?> QueryNextAppointmentAsync(
        NpgsqlConnection conn, Guid barbershopId, Guid barberId, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            SELECT a.id, a.appointment_time, a.end_time, c.name, c.phone
            FROM appointments a
            JOIN customers c ON c.id = a.customer_id
            WHERE a.barbershop_id = @barbershopId
              AND a.barber_id = @barberId
              AND a.status IN (1, 2)
              AND a.appointment_time > NOW()
            ORDER BY a.appointment_time ASC
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("barberId", NpgsqlDbType.Uuid) { Value = barberId });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new NextAppointmentRow(
            reader.GetGuid(0),
            reader.GetFieldValue<DateTimeOffset>(1),
            reader.IsDBNull(2) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(2),
            reader.GetString(3),
            reader.GetString(4));
    }

    private static async Task UpdateAppointmentTimeAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx, Guid appointmentId, int minutes, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(@"
            UPDATE appointments
            SET appointment_time = appointment_time + (@minutes * INTERVAL '1 minute'),
                end_time         = CASE WHEN end_time IS NOT NULL
                                        THEN end_time + (@minutes * INTERVAL '1 minute')
                                        ELSE NULL END
            WHERE id = @id", conn, tx);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = appointmentId });
        cmd.Parameters.Add(new NpgsqlParameter("minutes", NpgsqlDbType.Integer) { Value = minutes });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    private async Task EnqueueDelayNotificationAsync(
        NpgsqlConnection conn, NpgsqlTransaction tx,
        Guid barbershopId, NextAppointmentRow appt, DateTime newLocalTime, CancellationToken ct)
    {
        var variables = new Dictionary<string, string>
        {
            ["customer_name"] = appt.CustomerName,
            ["new_time"] = newLocalTime.ToString("HH:mm")
        };

        await _outbox.EnqueueAsync(
            connection: conn,
            barbershopId: barbershopId,
            customerPhone: appt.CustomerPhone,
            templateName: Domain.Enums.WhatsAppTemplateName.AppointmentDelayed,
            templateVariables: variables,
            transaction: tx,
            ct: ct);
    }

    private sealed record NextAppointmentRow(
        Guid AppointmentId,
        DateTimeOffset AppointmentTime,
        DateTimeOffset? EndTime,
        string CustomerName,
        string CustomerPhone);

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
