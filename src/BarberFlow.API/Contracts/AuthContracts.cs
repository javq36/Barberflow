namespace BarberFlow.API.Contracts;

public sealed record RegisterOwnerRequest(
    string Name,
    string Email,
    string Phone,
    string Password);

public sealed record LoginRequest(
    string Email,
    string Password);

public sealed record CreateBarbershopRequest(
    string Name,
    string? Phone,
    string? Address,
    string? Timezone);

public sealed record UpdateBarbershopRequest(
    string Name,
    string? Phone,
    string? Address,
    string? Timezone);
