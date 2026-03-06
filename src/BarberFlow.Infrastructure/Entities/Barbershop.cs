using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class Barbershop
{
    public Guid Id { get; set; }

    public string Name { get; set; } = null!;

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? Timezone { get; set; }

    public DateTime? CreatedAt { get; set; }

    public virtual ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();

    public virtual ICollection<BookingRule> BookingRules { get; set; } = new List<BookingRule>();

    public virtual ICollection<Customer> Customers { get; set; } = new List<Customer>();

    public virtual ICollection<Service> Services { get; set; } = new List<Service>();

    public virtual ICollection<User1> User1s { get; set; } = new List<User1>();
}
