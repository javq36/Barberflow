# BarberFlow

BarberFlow is a SaaS platform for barbershop appointment automation, with a .NET backend and future WhatsApp + web dashboard flows.

## Current Stack

- Backend: ASP.NET Core Web API (.NET 9)
- Data access: Entity Framework Core + Npgsql
- Database: PostgreSQL (Supabase)
- Architecture: API + Application + Domain + Infrastructure projects
- API docs: Swagger (Swashbuckle)
- Auth base: JWT bearer configured

## Solution Structure

```text
BarberFlow.sln
src/
  BarberFlow.API/
  BarberFlow.Application/
  BarberFlow.Domain/
  BarberFlow.Infrastructure/
supabase/
  migrations/
tests/
```

## Git Branch Strategy

- `main`: stable production-ready baseline
- `stage`: code that already passed tests/validation
- `dev`: integration branch for active development
- `feature/*` or task branches (`BBF-XX`): created from `stage`

Current convention in use:

- `BBF-01`, `BBF-02`, etc.

## Prerequisites

- .NET SDK 9
- Git
- Optional: GitHub CLI (`gh`)

## Initial Configuration

### 1) Database connection

`src/BarberFlow.API/appsettings.json` contains a placeholder by design:

- `ConnectionStrings:DefaultConnection = SET_ME_IN_USER_SECRETS_OR_ENV`

Recommended for local dev:

- Use `appsettings.Development.json`, environment variables, or user-secrets.
- Do not commit real credentials.

### 2) JWT config

JWT settings are in:

- `src/BarberFlow.API/appsettings.json`
- `src/BarberFlow.API/appsettings.Development.json`

Keys used:

- `Jwt:Issuer`
- `Jwt:Audience`
- `Jwt:Key`
- `Jwt:ExpirationMinutes`

Use a real secret key with at least 32 chars in development and production.

## Run Commands

From repo root (`C:\Proyectos\BarberFlow`):

```bash
dotnet restore
dotnet build BarberFlow.sln
```

Run API:

```bash
dotnet run --project src/BarberFlow.API
```

Run with auto-reload:

```bash
dotnet watch --project src/BarberFlow.API run
```

Swagger URL (development):

- `http://localhost:5164/swagger`

## Current Implemented Endpoints

- `GET /health/ready` (formal health check, includes DB reachability)
- `GET /health/auth` (requires valid JWT)

## Database Workflow (Official)

- Strategy: SQL-first with Supabase migrations
- Source of truth: `supabase/migrations/*.sql`
- EF Core is used as runtime mapping layer (`BarberFlowDbContext`)

Detailed guide:

- `docs/DB_WORKFLOW.md`

## Notes

- The default `weatherforecast` template endpoint was removed.
- Swagger UI is enabled in development.
- If `dotnet build` fails with locked files, stop running API/watch process first.

## Next MVP Focus (Day 1 pending)

- Finalize JWT flow with token issuance endpoint for testing
- Add first real app endpoints and application services
- Keep all business logic in Application layer
