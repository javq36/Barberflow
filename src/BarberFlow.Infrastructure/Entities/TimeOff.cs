using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class TimeOff
{
    public Guid Id { get; set; }

    public Guid? BarberId { get; set; }

    public DateTime? StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    public string? Reason { get; set; }

    public virtual User1? Barber { get; set; }
}
