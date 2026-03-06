using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class User1
{
    public Guid Id { get; set; }

    public Guid? BarbershopId { get; set; }

    public string Name { get; set; } = null!;

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public int Role { get; set; }

    public string? PasswordHash { get; set; }

    public bool? Active { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();

    public virtual ICollection<AvailabilityCache> AvailabilityCaches { get; set; } = new List<AvailabilityCache>();

    public virtual Barbershop? Barbershop { get; set; }

    public virtual ICollection<TimeOff> TimeOffs { get; set; } = new List<TimeOff>();

    public virtual ICollection<WorkingHour> WorkingHours { get; set; } = new List<WorkingHour>();
}
