using System.Net;
using System.Security.Claims;
using BarberFlow.API.Constants;

namespace BarberFlow.API.Endpoints;

internal static class EndpointHelpers
{
    internal static bool IsOwner(ClaimsPrincipal user) =>
        string.Equals(user.FindFirstValue(ClaimTypes.Role), "Owner", StringComparison.OrdinalIgnoreCase);

    internal static bool IsSuperAdmin(ClaimsPrincipal user) =>
        string.Equals(user.FindFirstValue(ClaimTypes.Role), "SuperAdmin", StringComparison.OrdinalIgnoreCase);

    internal static bool CanManageBarbershopProfile(ClaimsPrincipal user) => IsOwner(user) || IsSuperAdmin(user);

    internal static bool TryGetBarbershopId(ClaimsPrincipal user, out Guid barbershopId, out IResult? error)
    {
        barbershopId = Guid.Empty;
        error = null;

        var barbershopClaim = user.FindFirstValue("barbershop_id");
        if (!Guid.TryParse(barbershopClaim, out barbershopId))
        {
            error = Results.BadRequest(new { message = ApiConstants.Messages.BarbershopClaimMissing });
            return false;
        }

        return true;
    }

    internal static bool IsLocalNetworkFrontendOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin) || !Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        var isHttp = string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase);
        var isHttps = string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

        if (!isHttp && !isHttps)
        {
            return false;
        }

        if (uri.IsLoopback)
        {
            return uri.Port is 3000 or 3001;
        }

        if (!IPAddress.TryParse(uri.Host, out var ipAddress))
        {
            return false;
        }

        return uri.Port is 3000 or 3001 && IsPrivateIpv4(ipAddress);
    }

    internal static bool IsPrivateIpv4(IPAddress ipAddress)
    {
        if (ipAddress.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
        {
            return false;
        }

        var bytes = ipAddress.GetAddressBytes();

        // RFC1918 private ranges.
        return bytes[0] == 10 ||
               (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168);
    }

    internal static bool IsValidEmail(string email)
    {
        try { _ = new System.Net.Mail.MailAddress(email); return true; }
        catch { return false; }
    }

    internal static bool IsValidPassword(string password) =>
        password.Length >= 8 &&
        password.Any(char.IsLetter) &&
        password.Any(char.IsDigit);

    internal static bool IsValidName(string name, int maxLength = 100) =>
        !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= maxLength;
}
