namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Configuración de OpenAI para el orquestador de reservas por IA.
/// Se enlaza con la sección "OpenAI" de appsettings / variables de entorno.
/// <para>
/// Variables de entorno correspondientes:
/// <c>OpenAI__ApiKey</c>, <c>OpenAI__Model</c>,
/// <c>OpenAI__MaxToolIterations</c>, <c>OpenAI__MaxConversationMessages</c>.
/// </para>
/// <para>
/// NUNCA registrar <see cref="ApiKey"/> en logs o mensajes de error.
/// </para>
/// </summary>
public sealed class OpenAiSettings
{
    /// <summary>
    /// API Key de OpenAI. Tratar como secreto — nunca loguear ni exponer.
    /// </summary>
    public string ApiKey { get; init; } = string.Empty;

    /// <summary>
    /// Modelo de OpenAI a usar para el chat completion.
    /// Por defecto: "gpt-4o-mini" (mejor relación costo/calidad para function calling).
    /// </summary>
    public string Model { get; init; } = "gpt-4o-mini";

    /// <summary>
    /// Número máximo de iteraciones del loop de tool calls por mensaje.
    /// Evita bucles infinitos si el modelo encadena demasiadas herramientas.
    /// Por defecto: 5.
    /// </summary>
    public int MaxToolIterations { get; init; } = 5;

    /// <summary>
    /// Número máximo de mensajes a conservar en el historial de conversación.
    /// Los mensajes más antiguos se descartan cuando se supera este límite.
    /// Por defecto: 20.
    /// </summary>
    public int MaxConversationMessages { get; init; } = 20;

    /// <summary>
    /// Habilita la transcripción de audio vía Whisper.
    /// Cuando es <see langword="false"/>, los mensajes de voz reciben la respuesta de
    /// medio no soportado sin invocar la API de Whisper.
    /// Variable de entorno: <c>OpenAI__WhisperEnabled</c>.
    /// Por defecto: <see langword="true"/>.
    /// </summary>
    public bool WhisperEnabled { get; init; } = true;

    /// <summary>
    /// Tamaño máximo permitido para archivos de audio (en bytes).
    /// Los audios que superen este límite son rechazados antes de enviarse a Whisper.
    /// Variable de entorno: <c>OpenAI__MaxAudioSizeBytes</c>.
    /// Por defecto: 10 MB.
    /// </summary>
    public int MaxAudioSizeBytes { get; init; } = 10_485_760;
}
