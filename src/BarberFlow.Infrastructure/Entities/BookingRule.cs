using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class BookingRule
{
    public Guid Id { get; set; }

    public Guid? BarbershopId { get; set; }

    public int? MinNoticeMinutes { get; set; }

    public int? MaxDaysInFuture { get; set; }

    public int? SlotIntervalMinutes { get; set; }

    public virtual Barbershop? Barbershop { get; set; }
}
