using BarberFlow.Domain.Enums;

namespace BarberFlow.Domain.Entities;

/// <summary>
/// Representa un mensaje de WhatsApp pendiente de envío en la cola de salida (outbox).
/// Garantiza entrega at-least-once: se inserta en la misma transacción que el evento
/// de dominio que lo originó y es procesado de forma asíncrona por OutboxProcessorService.
/// </summary>
public sealed class WhatsAppOutboxMessage
{
    public Guid Id { get; set; }

    public Guid BarbershopId { get; set; }

    /// <summary>Número de teléfono del cliente en formato E.164 (ej. +5491122334455).</summary>
    public string CustomerPhone { get; set; } = string.Empty;

    /// <summary>
    /// Nombre canónico de la plantilla. Usar las constantes de <see cref="WhatsAppTemplateName"/>.
    /// </summary>
    public string TemplateName { get; set; } = string.Empty;

    /// <summary>
    /// Variables que se inyectan en la plantilla de Twilio (clave → valor).
    /// </summary>
    public Dictionary<string, string> TemplateVariables { get; set; } = new();

    public OutboxMessageStatus Status { get; set; } = OutboxMessageStatus.Pending;

    public int RetryCount { get; set; } = 0;

    public int MaxRetries { get; set; } = 3;

    /// <summary>Último error registrado por el procesador. No debe contener datos sensibles.</summary>
    public string? LastError { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? ProcessedAt { get; set; }

    /// <summary>
    /// Marca de tiempo a partir de la cual el procesador puede intentar enviar este mensaje.
    /// Se usa para implementar el backoff exponencial entre reintentos.
    /// </summary>
    public DateTimeOffset NextRetryAt { get; set; } = DateTimeOffset.UtcNow;
}
