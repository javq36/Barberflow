namespace BarberFlow.API.Contracts;

/// <summary>
/// Request payload for upserting (create or replace) a single working-hour block.
/// day_of_week: 0 = Sunday … 6 = Saturday.
/// start_time / end_time: "HH:mm" format (local barbershop time).
/// </summary>
public sealed record UpsertWorkingHourApiRequest(
    int DayOfWeek,
    string StartTime,
    string EndTime,
    bool IsActive = true);

/// <summary>
/// API response DTO for a single working-hour block.
/// </summary>
public sealed record WorkingHourResponse(
    Guid Id,
    Guid BarberId,
    int DayOfWeek,
    string StartTime,
    string EndTime,
    bool IsActive);
