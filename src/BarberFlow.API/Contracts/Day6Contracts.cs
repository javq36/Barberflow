namespace BarberFlow.API.Contracts;

public sealed record CreateAppointmentRequest(
    Guid BarberId,
    Guid ServiceId,
    Guid CustomerId,
    DateTime AppointmentTime,
    string? Notes);

public sealed record UpdateAppointmentStatusRequest(
    int Status,
    string? Notes);

public sealed record RescheduleAppointmentRequest(
    DateTime AppointmentTime,
    Guid? BarberId,
    Guid? ServiceId,
    string? Notes);

public sealed record CancelAppointmentRequest(
    string? Notes);
