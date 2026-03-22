using BarberFlow.Domain.Enums;

namespace BarberFlow.Application.Services;

// ─── Command records ─────────────────────────────────────────────────────────

/// <summary>Command to create an authenticated (owner-initiated) appointment.</summary>
public sealed record CreateAppointmentCommand(
    Guid BarberId,
    Guid ServiceId,
    Guid CustomerId,
    DateTimeOffset AppointmentTime,
    string? Notes);

/// <summary>Command to reschedule an existing appointment.</summary>
public sealed record RescheduleAppointmentCommand(
    Guid AppointmentId,
    DateTimeOffset NewAppointmentTime,
    Guid? BarberId,
    Guid? ServiceId,
    string? Notes);

/// <summary>Command to cancel an existing appointment.</summary>
public sealed record CancelAppointmentCommand(
    Guid AppointmentId,
    string? Notes);

/// <summary>Command to update the status of an appointment.</summary>
public sealed record UpdateAppointmentStatusCommand(
    Guid AppointmentId,
    AppointmentStatus Status,
    string? Notes);

/// <summary>Query parameters for listing appointments.</summary>
public sealed record GetAppointmentsQuery(
    DateTimeOffset? From,
    DateTimeOffset? To,
    int? Status,
    Guid? BarberId = null);

// ─── Result records ───────────────────────────────────────────────────────────

/// <summary>Represents the outcome of a booking operation.</summary>
public sealed record AppointmentResult(
    bool IsSuccess,
    Guid? AppointmentId,
    string? ErrorCode,
    string? ErrorMessage)
{
    /// <summary>Creates a successful result.</summary>
    public static AppointmentResult Success(Guid appointmentId) =>
        new(true, appointmentId, null, null);

    /// <summary>Creates a failure result with an error code and message.</summary>
    public static AppointmentResult Failure(string errorCode, string errorMessage) =>
        new(false, null, errorCode, errorMessage);
}

/// <summary>DTO for an appointment row returned from queries.</summary>
public sealed record AppointmentDto(
    Guid Id,
    Guid BarberId,
    Guid ServiceId,
    Guid CustomerId,
    DateTimeOffset AppointmentTime,
    DateTimeOffset EndTime,
    int Status,
    string? Notes,
    string BarberName,
    string CustomerName,
    string ServiceName);

// ─── Interface ────────────────────────────────────────────────────────────────

/// <summary>
/// Manages the full lifecycle of appointments: create, reschedule, cancel,
/// status updates, and querying.
/// </summary>
public interface IBookingService
{
    /// <summary>
    /// Creates a new appointment for an authenticated owner.
    /// Validates barber, service, and customer ownership as well as time conflicts.
    /// </summary>
    Task<AppointmentResult> CreateAppointmentAsync(
        Guid barbershopId,
        CreateAppointmentCommand command,
        CancellationToken ct);

    /// <summary>
    /// Reschedules an existing appointment, optionally changing barber or service.
    /// Returns <see cref="AppointmentResult"/> with error code "conflict" on overlap.
    /// </summary>
    Task<AppointmentResult> RescheduleAppointmentAsync(
        Guid barbershopId,
        RescheduleAppointmentCommand command,
        CancellationToken ct);

    /// <summary>
    /// Cancels an appointment. Idempotent if already cancelled.
    /// Returns error code "already_completed" if the appointment is completed.
    /// </summary>
    Task<AppointmentResult> CancelAppointmentAsync(
        Guid barbershopId,
        CancelAppointmentCommand command,
        CancellationToken ct);

    /// <summary>
    /// Updates the status of an appointment (e.g. Pending → Confirmed → Completed).
    /// </summary>
    Task<AppointmentResult> UpdateStatusAsync(
        Guid barbershopId,
        UpdateAppointmentStatusCommand command,
        CancellationToken ct);

    /// <summary>
    /// Retrieves a paged list of appointments for the barbershop within a date range.
    /// </summary>
    Task<IReadOnlyList<AppointmentDto>> GetAppointmentsAsync(
        Guid barbershopId,
        GetAppointmentsQuery query,
        CancellationToken ct);
}
