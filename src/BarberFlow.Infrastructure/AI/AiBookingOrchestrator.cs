using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Core AI orchestrator: takes a user message, runs the OpenAI function-calling loop,
/// executes tool calls via <see cref="ToolExecutor"/>, and returns the final text reply.
/// </summary>
public sealed class AiBookingOrchestrator
{
    private readonly ChatClient _client;
    private readonly ToolExecutor _toolExecutor;
    private readonly SystemPromptBuilder _promptBuilder;
    private readonly ILogger<AiBookingOrchestrator> _logger;
    private readonly int _maxIterations;
    private readonly string _model;

    private const string FallbackError =
        "No pude completar la operación, escribinos directamente";
    private const string ApiError =
        "El servicio tardó demasiado, intentá en un momento.";

    public AiBookingOrchestrator(
        IOptions<OpenAiSettings> settings,
        ToolExecutor toolExecutor,
        SystemPromptBuilder promptBuilder,
        ILogger<AiBookingOrchestrator> logger)
    {
        var cfg = settings.Value;
        _model = cfg.Model;
        _maxIterations = cfg.MaxToolIterations;
        _client = new ChatClient(cfg.Model, cfg.ApiKey);
        _toolExecutor = toolExecutor;
        _promptBuilder = promptBuilder;
        _logger = logger;
    }

    /// <summary>
    /// Processes a user message through the OpenAI function-calling loop (customer flow).
    /// Uses the customer system prompt and customer tool set.
    /// </summary>
    public Task<OrchestratorResult> ProcessMessageAsync(
        Guid barbershopId,
        string barbershopName,
        string customerPhone,
        string timezone,
        string userMessage,
        List<ChatMessage> history,
        CancellationToken ct)
    {
        var systemPrompt = _promptBuilder.Build(barbershopName, timezone);
        return ProcessMessageAsync(
            barbershopId, customerPhone, timezone,
            userMessage, history,
            ToolDefinitions.CustomerTools, systemPrompt,
            barberId: null,
            ct);
    }

    /// <summary>
    /// Processes a user message through the OpenAI function-calling loop with explicit tool set and prompt.
    /// Used by the barber flow to inject role-specific tools and system prompt.
    /// </summary>
    public async Task<OrchestratorResult> ProcessMessageAsync(
        Guid barbershopId,
        string phone,
        string timezone,
        string userMessage,
        List<ChatMessage> history,
        IReadOnlyList<ChatTool> tools,
        string systemPrompt,
        Guid? barberId,
        CancellationToken ct)
    {
        var messages = BuildMessageList(systemPrompt, history, userMessage);

        var options = new ChatCompletionOptions();
        foreach (var tool in tools)
        {
            options.Tools.Add(tool);
        }

        try
        {
            var reply = await RunLoopAsync(messages, options, barbershopId, phone, timezone, barberId, ct);
            return new OrchestratorResult(reply, messages);
        }
        catch (Exception ex)
        {
            // NEVER log API key — only log a safe message.
            _logger.LogError(ex, "OpenAI API error. Model={Model}", _model);
            return new OrchestratorResult(ApiError, history);
        }
    }

    // ─── Loop ─────────────────────────────────────────────────────────────────

    private async Task<string> RunLoopAsync(
        List<ChatMessage> messages,
        ChatCompletionOptions options,
        Guid barbershopId,
        string phone,
        string timezone,
        Guid? barberId,
        CancellationToken ct)
    {
        for (var iteration = 0; iteration < _maxIterations; iteration++)
        {
            var completion = await _client.CompleteChatAsync(messages, options, ct);
            var response = completion.Value;

            if (response.FinishReason == ChatFinishReason.ToolCalls)
            {
                messages.Add(ChatMessage.CreateAssistantMessage(response.ToolCalls));
                await AppendToolResultsAsync(messages, response.ToolCalls, barbershopId, phone, timezone, barberId, ct);
                continue;
            }

            var text = ExtractText(response);
            if (!string.IsNullOrWhiteSpace(text))
            {
                messages.Add(ChatMessage.CreateAssistantMessage(text));
                return text;
            }

            break;
        }

        _logger.LogWarning("Max tool iterations ({Max}) reached. Model={Model}", _maxIterations, _model);
        return FallbackError;
    }

    private async Task AppendToolResultsAsync(
        List<ChatMessage> messages,
        IEnumerable<ChatToolCall> toolCalls,
        Guid barbershopId,
        string phone,
        string timezone,
        Guid? barberId,
        CancellationToken ct)
    {
        foreach (var call in toolCalls)
        {
            var argsJson = call.FunctionArguments.ToString();
            var args = JsonSerializer.Deserialize<JsonElement>(argsJson);

            _logger.LogInformation(
                "Executing tool. Name={ToolName}", call.FunctionName);

            var result = await _toolExecutor.ExecuteAsync(
                call.FunctionName, args, barbershopId, phone, timezone, barberId, ct);

            messages.Add(ChatMessage.CreateToolMessage(call.Id, result));
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private static List<ChatMessage> BuildMessageList(
        string systemPrompt,
        List<ChatMessage> history,
        string userMessage)
    {
        var list = new List<ChatMessage>(history.Count + 2)
        {
            ChatMessage.CreateSystemMessage(systemPrompt)
        };
        list.AddRange(history);
        list.Add(ChatMessage.CreateUserMessage(userMessage));
        return list;
    }

    private static string ExtractText(ChatCompletion completion)
    {
        foreach (var part in completion.Content)
        {
            if (part.Kind == ChatMessageContentPartKind.Text &&
                !string.IsNullOrWhiteSpace(part.Text))
            {
                return part.Text;
            }
        }
        return string.Empty;
    }
}

/// <summary>Result returned by <see cref="AiBookingOrchestrator.ProcessMessageAsync"/>.</summary>
public sealed record OrchestratorResult(string Reply, List<ChatMessage> UpdatedHistory);
