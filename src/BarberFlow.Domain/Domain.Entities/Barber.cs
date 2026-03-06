using BarberFlow.Domain.Domain.Enums;

namespace BarberFlow.Domain.Domain.Entities;

/// <summary>
/// Representa al profesional que presta los servicios en una barberia.
/// </summary>
public class Barber
{
    public Guid Id { get; set; }

    public Guid BarbershopId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public string? Email { get; set; }

    // In DB this is stored in users.role; default keeps barber rows consistent.
    public UserRole Role { get; set; } = UserRole.Barber;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Barbershop? Barbershop { get; set; }

    public ICollection<WorkingHour> WorkingHours { get; set; } = new List<WorkingHour>();

    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
