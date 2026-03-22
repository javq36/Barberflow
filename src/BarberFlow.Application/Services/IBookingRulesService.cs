namespace BarberFlow.Application.Services;

// ─── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>
/// Represents the booking rules configured for a barbershop.
/// slot_duration_minutes controls the length of each bookable slot.
/// buffer_minutes is soft padding added after each appointment (public flow only).
/// </summary>
public sealed record BookingRulesDto(
    Guid Id,
    Guid BarbershopId,
    int SlotDurationMinutes,
    int MaxDaysInAdvance,
    int MinNoticeHours,
    int BufferMinutes);

/// <summary>
/// Request payload for creating or updating booking rules.
/// slot_duration_minutes must be one of: 15, 30, 45, 60.
/// max_days_in_advance ≥ 1; min_notice_hours ≥ 0; buffer_minutes ≥ 0.
/// </summary>
public sealed record UpsertBookingRulesRequest(
    int SlotDurationMinutes,
    int MaxDaysInAdvance,
    int MinNoticeHours,
    int BufferMinutes);

// ─── Interface ────────────────────────────────────────────────────────────────

/// <summary>
/// Application service for managing per-barbershop booking configuration.
/// All operations are Owner-only.
/// </summary>
public interface IBookingRulesService
{
    /// <summary>
    /// Returns the booking rules for the given barbershop.
    /// Returns <c>null</c> if no rules have been configured yet.
    /// </summary>
    Task<BookingRulesDto?> GetByBarbershopIdAsync(
        Guid barbershopId,
        CancellationToken ct);

    /// <summary>
    /// Creates or replaces the booking rules for the given barbershop.
    /// Returns the persisted entity after upsert.
    /// </summary>
    Task<BookingRulesDto> UpsertAsync(
        Guid barbershopId,
        UpsertBookingRulesRequest request,
        CancellationToken ct);
}
