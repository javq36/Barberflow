using System.Text.Json;
using System.Text.Json.Serialization;
using OpenAI.Chat;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Converts between <see cref="List{ChatMessage}"/> (OpenAI SDK) and
/// <see cref="List{JsonElement}"/> (JSONB storage).
///
/// Storage format: [{ "role": "user|assistant", "content": "text" }, …]
/// Only user and assistant text messages are persisted (tool calls are transient).
/// </summary>
public static class ConversationHistorySerializer
{
    private static readonly JsonSerializerOptions Options =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ─── Serialize ────────────────────────────────────────────────────────────

    /// <summary>
    /// Converts an OpenAI SDK message list to a list of JsonElements for JSONB storage.
    /// Skips tool-related messages — only user and assistant text survive.
    /// </summary>
    public static List<JsonElement> Serialize(List<ChatMessage> messages)
    {
        var result = new List<JsonElement>(messages.Count);

        foreach (var msg in messages)
        {
            var storedMsg = msg switch
            {
                UserChatMessage u => new StoredMessage("user", ExtractText(u.Content)),
                AssistantChatMessage a when HasText(a) => new StoredMessage("assistant", ExtractAssistantText(a)),
                _ => null // Skip system, tool calls, tool results.
            };

            if (storedMsg is null || string.IsNullOrWhiteSpace(storedMsg.Content))
            {
                continue;
            }

            var json = JsonSerializer.SerializeToDocument(storedMsg, Options).RootElement.Clone();
            result.Add(json);
        }

        return result;
    }

    // ─── Deserialize ──────────────────────────────────────────────────────────

    /// <summary>
    /// Reconstructs OpenAI SDK <see cref="ChatMessage"/> objects from stored JSONB elements.
    /// Unknown roles are skipped.
    /// </summary>
    public static List<ChatMessage> Deserialize(List<JsonElement> stored)
    {
        var result = new List<ChatMessage>(stored.Count);

        foreach (var el in stored)
        {
            if (!el.TryGetProperty("role", out var roleEl) ||
                !el.TryGetProperty("content", out var contentEl))
            {
                continue;
            }

            var role = roleEl.GetString() ?? string.Empty;
            var content = contentEl.GetString() ?? string.Empty;

            ChatMessage? msg = role switch
            {
                "user" => ChatMessage.CreateUserMessage(content),
                "assistant" => ChatMessage.CreateAssistantMessage(content),
                _ => null
            };

            if (msg is not null)
            {
                result.Add(msg);
            }
        }

        return result;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static string ExtractText(IEnumerable<ChatMessageContentPart> parts)
    {
        foreach (var part in parts)
        {
            if (part.Kind == ChatMessageContentPartKind.Text &&
                !string.IsNullOrWhiteSpace(part.Text))
            {
                return part.Text;
            }
        }

        return string.Empty;
    }

    private static bool HasText(AssistantChatMessage msg)
    {
        foreach (var part in msg.Content)
        {
            if (part.Kind == ChatMessageContentPartKind.Text &&
                !string.IsNullOrWhiteSpace(part.Text))
            {
                return true;
            }
        }

        return false;
    }

    private static string ExtractAssistantText(AssistantChatMessage msg)
        => ExtractText(msg.Content);

    // ─── Storage DTO ─────────────────────────────────────────────────────────

    private sealed record StoredMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content);
}
