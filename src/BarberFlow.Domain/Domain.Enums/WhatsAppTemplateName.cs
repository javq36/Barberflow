namespace BarberFlow.Domain.Enums;

/// <summary>
/// Nombres canónicos de las plantillas de WhatsApp usadas en el sistema.
/// Cada valor se mapea a un Content Template SID en la configuración de Twilio
/// (<c>TwilioSettings.TemplateSids</c>).
/// </summary>
public static class WhatsAppTemplateName
{
    /// <summary>Confirmación enviada cuando se crea una cita.</summary>
    public const string AppointmentConfirmation = "appointment_confirmation";

    /// <summary>Recordatorio enviado ~24 horas antes de la cita.</summary>
    public const string AppointmentReminder24h = "appointment_reminder_24h";

    /// <summary>Notificación enviada cuando se cancela una cita.</summary>
    public const string AppointmentCancellation = "appointment_cancellation";

    /// <summary>Notificación enviada al cliente cuando el peluquero retrasa su cita.</summary>
    public const string AppointmentDelayed = "appointment_delayed";

    /// <summary>Alerta enviada al peluquero 10 minutos antes de una cita.</summary>
    public const string BarberAlert10Min = "barber_alert_10min";

    /// <summary>Resumen diario de agenda enviado al peluquero en la mañana.</summary>
    public const string BarberDailyAgenda = "barber_daily_agenda";
}
