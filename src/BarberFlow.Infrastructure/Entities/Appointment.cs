using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class Appointment
{
    public Guid Id { get; set; }

    public Guid? BarbershopId { get; set; }

    public Guid? BarberId { get; set; }

    public Guid? ServiceId { get; set; }

    public Guid? CustomerId { get; set; }

    public DateTime AppointmentTime { get; set; }

    public DateTime EndTime { get; set; }

    public int Status { get; set; }

    public string? Notes { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual User1? Barber { get; set; }

    public virtual Barbershop? Barbershop { get; set; }

    public virtual Customer? Customer { get; set; }

    public virtual Service? Service { get; set; }
}
