using System.Collections.Concurrent;

namespace BarberFlow.API;

/// <summary>
/// In-memory per-phone rate limiter for the WhatsApp webhook.
/// Enforces a maximum of <see cref="MaxMessages"/> messages per phone per minute.
/// Registered as a singleton so state is shared across all requests.
/// </summary>
public sealed class WhatsAppPhoneRateLimiter
{
    private const int MaxMessages = 10;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    // phone → timestamps of recent messages within the sliding window.
    private readonly ConcurrentDictionary<string, Queue<DateTime>> _windows = new();

    /// <summary>
    /// Returns <see langword="true"/> if the phone is within the rate limit;
    /// <see langword="false"/> when the limit is exceeded.
    /// Thread-safe.
    /// </summary>
    public bool TryAcquire(string phone)
    {
        var now = DateTime.UtcNow;
        var cutoff = now - Window;

        var queue = _windows.GetOrAdd(phone, _ => new Queue<DateTime>());

        lock (queue)
        {
            // Evict timestamps outside the current window.
            while (queue.Count > 0 && queue.Peek() < cutoff)
            {
                queue.Dequeue();
            }

            if (queue.Count >= MaxMessages)
            {
                return false;
            }

            queue.Enqueue(now);
            return true;
        }
    }
}
