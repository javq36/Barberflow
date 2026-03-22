namespace BarberFlow.Application.Services;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Represents a time-off period for a barber.
/// start_date / end_date are ISO-8601 date strings ("YYYY-MM-DD").
/// </summary>
public sealed record TimeOffDto(
    Guid Id,
    Guid BarberId,
    string StartDate,
    string EndDate,
    string? Reason);

/// <summary>
/// Request payload for creating a new time-off period.
/// start_date must be today or future; start_date ≤ end_date.
/// </summary>
public sealed record CreateTimeOffRequest(
    string StartDate,
    string EndDate,
    string? Reason);

// ─── Result types ─────────────────────────────────────────────────────────────

/// <summary>Outcome returned by <see cref="ITimeOffService.CreateAsync"/>.</summary>
public enum CreateTimeOffResult
{
    /// <summary>Time-off entry was created successfully.</summary>
    Created,

    /// <summary>start_date is in the past.</summary>
    PastDate,

    /// <summary>Overlaps with an existing time-off period for the same barber.</summary>
    Overlap,
}

// ─── Interface ────────────────────────────────────────────────────────────────

/// <summary>
/// Application service for managing barber time-off periods.
/// All mutating operations are Owner-only; reads are Owner-or-same-Barber.
/// </summary>
public interface ITimeOffService
{
    /// <summary>
    /// Returns future time-off entries for the given barber, optionally filtered
    /// by an inclusive date range [<paramref name="from"/>, <paramref name="to"/>].
    /// </summary>
    Task<IReadOnlyList<TimeOffDto>> GetByBarberIdAsync(
        Guid barbershopId,
        Guid barberId,
        DateOnly? from,
        DateOnly? to,
        CancellationToken ct);

    /// <summary>
    /// Creates a time-off period after validating date range and overlap.
    /// Returns the new entry on success; otherwise a <see cref="CreateTimeOffResult"/> error.
    /// </summary>
    Task<(CreateTimeOffResult Result, TimeOffDto? Entry)> CreateAsync(
        Guid barbershopId,
        Guid barberId,
        CreateTimeOffRequest request,
        CancellationToken ct);

    /// <summary>
    /// Removes the time-off entry identified by <paramref name="timeOffId"/>.
    /// Returns <c>true</c> if deleted; <c>false</c> if not found.
    /// </summary>
    Task<bool> DeleteAsync(
        Guid barbershopId,
        Guid barberId,
        Guid timeOffId,
        CancellationToken ct);
}
