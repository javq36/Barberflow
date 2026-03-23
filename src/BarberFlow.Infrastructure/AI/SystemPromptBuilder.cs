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
    /// <param name="preferredBarberName">
    /// Optional name of the customer's preferred barber. When provided, the prompt instructs
    /// the AI to suggest this barber first.
    /// </param>
    /// <param name="hasPendingFeedback">
    /// When true, the prompt instructs the AI to interpret numeric replies as feedback ratings.
    /// </param>
    /// <param name="pendingFeedbackAppointmentId">
    /// When <paramref name="hasPendingFeedback"/> is true and this is not null, the prompt injects
    /// the exact appointment ID so the AI can pass it directly to submit_feedback.
    /// </param>
    /// <returns>System prompt string ready to pass to OpenAI as a system message.</returns>
    public string Build(
        string barbershopName,
        string timezone,
        string? preferredBarberName = null,
        bool hasPendingFeedback = false,
        string? pendingFeedbackAppointmentId = null)
    {
        var tz = ResolveTimeZone(timezone);
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var todayStr = now.ToString("dddd, dd 'de' MMMM 'de' yyyy", new System.Globalization.CultureInfo("es-AR"));
        var timeStr = now.ToString("HH:mm");

        var preferredBarberSection = preferredBarberName is not null
            ? $"\n## Preferencia de peluquero\nEl barbero preferido del cliente es {preferredBarberName}. Sugerilo primero cuando el cliente no especifique barbero. Si no está disponible, preguntá si prefiere otro.\n"
            : string.Empty;

        string pendingFeedbackSection;
        if (hasPendingFeedback && pendingFeedbackAppointmentId is not null)
        {
            pendingFeedbackSection = $"\n## Evaluación pendiente\nEl cliente tiene una evaluación pendiente de un turno reciente. El ID de la cita pendiente de evaluación es {pendingFeedbackAppointmentId}. Si responde con un número del 1 al 5, usá la herramienta submit_feedback con ese ID.\n";
        }
        else if (hasPendingFeedback)
        {
            pendingFeedbackSection = "\n## Evaluación pendiente\nEl cliente tiene una evaluación pendiente de un turno reciente. Si responde con un número del 1 al 5, usá la herramienta submit_feedback con el appointment_id del contexto.\n";
        }
        else
        {
            pendingFeedbackSection = string.Empty;
        }

        return $"""
            Sos el asistente virtual de reservas de {barbershopName}.
            Hoy es {todayStr} y la hora local es {timeStr} ({tz.Id}).
            {preferredBarberSection}{pendingFeedbackSection}
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

    /// <summary>
    /// Builds a system prompt in Spanish for a barber managing their own appointments.
    /// </summary>
    /// <param name="barbershopName">Display name of the barbershop.</param>
    /// <param name="timezone">IANA timezone identifier (e.g. "America/Argentina/Buenos_Aires").</param>
    /// <param name="barberName">Name of the barber receiving the messages.</param>
    /// <returns>System prompt string ready to pass to OpenAI as a system message.</returns>
    public string BuildBarber(string barbershopName, string timezone, string barberName)
    {
        var tz = ResolveTimeZone(timezone);
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var todayStr = now.ToString("dddd, dd 'de' MMMM 'de' yyyy", new System.Globalization.CultureInfo("es-AR"));
        var timeStr = now.ToString("HH:mm");

        return $"""
            Sos el asistente de agenda de {barbershopName}. Ayudás a {barberName} a gestionar sus citas.
            Hoy es {todayStr} y la hora local es {timeStr} ({tz.Id}).

            ## Acciones disponibles
            - Ver agenda del día o de una fecha (get_my_agenda)
            - Consultar próxima cita (get_my_agenda)
            - Retrasar la próxima cita (delay_appointment)

            ## Reglas
            - Respondé siempre en español, con mensajes cortos (máximo 3 oraciones).
            - El retraso máximo permitido es 60 minutos.
            - Si no podés completar una tarea, explicá brevemente el motivo.
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
