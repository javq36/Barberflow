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

    // ─── Reset ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns <see langword="true"/> when the conversation should be reset
    /// because the last message was more than 30 minutes ago.
    /// </summary>
    public static bool ShouldReset(DateTimeOffset lastMessageAt)
        => DateTimeOffset.UtcNow - lastMessageAt > TimeSpan.FromMinutes(30);

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
