namespace BarberFlow.Domain.Domain.Enums;

/// <summary>
/// Roles disponibles en el sistema BarberFlow
/// </summary>
public enum UserRole
{
    /// <summary>
    /// Súper administrador del sistema (desarrolladores)
    /// </summary>
    SuperAdmin = 1,

    /// <summary>
    /// Propietario/Administrador de una barbería
    /// </summary>
    Owner = 2,

    /// <summary>
    /// Barbero empleado de una barbería
    /// </summary>
    Barber = 3,

    /// <summary>
    /// Cliente que agenda citas
    /// </summary>
    Customer = 4
}
