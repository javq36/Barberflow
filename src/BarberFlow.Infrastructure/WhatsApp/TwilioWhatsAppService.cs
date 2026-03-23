using BarberFlow.Application.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Twilio-backed implementation of <see cref="IWhatsAppService"/>.
/// Supports both sandbox mode (free-form body text) and production mode (Content Template SIDs).
/// <para>
/// NEVER log <see cref="TwilioSettings.AccountSid"/> or <see cref="TwilioSettings.AuthToken"/>.
/// </para>
/// </summary>
public sealed class TwilioWhatsAppService : IWhatsAppService
{
    private static readonly System.Text.RegularExpressions.Regex E164Regex =
        new(@"^\+[1-9]\d{7,14}$", System.Text.RegularExpressions.RegexOptions.Compiled);

    private readonly TwilioSettings _settings;
    private readonly ILogger<TwilioWhatsAppService> _logger;

    public TwilioWhatsAppService(IOptions<TwilioSettings> options, ILogger<TwilioWhatsAppService> logger)
    {
        _settings = options.Value;
        _logger = logger;

        // Initialize Twilio client once on construction. Credentials are never logged.
        TwilioClient.Init(_settings.AccountSid, _settings.AuthToken);
    }

    /// <inheritdoc />
    public async Task SendTemplateAsync(
        string customerPhone,
        string templateName,
        Dictionary<string, string> templateVariables,
        CancellationToken ct)
    {
        if (!E164Regex.IsMatch(customerPhone))
        {
            // Fail immediately — do NOT log the phone value.
            throw new ArgumentException("Customer phone is not valid E.164 format.", nameof(customerPhone));
        }

        var fromWhatsApp = FormatWhatsAppNumber(_settings.FromNumber);
        var toWhatsApp = FormatWhatsAppNumber(customerPhone);

        var isSandbox = _settings.UseSandbox
            || _settings.FromNumber.Contains("whatsapp:+14155238886", StringComparison.OrdinalIgnoreCase)
            || _settings.FromNumber.Equals("+14155238886", StringComparison.OrdinalIgnoreCase);

        try
        {
            if (isSandbox)
            {
                // Sandbox: send as free-form body text (no Content Template SID required).
                var body = BuildSandboxBody(templateName, templateVariables);

                await MessageResource.CreateAsync(
                    to: new PhoneNumber(toWhatsApp),
                    from: new PhoneNumber(fromWhatsApp),
                    body: body);

                _logger.LogInformation(
                    "WhatsApp sandbox message sent. Template={TemplateName} BarbershopScope=sandbox",
                    templateName);
            }
            else
            {
                // Production: use Content Template SID.
                if (!_settings.TemplateSids.TryGetValue(templateName, out var contentSid)
                    || string.IsNullOrWhiteSpace(contentSid))
                {
                    throw new InvalidOperationException(
                        $"No Twilio Content Template SID configured for template '{templateName}'.");
                }

                var contentVariables = BuildContentVariables(templateVariables);

                await MessageResource.CreateAsync(
                    to: new PhoneNumber(toWhatsApp),
                    from: new PhoneNumber(fromWhatsApp),
                    contentSid: contentSid,
                    contentVariables: contentVariables);

                _logger.LogInformation(
                    "WhatsApp message sent. Template={TemplateName}",
                    templateName);
            }
        }
        catch (ArgumentException)
        {
            // Re-throw phone validation errors as-is (no sensitive data).
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to send WhatsApp message. Template={TemplateName} RetryEligible=true",
                templateName);

            // Re-throw so the processor can update retry_count / last_error.
            throw;
        }
    }

    /// <inheritdoc />
    public async Task SendTextAsync(string customerPhone, string text, CancellationToken ct)
    {
        if (!E164Regex.IsMatch(customerPhone))
        {
            throw new ArgumentException("Customer phone is not valid E.164 format.", nameof(customerPhone));
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ArgumentException("Message text cannot be empty.", nameof(text));
        }

        var fromWhatsApp = FormatWhatsAppNumber(_settings.FromNumber);
        var toWhatsApp = FormatWhatsAppNumber(customerPhone);

        try
        {
            await MessageResource.CreateAsync(
                to: new PhoneNumber(toWhatsApp),
                from: new PhoneNumber(fromWhatsApp),
                body: text);

            _logger.LogInformation("WhatsApp free-form message sent.");
        }
        catch (ArgumentException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send WhatsApp free-form message.");
            throw;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Ensures the phone number is prefixed with "whatsapp:" as required by Twilio.
    /// </summary>
    private static string FormatWhatsAppNumber(string phone)
    {
        if (phone.StartsWith("whatsapp:", StringComparison.OrdinalIgnoreCase))
        {
            return phone;
        }

        return $"whatsapp:{phone}";
    }

    /// <summary>
    /// Builds a human-readable body for sandbox testing from template variables.
    /// </summary>
    private static string BuildSandboxBody(string templateName, Dictionary<string, string> variables)
    {
        if (variables.Count == 0)
        {
            return $"[{templateName}]";
        }

        var parts = variables.Select(kv => $"{kv.Key}: {kv.Value}");
        return $"[{templateName}] {string.Join(" | ", parts)}";
    }

    /// <summary>
    /// Serializes template variables as a JSON object string for Twilio Content Variables.
    /// Twilio expects format: <c>{"1":"value1","2":"value2"}</c> for positional variables,
    /// or named keys when using custom Content Templates.
    /// </summary>
    private static string BuildContentVariables(Dictionary<string, string> variables)
    {
        if (variables.Count == 0)
        {
            return "{}";
        }

        return System.Text.Json.JsonSerializer.Serialize(variables);
    }
}
