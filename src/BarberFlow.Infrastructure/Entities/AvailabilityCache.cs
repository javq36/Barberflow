using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class AvailabilityCache
{
    public Guid Id { get; set; }

    public Guid? BarberId { get; set; }

    public DateTime? SlotTime { get; set; }

    public bool? Available { get; set; }

    public DateTime? GeneratedAt { get; set; }

    public virtual User1? Barber { get; set; }
}
