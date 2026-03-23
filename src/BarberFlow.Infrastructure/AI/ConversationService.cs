using System.Text.Json;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Manages WhatsApp conversation history stored as JSONB in <c>whatsapp_conversations</c>.
/// Uses raw Npgsql (no EF) with explicit <see cref="NpgsqlDbType"/> on all parameters.
/// </summary>
public sealed class ConversationService
{
    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private readonly string _connectionString;
    private readonly int _maxMessages;

    public ConversationService(string connectionString, IOptions<OpenAiSettings> settings)
    {
        _connectionString = connectionString;
        _maxMessages = settings.Value.MaxConversationMessages;
    }

    // ─── Load ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads the conversation for <paramref name="phone"/> within <paramref name="barbershopId"/>.
    /// Returns null if no conversation exists yet.
    /// </summary>
    public async Task<ConversationRecord?> LoadAsync(
        Guid barbershopId, string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT messages, context, last_message_at
            FROM whatsapp_conversations
            WHERE barbershop_id = @barbershopId AND phone = @phone
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        var messagesJson = reader.GetString(0);
        var contextJson = reader.GetString(1);
        var lastMessageAt = reader.GetFieldValue<DateTimeOffset>(2);

        var messages = JsonSerializer.Deserialize<List<JsonElement>>(messagesJson, JsonOptions)
                       ?? new List<JsonElement>();
        var context = JsonSerializer.Deserialize<Dictionary<string, object>>(contextJson, JsonOptions)
                      ?? new Dictionary<string, object>();

        return new ConversationRecord(messages, context, lastMessageAt);
    }

