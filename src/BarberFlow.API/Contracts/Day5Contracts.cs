namespace BarberFlow.API.Contracts;

public sealed record CreateServiceRequest(
    string Name,
    int DurationMinutes,
    decimal Price,
    bool Active = true);

public sealed record UpdateServiceRequest(
    string Name,
    int DurationMinutes,
    decimal Price,
    bool Active);

public sealed record CreateBarberRequest(
    string Name,
    string? Phone,
    string? Email,
    bool IsActive = true);

public sealed record UpdateBarberRequest(
    string Name,
    string? Phone,
    string? Email,
    bool IsActive);

public sealed record CreateCustomerRequest(
    string Name,
    string? Phone,
    string? Email,
    string? Notes,
    bool IsActive = true);

public sealed record UpdateCustomerRequest(
    string Name,
    string? Phone,
    string? Email,
    string? Notes,
    bool IsActive);
