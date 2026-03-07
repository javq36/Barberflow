# BarberFlow

BarberFlow is a SaaS platform for barbershop appointment automation with a .NET backend, a Next.js web app for owners, and planned WhatsApp booking flows.

## Current Stack

- Backend: ASP.NET Core Web API (.NET 9)
- Data access: Entity Framework Core + Npgsql
- Database: PostgreSQL (Supabase)
- Architecture: API + Application + Domain + Infrastructure projects
- Frontend: Next.js 16 + Tailwind + shadcn/ui + Redux Toolkit + RTK Query
- API docs: Swagger (Swashbuckle)
- Auth: JWT bearer + HttpOnly cookie session flow (via web proxy routes)

## Solution Structure

```text
BarberFlow.sln
package.json
src/
  BarberFlow.API/
  BarberFlow.Application/
  BarberFlow.Domain/
  BarberFlow.Infrastructure/
  barberflow-web/
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

Run API in watch mode only:

```bash
npm run dev:api
```

Run API + frontend together (single command):

```bash
npm run dev
```

`npm run dev` automatically cleans stale local locks/ports before starting both services.

This starts:

- API on `https://localhost:7095` (and `http://localhost:5164`)
- Web on `http://localhost:3000`

Run API watch manually (alternative):

```bash
dotnet watch --project src/BarberFlow.API run --launch-profile https
```

Important local rule:

- Do not run `npm run dev` and `dotnet watch` for API at the same time.
- Both start the API and can cause `address already in use` on ports `5164/7095`.

Swagger URL (development):

- `http://localhost:5164/swagger`

## Current Status

Backend:

- Owner auth flow implemented (`/auth/register-owner`, `/auth/login`, `/auth/me`)
- Barbershop onboarding and profile implemented (`POST /barbershops`, `GET/PUT /barbershops/me`)
- Owner CRUD implemented for services, barbers, customers
- Soft delete by status implemented for barbers and customers (`active` flag)
- Appointments API implemented:
  - `POST /appointments`
  - `GET /appointments`
  - `PATCH /appointments/{id}/status`
  - `PATCH /appointments/{id}/reschedule`
  - `PATCH /appointments/{id}/cancel`
- Availability slots implemented (`GET /availability/slots`)

Frontend (Owner dashboard/admin):

- Login/register + session guards
- Admin module with quick-create and full-width management tables
- Barbershop view/update flow and owner onboarding without initial barbershop
- Loading UX standardized (`LoadingIndicator` + `LoadingButton`)

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
- If you get `column "active" does not exist` for customers, apply latest SQL migrations in `supabase/migrations`.

## Next MVP Focus

- Build visual appointment flow in `/admin` using availability slots
- Connect admin UI to appointment management endpoints (`status/reschedule/cancel`)
- Add consistent confirmation dialogs and table filters/search
- Define multi-branch owner model (multiple barbershops per owner) as next architecture increment
