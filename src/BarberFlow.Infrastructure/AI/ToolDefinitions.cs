using System.Text.Json;
using OpenAI.Chat;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Defines the 6 OpenAI function-calling tools available to the AI booking assistant.
/// All tools are barbershop-scoped; the executor fills in <c>barbershop_id</c> from context.
/// </summary>
public static class ToolDefinitions
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>All 6 tools as a read-only list ready to pass to <see cref="ChatCompletionOptions"/>.</summary>
    public static readonly IReadOnlyList<ChatTool> All =
    [
        BuildGetServices(),
        BuildGetBarbers(),
        BuildCheckAvailability(),
        BuildBookAppointment(),
        BuildGetMyAppointments(),
        BuildCancelAppointment(),
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
            "Verifica los horarios disponibles para un servicio y peluquero en una fecha específica.",
            new
            {
                type = "object",
                properties = new
                {
                    barber_id = new { type = "string", description = "UUID del peluquero." },
                    service_id = new { type = "string", description = "UUID del servicio." },
                    date = new { type = "string", description = "Fecha en formato YYYY-MM-DD." }
                },
                required = new[] { "barber_id", "service_id", "date" }
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

    private static ChatTool CreateTool(string name, string description, object parameters)
    {
        var paramJson = BinaryData.FromBytes(
            System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(parameters, JsonOptions)));

        return ChatTool.CreateFunctionTool(name, description, paramJson);
    }
}
