namespace BarberFlow.Domain.Entities;

/// <summary>
/// Cliente de una barberia. Solo existe dentro del tenant al que pertenece.
/// </summary>
public class Customer
{
    public Guid Id { get; set; }

    public Guid BarbershopId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Indica si el cliente consintió recibir notificaciones por WhatsApp.
    /// Solo se envían mensajes cuando este campo es <c>true</c>.
    /// WhatsApp notifications are the core feature — defaults to true (opt-out model).
    /// </summary>
    public bool OptInWhatsApp { get; set; } = true;

    /// <summary>
    /// ID del peluquero preferido del cliente (último con quien se atendió).
    /// <c>null</c> indica que no hay preferencia registrada aún.
    /// </summary>
    public Guid? PreferredBarberId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Barbershop? Barbershop { get; set; }

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
