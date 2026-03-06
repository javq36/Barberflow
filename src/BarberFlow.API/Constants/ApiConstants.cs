namespace BarberFlow.API.Constants;

public static class ApiConstants
{
    public static class Routes
    {
        public const string HealthReady = "/health/ready";
        public const string HealthAuth = "/health/auth";
    }

    public static class Messages
    {
        public const string JwtConfigMissing = "JWT configuration is missing. Set Jwt:Issuer, Jwt:Audience and Jwt:Key.";
        public const string JwtTokenValid = "JWT token is valid";
        public const string StatusOk = "ok";
    }
}
