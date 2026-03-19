using BarberFlow.Domain.Enums;

namespace BarberFlow.Domain.Entities;

/// <summary>
/// Representa un usuario del sistema BarberFlow (multi-tenant)
/// </summary>
public class User
{
    /// <summary>
    /// Identificador único del usuario
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Nombre completo del usuario
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Correo electrónico del usuario (único en todo el sistema)
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Número de teléfono del usuario
    /// </summary>
    public string Phone { get; set; } = string.Empty;

    /// <summary>
    /// Rol del usuario en el sistema
    /// </summary>
    public UserRole Role { get; set; }

    /// <summary>
    /// ID de la barbería a la que pertenece (null para SuperAdmin)
    /// </summary>
    public Guid? BarbershopId { get; set; }

    /// <summary>
    /// Fecha de creación del registro
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Fecha de última actualización del registro
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Indica si el registro está activo
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Constructor sin parámetros requerido por Entity Framework
    /// </summary>
    public User() { }

    /// <summary>
    /// Constructor para crear un SuperAdmin (sin barbería)
    /// </summary>
    public User(string name, string email, string phone, UserRole role)
    {
        // Validar que solo SuperAdmin use este constructor
        if (role != UserRole.SuperAdmin)
            throw new ArgumentException($"Para crear un usuario {role}, use el constructor que incluye BarbershopId", nameof(role));

        Id = Guid.NewGuid();
        Name = name;
        Email = email;
        Phone = phone;
        Role = role;
        BarbershopId = null;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
        IsActive = true;
    }

    /// <summary>
    /// Constructor para crear usuario asociado a una barbería
    /// </summary>
    public User(string name, string email, string phone, UserRole role, Guid barbershopId)
    {
        Id = Guid.NewGuid();
        Name = name;
        Email = email;
        Phone = phone;
        Role = role;
        BarbershopId = barbershopId;
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
        IsActive = true;
    }

    /// <summary>
    /// Verifica si el usuario pertenece a la barbería especificada
    /// </summary>
    public bool BelongsTo(Guid barbershopId) => BarbershopId == barbershopId;

    /// <summary>
    /// Verifica si el usuario es SuperAdmin
    /// </summary>
    public bool IsSuperAdmin() => Role == UserRole.SuperAdmin;

    /// <summary>
    /// Verifica si el usuario es Owner de una barbería
    /// </summary>
    public bool IsOwner() => Role == UserRole.Owner;
}