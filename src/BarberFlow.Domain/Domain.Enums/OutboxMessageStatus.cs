namespace BarberFlow.Domain.Enums;

/// <summary>
/// Estado de un mensaje en la cola de salida de WhatsApp.
/// Los valores son persistidos como enteros en la columna <c>status</c> de <c>whatsapp_outbox</c>.
/// </summary>
public enum OutboxMessageStatus
{
    /// <summary>
    /// Mensaje creado, pendiente de envío por el OutboxProcessorService.
    /// </summary>
    Pending = 0,

    /// <summary>
    /// Mensaje tomado por el procesador; evita doble procesamiento con FOR UPDATE SKIP LOCKED.
    /// </summary>
    Processing = 1,

    /// <summary>
    /// Mensaje enviado exitosamente a través de Twilio.
    /// </summary>
    Sent = 2,

    /// <summary>
    /// Mensaje fallido después de agotar todos los reintentos (max_retries).
    /// </summary>
    Failed = 3
}
