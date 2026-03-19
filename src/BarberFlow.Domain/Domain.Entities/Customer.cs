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

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Barbershop? Barbershop { get; set; }

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
