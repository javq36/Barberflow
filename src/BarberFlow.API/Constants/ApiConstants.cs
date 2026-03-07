namespace BarberFlow.API.Constants;

public static class ApiConstants
{
    public static class Routes
    {
        public const string HealthReady = "/health/ready";
        public const string HealthAuth = "/health/auth";
        public const string AuthRegisterOwner = "/auth/register-owner";
        public const string AuthLogin = "/auth/login";
        public const string AuthMe = "/auth/me";
        public const string Barbershops = "/barbershops";
        public const string BarbershopsMe = "/barbershops/me";
        public const string Services = "/services";
        public const string Barbers = "/barbers";
        public const string Customers = "/customers";
        public const string Appointments = "/appointments";
        public const string AvailabilitySlots = "/availability/slots";
    }

    public static class Messages
    {
        public const string JwtConfigMissing = "JWT configuration is missing. Set Jwt:Issuer, Jwt:Audience and Jwt:Key.";
        public const string JwtTokenValid = "JWT token is valid";
        public const string StatusOk = "ok";
        public const string InvalidCredentials = "Invalid email or password.";
        public const string EmailAlreadyExists = "Email is already registered.";
        public const string ForbiddenRole = "Only owners can perform this action.";
        public const string BarbershopClaimMissing = "User has no barbershop assigned. Login again after creating a barbershop.";
        public const string OwnerOnlyAction = "Only owners can perform this action.";
        public const string InvalidAppointmentPayload = "Invalid appointment payload.";
        public const string ResourceOutOfTenantScope = "Resource does not belong to this barbershop or is inactive.";
        public const string AppointmentTimeCollision = "Barber is not available at the selected time.";
    }
}
