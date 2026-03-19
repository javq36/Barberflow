namespace BarberFlow.Domain.Entities;

/// <summary>
/// Bloque de horario laboral de un barbero para un dia de semana.
/// </summary>
public class WorkingHour
{
    public Guid Id { get; set; }

    public Guid BarberId { get; set; }

    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }

    public Barber? Barber { get; set; }
}
