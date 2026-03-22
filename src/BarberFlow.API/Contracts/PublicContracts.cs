namespace BarberFlow.API.Contracts;

// ─── Public Booking DTOs ──────────────────────────────────────────────────────
// These records are used by the public (no-auth) booking endpoints under
// /public/{slug}/*. They are intentionally slim — only fields that an anonymous
// customer needs to see.

/// <summary>Active service available for public booking.</summary>
public sealed record PublicServiceResponse(
    Guid Id,
    string Name,
    int DurationMinutes,
    decimal Price,
    string? ImageUrl);

/// <summary>Active barber available for public booking.</summary>
public sealed record PublicBarberResponse(
    Guid Id,
    string Name,
    string? ImageUrl);

/// <summary>A single bookable slot returned by the public availability endpoint.</summary>
public sealed record PublicSlotResponse(
    DateTimeOffset Start,
    DateTimeOffset End,
    bool Available);

/// <summary>
/// Request body for creating a public appointment (no authentication required).
/// </summary>
public sealed record PublicBookingRequest(
    Guid ServiceId,
    Guid BarberId,
    /// <summary>Slot start time in UTC (ISO 8601).</summary>
    DateTimeOffset SlotStart,
    string CustomerName,
    string CustomerPhone);

/// <summary>Confirmation response returned after a successful public booking.</summary>
public sealed record PublicBookingResponse(
    Guid AppointmentId,
    int Status,
    string ServiceName,
    string BarberName,
    DateTimeOffset DateTime,
    int EstimatedDurationMinutes);
