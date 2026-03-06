using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class WorkingHour
{
    public Guid Id { get; set; }

    public Guid? BarberId { get; set; }

    public int DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public virtual User1? Barber { get; set; }
}
