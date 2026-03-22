namespace BarberFlow.Application.Services;

/// <summary>
/// Computes available booking slots for a barber on a given date.
/// </summary>
public interface IAvailabilityService
{
    /// <summary>
    /// Returns available time slots for the given barber, service, and date.
    /// </summary>
    /// <param name="barbershopId">Barbershop tenant identifier.</param>
    /// <param name="barberId">Target barber identifier.</param>
    /// <param name="serviceId">Service to be booked (determines slot duration).</param>
    /// <param name="date">The requested booking date.</param>
    /// <param name="timezone">IANA timezone identifier for the barbershop (e.g. "America/New_York").</param>
    /// <param name="isPublic">
    ///   When <see langword="true"/>, a soft buffer of
    ///   <see cref="SlotBufferMinutes.Public"/> minutes is applied between slots
    ///   (hides exact end-time from anonymous users). When <see langword="false"/>,
    ///   no buffer is applied.
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Read-only list of computed slots sorted by start time.</returns>
    Task<IReadOnlyList<SlotDto>> GetAvailableSlotsAsync(
        Guid barbershopId,
        Guid barberId,
        Guid serviceId,
        DateOnly date,
        string timezone,
        bool isPublic,
        CancellationToken ct);
}

/// <summary>Represents a single bookable time slot.</summary>
/// <param name="Start">Slot start time in UTC.</param>
/// <param name="End">Slot end time in UTC.</param>
/// <param name="Available">Whether the slot is free to book.</param>
public sealed record SlotDto(
    DateTimeOffset Start,
    DateTimeOffset End,
    bool Available);

/// <summary>Named constants for slot buffer behaviour.</summary>
public static class SlotBufferMinutes
{
    /// <summary>Buffer applied to public (anonymous) availability requests.</summary>
    public const int Public = 10;

    /// <summary>No buffer for authenticated internal requests.</summary>
    public const int None = 0;
}
