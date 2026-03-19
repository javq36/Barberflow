
namespace BarberFlow.Domain.Enums;

/// <summary>
/// Representa los estados posibles de una cita en la barbería
/// </summary>
public enum AppointmentStatus
{
    /// <summary>
    /// Cita creada pero no confirmada por el barbero
    /// </summary>
    Pending = 1,

    /// <summary>
    /// Cita confirmada por el barbero
    /// </summary>
    Confirmed = 2,

    /// <summary>
    /// Cita cancelada por el cliente o barbero
    /// </summary>
    Cancelled = 3,

    /// <summary>
    /// Cita completada exitosamente
    /// </summary>
    Completed = 4
}
