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
        "No pude completar tu solicitud. Intentalo de nuevo.";
    private const string ApiError =
        "Servicio temporalmente no disponible. Por favor intentá más tarde.";

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
    /// Processes a user message through the OpenAI function-calling loop.
    /// </summary>
    public async Task<OrchestratorResult> ProcessMessageAsync(
        Guid barbershopId,
        string barbershopName,
        string customerPhone,
        string timezone,
        string userMessage,
        List<ChatMessage> history,
        CancellationToken ct)
    {
        var systemPrompt = _promptBuilder.Build(barbershopName, timezone);
        var messages = BuildMessageList(systemPrompt, history, userMessage);

        var options = new ChatCompletionOptions();
        foreach (var tool in ToolDefinitions.All)
        {
            options.Tools.Add(tool);
        }

        try
        {
            var reply = await RunLoopAsync(messages, options, barbershopId, customerPhone, timezone, ct);
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
        string customerPhone,
        string timezone,
        CancellationToken ct)
    {
        for (var iteration = 0; iteration < _maxIterations; iteration++)
        {
            var completion = await _client.CompleteChatAsync(messages, options, ct);
            var response = completion.Value;

            if (response.FinishReason == ChatFinishReason.ToolCalls)
            {
                messages.Add(ChatMessage.CreateAssistantMessage(response.ToolCalls));
                await AppendToolResultsAsync(messages, response.ToolCalls, barbershopId, customerPhone, timezone, ct);
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

        _logger.LogWarning("Max tool iterations reached. Model={Model}", _model);
        return FallbackError;
    }

    private async Task AppendToolResultsAsync(
        List<ChatMessage> messages,
        IEnumerable<ChatToolCall> toolCalls,
        Guid barbershopId,
        string customerPhone,
        string timezone,
        CancellationToken ct)
    {
        foreach (var call in toolCalls)
        {
            var argsJson = call.FunctionArguments.ToString();
            var args = JsonSerializer.Deserialize<JsonElement>(argsJson);

            _logger.LogInformation(
                "Executing tool. Name={ToolName}", call.FunctionName);

            var result = await _toolExecutor.ExecuteAsync(
                call.FunctionName, args, barbershopId, customerPhone, timezone, ct);

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
