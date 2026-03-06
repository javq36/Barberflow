namespace BarberFlow.Domain.Domain.Entities;

/// <summary>
/// Tenant principal del sistema. Todas las operaciones del negocio se segmentan por barberia.
/// </summary>
public class Barbershop
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string Timezone { get; set; } = "UTC";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Barber> Barbers { get; set; } = new List<Barber>();

    public ICollection<Service> Services { get; set; } = new List<Service>();

    public ICollection<Customer> Customers { get; set; } = new List<Customer>();

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
