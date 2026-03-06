namespace BarberFlow.Domain.Domain.Entities;

/// <summary>
/// Servicio ofrecido por una barberia (corte, barba, combo, etc.).
/// </summary>
public class Service
{
    public Guid Id { get; set; }

    public Guid BarbershopId { get; set; }

    public string Name { get; set; } = string.Empty;

    public int DurationMinutes { get; set; }

    public decimal Price { get; set; }

    public bool Active { get; set; } = true;

    public Barbershop? Barbershop { get; set; }

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
