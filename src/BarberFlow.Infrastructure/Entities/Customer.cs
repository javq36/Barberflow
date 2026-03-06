using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class Customer
{
    public Guid Id { get; set; }

    public Guid? BarbershopId { get; set; }

    public string? Name { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public string? Notes { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();

    public virtual Barbershop? Barbershop { get; set; }
}
