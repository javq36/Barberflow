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
        public const string AppointmentsStatusSuffix = "/status";
        public const string AppointmentsRescheduleSuffix = "/reschedule";
        public const string AppointmentsCancelSuffix = "/cancel";
        public const string AvailabilitySlots = "/availability/slots";
        public const string WorkingHours = "working-hours";
        public const string BarberCredentials = "/barbers/{barberId:guid}/credentials";
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
        public const string InvalidAppointmentStatus = "Invalid appointment status.";
        public const string AppointmentCannotBeUpdated = "Appointment cannot be updated in its current state.";
        public const string AppointmentCannotBeCancelled = "Appointment cannot be cancelled in its current state.";
        public const string AppointmentRescheduleCollision = "Barber is not available at the selected reschedule time.";
        public const string ResourceOutOfTenantScope = "Resource does not belong to this barbershop or is inactive.";
        public const string AppointmentTimeCollision = "Barber is not available at the selected time.";
        public const string BarberCredentialsAlreadySet = "Barber credentials are already set. Use PUT /barbers/{id}/credentials to reset the password.";
        public const string BarberCredentialsNotFound = "Barber not found in this barbershop.";
        public const string PasswordTooShort = "Password must be at least 8 characters.";
    }
}
