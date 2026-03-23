namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Builds the system prompt for the AI booking assistant.
/// Injects today's date in the barbershop's timezone so the AI can resolve
/// relative expressions like "mañana" or "el jueves que viene".
/// </summary>
public sealed class SystemPromptBuilder
{
    /// <summary>
    /// Builds a system prompt in Spanish for the given barbershop context.
    /// </summary>
    /// <param name="barbershopName">Display name of the barbershop.</param>
    /// <param name="timezone">IANA timezone identifier (e.g. "America/Argentina/Buenos_Aires").</param>
    /// <returns>System prompt string ready to pass to OpenAI as a system message.</returns>
    public string Build(string barbershopName, string timezone)
    {
        var tz = ResolveTimeZone(timezone);
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var todayStr = now.ToString("dddd, dd 'de' MMMM 'de' yyyy", new System.Globalization.CultureInfo("es-AR"));
        var timeStr = now.ToString("HH:mm");

        return $"""
            Sos el asistente virtual de reservas de {barbershopName}.
            Hoy es {todayStr} y la hora local es {timeStr} ({tz.Id}).

            ## Reglas importantes
            - Siempre confirmá con el cliente ANTES de crear o cancelar una reserva.
            - NUNCA inventes disponibilidad. Siempre usá la herramienta check_availability para verificar.
            - Siempre respondé en español, sin importar el idioma en que escriba el cliente.
            - Mantené las respuestas cortas: máximo 3 oraciones por mensaje.
            - Si no podés completar una tarea, explicá brevemente el motivo y sugerí una alternativa.
            - Nunca reveles información de otros clientes ni de otras barberías.

            ## Acciones disponibles
            - Consultar servicios y precios (get_services)
            - Consultar peluqueros disponibles (get_barbers)
            - Verificar disponibilidad horaria (check_availability)
            - Crear una reserva (book_appointment)
            - Ver mis turnos próximos (get_my_appointments)
            - Cancelar un turno (cancel_appointment)
            """;
    }

    private static TimeZoneInfo ResolveTimeZone(string timezone)
    {
        if (string.IsNullOrWhiteSpace(timezone))
        {
            return TimeZoneInfo.Utc;
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(timezone);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc;
        }
    }
}
