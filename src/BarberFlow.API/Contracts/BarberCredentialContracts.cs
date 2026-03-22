namespace BarberFlow.API.Contracts;

/// <summary>
/// Used by an owner to set initial credentials for a barber that has no password yet.
/// POST /barbers/{barberId}/credentials
/// </summary>
public sealed record SetBarberCredentialsRequest(
    string Email,
    string Password);

/// <summary>
/// Used by an owner to reset a barber's password (credentials must already exist).
/// PUT /barbers/{barberId}/credentials
/// </summary>
public sealed record ResetBarberPasswordRequest(
    string Password);
