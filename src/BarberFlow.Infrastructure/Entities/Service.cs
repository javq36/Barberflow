using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class Service
{
    public Guid Id { get; set; }

    public Guid? BarbershopId { get; set; }

    public string Name { get; set; } = null!;

    public int DurationMinutes { get; set; }

    public decimal? Price { get; set; }

    public bool? Active { get; set; }

    public virtual ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();

    public virtual Barbershop? Barbershop { get; set; }
}
