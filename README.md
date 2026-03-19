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

Cross-platform local setup (recommended):

1. Copy `env/backend.example` to `.env.backend` in repository root.
2. Set either `ConnectionStrings__DefaultConnection` or `DATABASE_URL` in `.env.backend`.
3. Run `npm run dev` from repo root.

`npm run dev:api` now loads `.env.backend` automatically on Linux/WSL/Windows.

Cross-platform environment variable options (Windows, Linux/WSL, Railway):

- `ConnectionStrings__DefaultConnection` with a regular Npgsql connection string.
- `DATABASE_URL` with PostgreSQL URL format (`postgres://...`) is also supported.

Examples:

```bash
# Linux / WSL
export ConnectionStrings__DefaultConnection="Host=...;Port=5432;Database=...;Username=...;Password=...;Ssl Mode=Require;Trust Server Certificate=true"
```

```powershell
# Windows PowerShell
$env:ConnectionStrings__DefaultConnection = "Host=...;Port=5432;Database=...;Username=...;Password=...;Ssl Mode=Require;Trust Server Certificate=true"
```

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

Frontend (Owner web app):

- Login/register + session guards
- Route-based owner panel with shared shell (sidebar + topbar)
- Dedicated pages for operations: `/services`, `/barbers`, `/customers`, `/schedule`
- Dashboard overview at `/dashboard` and legacy `/admin` redirected to dashboard
- Barbershop view/update flow and owner onboarding without initial barbershop
- Loading UX standardized (`LoadingIndicator` + `LoadingButton`)
- Schedule UX connected to backend (day/week/month range, drag/drop reschedule, status actions)
- Schedule conflict validation per barber (same slot allowed for different barbers)
- Customer suggestions shown only after typing and receiving API matches
- Defensive datetime parsing for timezone-less API values (treated as UTC in UI)
- Visual unification for operations modules using reusable role-based workspace shell
- Dedicated payments workspace at `/payments` with role-based navigation
- Centralized Spanish UI copy expanded (`texts.es.json`) across dashboard/admin/operations/schedule
- Services module supports image upload to Supabase Storage through server route

Recent backend/API updates:

- Services contracts and endpoints now support optional `imageUrl`
- Startup check to ensure `services.image_url` column exists in database
- Customers create/update now normalize and validate 10-digit phone numbers
- Protected web proxy handles no-body statuses (`204/205/304`) safely

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

- Add frontend integration/regression tests for owner panel critical flows (operations + schedule + payments)
- Add advanced filtering/search UX for large datasets (services/barbers/customers/appointments)
- Normalize API appointment datetime responses with explicit timezone offset/UTC suffix
- Replace remaining ad-hoc confirmations with consistent dialog patterns
- Harden observability/logging around storage uploads and scheduling mutations
- Define multi-branch owner model (multiple barbershops per owner) as next architecture increment
