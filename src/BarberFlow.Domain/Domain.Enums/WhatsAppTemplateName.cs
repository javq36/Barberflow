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
}
