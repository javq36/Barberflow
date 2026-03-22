using Npgsql;

namespace BarberFlow.Application.Services;

/// <summary>
/// Abstraction for sending outbound WhatsApp messages via a template.
/// The concrete implementation in Infrastructure calls the Twilio API.
/// </summary>
public interface IWhatsAppService
{
    /// <summary>
    /// Sends a WhatsApp template message immediately (called from the outbox processor).
    /// </summary>
    /// <param name="customerPhone">Destination phone in E.164 format (e.g. +5491122334455).</param>
    /// <param name="templateName">Canonical template name — use <see cref="BarberFlow.Domain.Enums.WhatsAppTemplateName"/> constants.</param>
    /// <param name="templateVariables">Variables injected into the template body.</param>
    /// <param name="ct">Cancellation token.</param>
    Task SendTemplateAsync(
        string customerPhone,
        string templateName,
        Dictionary<string, string> templateVariables,
        CancellationToken ct);
}
