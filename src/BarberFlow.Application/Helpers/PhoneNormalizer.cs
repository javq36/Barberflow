namespace BarberFlow.Application.Helpers;

public static class PhoneNormalizer
{
    private const string DefaultCountryCode = "+57"; // Colombia

    /// <summary>
    /// Normalizes a phone number to E.164 format.
    /// Colombian numbers (10 digits starting with 3) get +57 prepended.
    /// Numbers already starting with + are returned as-is.
    /// </summary>
    public static string? Normalize(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
            return phone;

        var cleaned = phone.Trim().Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "");

        if (cleaned.StartsWith('+'))
            return cleaned;

        // Colombian mobile: 10 digits starting with 3
        if (cleaned.Length == 10 && cleaned.StartsWith('3'))
            return DefaultCountryCode + cleaned;

        // Colombian with country code but no +
        if (cleaned.StartsWith("57") && cleaned.Length == 12)
            return "+" + cleaned;

        return cleaned;
    }
}
