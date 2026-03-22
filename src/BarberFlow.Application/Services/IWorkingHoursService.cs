namespace BarberFlow.Application.Services;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Represents a single working-hour block for a barber on a given weekday.
/// day_of_week follows ISO 0=Sunday … 6=Saturday (matches DB INT column).
/// start_time / end_time are "HH:mm" strings (local barbershop time).
/// </summary>
public sealed record WorkingHourDto(
    Guid Id,
    Guid BarberId,
    int DayOfWeek,
    string StartTime,
    string EndTime,
    bool IsActive);

/// <summary>
/// Request payload for creating or replacing a working-hour block for one day.
/// </summary>
public sealed record UpsertWorkingHourRequest(
    int DayOfWeek,
    string StartTime,
    string EndTime,
    bool IsActive);

// ─── Interface ────────────────────────────────────────────────────────────────

/// <summary>
/// Application service for managing a barber's weekly working-hour schedule.
/// All mutating operations are Owner-only; reads are Owner-or-same-Barber.
/// </summary>
public interface IWorkingHoursService
{
    /// <summary>
    /// Returns all working-hour blocks configured for the given barber.
    /// Returns an empty list if none are configured.
    /// </summary>
    Task<IReadOnlyList<WorkingHourDto>> GetByBarberIdAsync(
        Guid barbershopId,
        Guid barberId,
        CancellationToken ct);

    /// <summary>
    /// Creates or replaces the working-hour block for a specific day.
    /// Validates start_time &lt; end_time and day_of_week in [0..6].
    /// </summary>
    Task<WorkingHourDto> UpsertAsync(
        Guid barbershopId,
        Guid barberId,
        UpsertWorkingHourRequest request,
        CancellationToken ct);

    /// <summary>
    /// Removes the working-hour block identified by <paramref name="workingHourId"/>.
    /// Returns <c>true</c> if deleted; <c>false</c> if not found.
    /// </summary>
    Task<bool> DeleteAsync(
        Guid barbershopId,
        Guid barberId,
        Guid workingHourId,
        CancellationToken ct);
}
