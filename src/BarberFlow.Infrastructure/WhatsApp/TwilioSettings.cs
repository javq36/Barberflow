namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Configuración de Twilio para el envío de mensajes de WhatsApp.
/// Se enlaza con la sección "Twilio" de appsettings / variables de entorno.
/// <para>
/// Variables de entorno correspondientes:
/// <c>Twilio__AccountSid</c>, <c>Twilio__AuthToken</c>, <c>Twilio__FromNumber</c>,
/// <c>Twilio__TemplateSids__{key}</c> (ej. <c>Twilio__TemplateSids__appointment_confirmation</c>).
/// </para>
/// <para>
/// NUNCA registrar <see cref="AccountSid"/> ni <see cref="AuthToken"/> en logs o mensajes de error.
/// </para>
/// </summary>
public sealed class TwilioSettings
{
    /// <summary>
    /// SID de la cuenta de Twilio (empieza con "AC...").
    /// Requerido para autenticar con la API de Twilio.
    /// </summary>
    public string AccountSid { get; init; } = string.Empty;

    /// <summary>
    /// Auth Token de Twilio. Tratar como secreto — nunca loguear ni exponer.
    /// </summary>
    public string AuthToken { get; init; } = string.Empty;

    /// <summary>
    /// Número de origen en formato WhatsApp (ej. "whatsapp:+14155238886").
    /// En sandbox de desarrollo usar el número del sandbox de Twilio.
    /// </summary>
    public string FromNumber { get; init; } = string.Empty;

    /// <summary>
    /// Mapeo de nombre de plantilla a Content Template SID de Twilio.
    /// Las claves corresponden a las constantes en <see cref="BarberFlow.Domain.Enums.WhatsAppTemplateName"/>.
    /// Ejemplo:
    /// <code>
    /// "TemplateSids": {
    ///   "appointment_confirmation": "HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ///   "appointment_reminder_24h": "HXyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
    ///   "appointment_cancellation": "HXzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
    /// }
    /// </code>
    /// </summary>
    public Dictionary<string, string> TemplateSids { get; init; } = new();

    /// <summary>
    /// When <c>true</c> the service sends free-form body text instead of a Content Template SID.
    /// Set to <c>true</c> for local development / Twilio sandbox environments.
    /// </summary>
    public bool UseSandbox { get; init; } = false;
}
