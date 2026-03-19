using BarberFlow.Domain.Enums;

namespace BarberFlow.Domain.Entities;

/// <summary>
/// Reserva de un cliente para un servicio con un barbero en una fecha/hora concreta.
/// </summary>
public class Appointment
{
    public Guid Id { get; set; }

    public Guid BarbershopId { get; set; }

    public Guid BarberId { get; set; }

    public Guid ServiceId { get; set; }

    public Guid CustomerId { get; set; }

    public DateTime AppointmentTime { get; set; }

    public DateTime EndTime { get; set; }

    public AppointmentStatus Status { get; set; } = AppointmentStatus.Pending;

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Barbershop? Barbershop { get; set; }

    public Barber? Barber { get; set; }

    public Service? Service { get; set; }

    public Customer? Customer { get; set; }
}
