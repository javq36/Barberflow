using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OpenAI.Audio;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Transcribes audio streams using the OpenAI Whisper API.
/// Audio is processed in memory — no temp files are written to disk.
/// </summary>
public sealed class WhisperTranscriptionService
{
    private readonly AudioClient _audioClient;
    private readonly ILogger<WhisperTranscriptionService> _logger;

    public WhisperTranscriptionService(
        IOptions<OpenAiSettings> settings,
        ILogger<WhisperTranscriptionService> logger)
    {
        var apiKey = settings.Value.ApiKey;
        _audioClient = new AudioClient("whisper-1", apiKey);
        _logger = logger;
    }

    /// <summary>
    /// Transcribes an audio stream to text using Whisper.
    /// Returns <see langword="null"/> on failure — caller handles the fallback reply.
    /// </summary>
    /// <param name="audioStream">The audio data (held in memory, not written to disk).</param>
    /// <param name="fileName">
    ///     File name hint including extension (e.g. "voice.ogg").
    ///     Whisper uses the extension to determine the codec.
    /// </param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Transcribed text, or <see langword="null"/> on error.</returns>
    public async Task<string?> TranscribeAsync(
        Stream audioStream,
        string fileName,
        CancellationToken ct)
    {
        try
        {
            var options = new AudioTranscriptionOptions
            {
                Language = "es"
            };

            var result = await _audioClient.TranscribeAudioAsync(audioStream, fileName, options, ct);
            var text = result.Value.Text;

            if (string.IsNullOrWhiteSpace(text))
            {
                _logger.LogWarning("Whisper returned empty transcription for file {FileName}.", fileName);
                return null;
            }

            _logger.LogInformation("Audio transcribed successfully. Length={Length} chars.", text.Length);
            return text;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Whisper transcription failed for file {FileName}.", fileName);
            return null;
        }
    }
}
