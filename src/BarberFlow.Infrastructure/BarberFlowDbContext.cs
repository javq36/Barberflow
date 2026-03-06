using Microsoft.EntityFrameworkCore;
using BarberFlow.Domain.Domain.Entities;
using BarberFlow.Domain.Domain.Enums;

namespace BarberFlow.Infrastructure
{
    public class BarberFlowDbContext : DbContext
    {
        public BarberFlowDbContext(DbContextOptions<BarberFlowDbContext> options)
            : base(options)
        {
        }

        public DbSet<Barbershop> Barbershops => Set<Barbershop>();

        public DbSet<Barber> Barbers => Set<Barber>();

        public DbSet<Customer> Customers => Set<Customer>();

        public DbSet<Service> Services => Set<Service>();

        public DbSet<Appointment> Appointments => Set<Appointment>();

        public DbSet<WorkingHour> WorkingHours => Set<WorkingHour>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Barbershop>(entity =>
            {
                entity.ToTable("barbershops");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(150);
                entity.Property(e => e.Phone).HasColumnName("phone").HasMaxLength(30);
                entity.Property(e => e.Address).HasColumnName("address");
                entity.Property(e => e.Timezone).HasColumnName("timezone").HasMaxLength(50);
                entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            });

            modelBuilder.Entity<Barber>(entity =>
            {
                // Current SQL schema stores barbers inside users table with role = Barber.
                entity.ToTable("users");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.BarbershopId).HasColumnName("barbershop_id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(120);
                entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(150);
                entity.Property(e => e.Phone).HasColumnName("phone").HasMaxLength(30);
                entity.Property(e => e.IsActive).HasColumnName("active");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at");
                entity.Property(e => e.Role)
                    .HasColumnName("role")
                    .HasConversion<int>();

                entity.HasQueryFilter(e => e.Role == UserRole.Barber);

                entity.HasOne(e => e.Barbershop)
                    .WithMany(e => e.Barbers)
                    .HasForeignKey(e => e.BarbershopId);
            });

            modelBuilder.Entity<Customer>(entity =>
            {
                entity.ToTable("customers");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.BarbershopId).HasColumnName("barbershop_id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(120);
                entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(120);
                entity.Property(e => e.Phone).HasColumnName("phone").HasMaxLength(30);
                entity.Property(e => e.Notes).HasColumnName("notes");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at");

                entity.HasOne(e => e.Barbershop)
                    .WithMany(e => e.Customers)
                    .HasForeignKey(e => e.BarbershopId);
            });

            modelBuilder.Entity<Service>(entity =>
            {
                entity.ToTable("services");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.BarbershopId).HasColumnName("barbershop_id");
                entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(120);
                entity.Property(e => e.DurationMinutes).HasColumnName("duration_minutes");
                entity.Property(e => e.Price).HasColumnName("price").HasPrecision(10, 2);
                entity.Property(e => e.Active).HasColumnName("active");

                entity.HasOne(e => e.Barbershop)
                    .WithMany(e => e.Services)
                    .HasForeignKey(e => e.BarbershopId);
            });

            modelBuilder.Entity<Appointment>(entity =>
            {
                entity.ToTable("appointments");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.BarbershopId).HasColumnName("barbershop_id");
                entity.Property(e => e.BarberId).HasColumnName("barber_id");
                entity.Property(e => e.ServiceId).HasColumnName("service_id");
                entity.Property(e => e.CustomerId).HasColumnName("customer_id");
                entity.Property(e => e.AppointmentTime).HasColumnName("appointment_time");
                entity.Property(e => e.EndTime).HasColumnName("end_time");
                entity.Property(e => e.Status).HasColumnName("status").HasConversion<int>();
                entity.Property(e => e.Notes).HasColumnName("notes");
                entity.Property(e => e.CreatedAt).HasColumnName("created_at");

                // Keep dependent rows aligned with the global Barber filter.
                entity.HasQueryFilter(e => e.Barber != null && e.Barber.Role == UserRole.Barber);

                entity.HasOne(e => e.Barbershop)
                    .WithMany(e => e.Appointments)
                    .HasForeignKey(e => e.BarbershopId);

                entity.HasOne(e => e.Barber)
                    .WithMany(e => e.Appointments)
                    .HasForeignKey(e => e.BarberId);

                entity.HasOne(e => e.Service)
                    .WithMany(e => e.Appointments)
                    .HasForeignKey(e => e.ServiceId);

                entity.HasOne(e => e.Customer)
                    .WithMany(e => e.Appointments)
                    .HasForeignKey(e => e.CustomerId);
            });

            modelBuilder.Entity<WorkingHour>(entity =>
            {
                entity.ToTable("working_hours");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Id).HasColumnName("id");
                entity.Property(e => e.BarberId).HasColumnName("barber_id");
                entity.Property(e => e.DayOfWeek)
                    .HasColumnName("day_of_week")
                    .HasConversion<int>();
                entity.Property(e => e.StartTime).HasColumnName("start_time");
                entity.Property(e => e.EndTime).HasColumnName("end_time");

                // Keep dependent rows aligned with the global Barber filter.
                entity.HasQueryFilter(e => e.Barber != null && e.Barber.Role == UserRole.Barber);

                entity.HasOne(e => e.Barber)
                    .WithMany(e => e.WorkingHours)
                    .HasForeignKey(e => e.BarberId);
            });

            base.OnModelCreating(modelBuilder);
        }
    }
}
