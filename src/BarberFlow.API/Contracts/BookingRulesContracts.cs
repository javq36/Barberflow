namespace BarberFlow.API.Contracts;

/// <summary>
/// Request payload for upserting (create or replace) booking rules for a barbershop.
/// slot_duration_minutes must be one of: 15, 30, 45, 60.
/// max_days_in_advance ≥ 1; min_notice_hours ≥ 0; buffer_minutes ≥ 0.
/// </summary>
public sealed record UpsertBookingRulesApiRequest(
    int SlotDurationMinutes,
    int MaxDaysInAdvance,
    int MinNoticeHours,
    int BufferMinutes);

/// <summary>
/// API response DTO for the booking rules of a barbershop.
/// </summary>
public sealed record BookingRulesResponse(
    Guid Id,
    Guid BarbershopId,
    int SlotDurationMinutes,
    int MaxDaysInAdvance,
    int MinNoticeHours,
    int BufferMinutes);