    // ─── Save ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Upserts the conversation. Trims messages to <see cref="OpenAiSettings.MaxConversationMessages"/>
    /// before persisting. Uses INSERT … ON CONFLICT DO UPDATE.
    /// </summary>
    public async Task SaveAsync(
        Guid barbershopId, string phone,
        List<JsonElement> messages, Dictionary<string, object> context,
        CancellationToken ct)
    {
        var trimmed = TrimMessages(messages);
        var messagesJson = JsonSerializer.Serialize(trimmed, JsonOptions);
        var contextJson = JsonSerializer.Serialize(context, JsonOptions);

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO whatsapp_conversations
                (id, barbershop_id, phone, messages, context, last_message_at, created_at)
            VALUES
                (gen_random_uuid(), @barbershopId, @phone, @messages::jsonb, @context::jsonb, NOW(), NOW())
            ON CONFLICT (barbershop_id, phone)
            DO UPDATE SET
                messages        = EXCLUDED.messages,
                context         = EXCLUDED.context,
                last_message_at = NOW()", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });
        cmd.Parameters.Add(new NpgsqlParameter("messages", NpgsqlDbType.Text) { Value = messagesJson });
        cmd.Parameters.Add(new NpgsqlParameter("context", NpgsqlDbType.Text) { Value = contextJson });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Analytics ───────────────────────────────────────────────────────────

    /// <summary>
    /// Upserts the <c>conversation_analytics</c> row for the given conversation.
    /// Increments <c>messages_count</c>, accumulates <c>total_response_ms</c>,
    /// and marks <c>updated_at</c> to NOW().
    /// Creates the row on first call; subsequent calls do an incremental update.
    /// </summary>
    public async Task UpsertAnalyticsAsync(
        Guid barbershopId,
        string phone,
        long responseMs,
        CancellationToken ct)
    {
        var conversationId = await GetConversationIdAsync(barbershopId, phone, ct);
        if (conversationId is null)
        {
            return;
        }

        await WriteAnalyticsRowAsync(conversationId.Value, barbershopId, responseMs, ct);
    }

    /// <summary>
    /// Full analytics upsert with tools-used and booking-completed tracking.
    /// Called by the orchestrator after each AI turn.
    /// </summary>
    public async Task UpsertAnalyticsAsync(
        Guid barbershopId,
        string phone,
        IReadOnlyList<string> toolsUsed,
        bool bookingCompleted,
        long responseMs,
        CancellationToken ct)
    {
        var conversationId = await GetConversationIdAsync(barbershopId, phone, ct);
        if (conversationId is null)
        {
            return;
        }

        await WriteAnalyticsRowAsync(conversationId.Value, barbershopId, responseMs, toolsUsed, bookingCompleted, ct);
    }

    private async Task<Guid?> GetConversationIdAsync(Guid barbershopId, string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT id FROM whatsapp_conversations
            WHERE barbershop_id = @barbershopId AND phone = @phone
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        var result = await cmd.ExecuteScalarAsync(ct);
        return result is Guid g ? g : null;
    }

    private async Task WriteAnalyticsRowAsync(
        Guid conversationId, Guid barbershopId, long responseMs, CancellationToken ct)
    {
        await WriteAnalyticsRowAsync(conversationId, barbershopId, responseMs, Array.Empty<string>(), false, ct);
    }

    private async Task WriteAnalyticsRowAsync(
        Guid conversationId,
        Guid barbershopId,
        long responseMs,
        IReadOnlyList<string> toolsUsed,
        bool bookingCompleted,
        CancellationToken ct)
    {
        var toolsArray = toolsUsed.ToArray();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO conversation_analytics
                (id, conversation_id, barbershop_id, messages_count, tools_used,
                 booking_completed, total_response_ms, updated_at)
            VALUES
                (gen_random_uuid(), @conversationId, @barbershopId, 1, @tools,
                 @bookingCompleted, @responseMs, NOW())
            ON CONFLICT (conversation_id) DO UPDATE SET
                messages_count    = conversation_analytics.messages_count + 1,
                tools_used        = array_cat(conversation_analytics.tools_used, @tools),
                booking_completed = conversation_analytics.booking_completed OR @bookingCompleted,
                total_response_ms = conversation_analytics.total_response_ms + @responseMs,
                updated_at        = NOW()", conn);

        cmd.Parameters.Add(new NpgsqlParameter("conversationId", NpgsqlDbType.Uuid) { Value = conversationId });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("tools", NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = toolsArray });
        cmd.Parameters.Add(new NpgsqlParameter("bookingCompleted", NpgsqlDbType.Boolean) { Value = bookingCompleted });
        cmd.Parameters.Add(new NpgsqlParameter("responseMs", NpgsqlDbType.Bigint) { Value = responseMs });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Reset ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns <see langword="true"/> when the conversation should be reset
    /// because the last message was more than 30 minutes ago.
    /// </summary>
    public static bool ShouldReset(DateTimeOffset lastMessageAt)
        => DateTimeOffset.UtcNow - lastMessageAt > TimeSpan.FromMinutes(30);

    /// <summary>
    /// Clears the conversation history and pending context for the given phone number.
    /// Used for manual resets (keyword-triggered).
    /// Sets <c>messages</c> to <c>[]</c>, <c>context</c> to <c>{}</c>, and
    /// updates <c>last_message_at</c> to NOW().
    /// No-op if no conversation row exists yet.
    /// </summary>
    public async Task ResetAsync(Guid barbershopId, string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_conversations
            SET
                messages        = '[]'::jsonb,
                context         = '{}'::jsonb,
                last_message_at = NOW()
            WHERE barbershop_id = @barbershopId AND phone = @phone", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>
    /// Clears only the pending context (sets <c>context</c> to <c>{}</c>) and updates
    /// <c>last_message_at</c>, but KEEPS the message history intact.
    /// Used for inactivity auto-resets (30 min) so history is preserved for context
    /// while any in-progress booking state is discarded.
    /// No-op if no conversation row exists yet.
    /// </summary>
    public async Task ResetContextAsync(Guid barbershopId, string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            UPDATE whatsapp_conversations
            SET
                context         = '{}'::jsonb,
                last_message_at = NOW()
            WHERE barbershop_id = @barbershopId AND phone = @phone", conn);

        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        await cmd.ExecuteNonQueryAsync(ct);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private List<JsonElement> TrimMessages(List<JsonElement> messages)
    {
        if (messages.Count <= _maxMessages)
        {
            return messages;
        }

        return messages.Skip(messages.Count - _maxMessages).ToList();
    }
}

/// <summary>Loaded conversation state from the database.</summary>
public sealed record ConversationRecord(
    List<JsonElement> Messages,
    Dictionary<string, object> Context,
    DateTimeOffset LastMessageAt);
