namespace BarberFlow.API.Contracts;

/// <summary>
/// Request body for creating a time-off period.
/// startDate / endDate must be "YYYY-MM-DD"; startDate must be today or future.
/// </summary>
public sealed record TimeOffCreateRequest(
    string StartDate,
    string EndDate,
    string? Reason);
