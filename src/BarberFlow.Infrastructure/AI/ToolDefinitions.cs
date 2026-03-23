using System.Text.Json;
using OpenAI.Chat;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Defines OpenAI function-calling tools for the AI booking assistant.
/// Customer and barber flows use separate tool sets to enforce role-based access.
/// </summary>
public static class ToolDefinitions
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>Tools available to customers (booking flow).</summary>
    public static readonly IReadOnlyList<ChatTool> CustomerTools =
    [
        BuildGetServices(),
        BuildGetBarbers(),
        BuildCheckAvailability(),
        BuildBookAppointment(),
        BuildGetMyAppointments(),
        BuildCancelAppointment(),
        BuildSubmitFeedback(),
    ];

    /// <summary>All 6 customer tools — preserves backward-compatibility alias.</summary>
    public static readonly IReadOnlyList<ChatTool> All = CustomerTools;

    /// <summary>Tools available to barbers (agenda management). Excludes all customer booking tools.</summary>
    public static readonly IReadOnlyList<ChatTool> BarberTools =
    [
        BuildDelayAppointment(),
        BuildGetMyAgenda(),
    ];

    private static ChatTool BuildGetServices() =>
        CreateTool("get_services",
            "Devuelve el catálogo de servicios de la barbería con nombre, duración y precio.",
            new { type = "object", properties = new { }, required = Array.Empty<string>() });

    private static ChatTool BuildGetBarbers() =>
        CreateTool("get_barbers",
            "Devuelve la lista de peluqueros activos de la barbería.",
            new { type = "object", properties = new { }, required = Array.Empty<string>() });

    private static ChatTool BuildCheckAvailability() =>
        CreateTool("check_availability",
            "Verifica los horarios disponibles para un servicio y peluquero en una fecha específica. " +
            "Usá service_ids (array) para combinar varios servicios; usá service_id (string) para uno solo.",
            new
            {
                type = "object",
                properties = new
                {
                    barber_id = new { type = "string", description = "UUID del peluquero." },
                    service_id = new { type = "string", description = "UUID de un único servicio (compatibilidad). Ignorado si se provee service_ids." },
                    service_ids = new { type = "array", items = new { type = "string" }, description = "Array de UUIDs de servicios a combinar. La duración total es la suma de todos." },
                    date = new { type = "string", description = "Fecha en formato YYYY-MM-DD." }
                },
                required = new[] { "barber_id", "date" }
            });

    private static ChatTool BuildSubmitFeedback() =>
        CreateTool("submit_feedback",
            "Registra la calificación del cliente (1-5) para una cita completada.",
            new
            {
                type = "object",
                properties = new
                {
                    appointment_id = new { type = "string", description = "UUID de la cita a calificar." },
                    rating = new { type = "integer", description = "Calificación del 1 al 5.", minimum = 1, maximum = 5 },
                    comment = new { type = "string", description = "Comentario opcional del cliente." }
                },
                required = new[] { "appointment_id", "rating" }
            });

    private static ChatTool BuildBookAppointment() =>
        CreateTool("book_appointment",
            "Crea una reserva para el cliente. Confirmá con el cliente antes de llamar.",
            new
            {
                type = "object",
                properties = new
                {
                    barber_id = new { type = "string", description = "UUID del peluquero." },
                    service_id = new { type = "string", description = "UUID del servicio." },
                    slot_start = new { type = "string", description = "Fecha y hora ISO 8601 (ej: 2026-03-25T10:00:00-03:00)." },
                    customer_name = new { type = "string", description = "Nombre del cliente." }
                },
                required = new[] { "barber_id", "service_id", "slot_start", "customer_name" }
            });

    private static ChatTool BuildGetMyAppointments() =>
        CreateTool("get_my_appointments",
            "Devuelve los turnos próximos del cliente (estado pendiente o confirmado).",
            new { type = "object", properties = new { }, required = Array.Empty<string>() });

    private static ChatTool BuildCancelAppointment() =>
        CreateTool("cancel_appointment",
            "Cancela un turno específico. Confirmá con el cliente antes de cancelar.",
            new
            {
                type = "object",
                properties = new
                {
                    appointment_id = new { type = "string", description = "UUID del turno a cancelar." }
                },
                required = new[] { "appointment_id" }
            });

    private static ChatTool BuildDelayAppointment() =>
        CreateTool("delay_appointment",
            "Retrasa la próxima cita del peluquero por la cantidad de minutos indicada (máximo 60).",
            new
            {
                type = "object",
                properties = new
                {
                    minutes = new { type = "integer", description = "Minutos de retraso (1-60).", maximum = 60 }
                },
                required = new[] { "minutes" }
            });

    private static ChatTool BuildGetMyAgenda() =>
        CreateTool("get_my_agenda",
            "Devuelve la agenda del peluquero para una fecha (por defecto hoy).",
            new
            {
                type = "object",
                properties = new
                {
                    date = new { type = "string", description = "Fecha en formato YYYY-MM-DD (opcional, por defecto hoy)." }
                },
                required = Array.Empty<string>()
            });

    private static ChatTool CreateTool(string name, string description, object parameters)
    {
        var paramJson = BinaryData.FromBytes(
            System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(parameters, JsonOptions)));

        return ChatTool.CreateFunctionTool(name, description, paramJson);
    }
}
