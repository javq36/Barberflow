namespace BarberFlow.API.Contracts;

public sealed record CreateAppointmentRequest(
    Guid BarberId,
    Guid ServiceId,
    Guid CustomerId,
    DateTime AppointmentTime,
    string? Notes);
