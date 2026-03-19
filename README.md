# BarberFlow

BarberFlow is a SaaS platform to manage barbershop operations end-to-end: authentication, barbershop onboarding, services, barbers, customers, scheduling, and payments-ready admin flows.

The current product focus is the owner web application, backed by a secure .NET API and PostgreSQL/Supabase persistence.

## Architecture Overview

BarberFlow follows a modular monorepo with clear backend/frontend boundaries:

- Backend API: authentication, business rules, authorization, and data access.
- Frontend web app: owner dashboard UX, protected routes, and API consumption.
- Database layer: SQL-first migrations in Supabase as source of truth.

High-level flow:

1. User logs in via web app.
2. API returns JWT.
3. Web stores JWT in HttpOnly cookie and calls protected proxy routes.
4. Proxy forwards authorized requests to backend endpoints.
5. Backend validates token, applies domain rules, and executes SQL operations.

## Tech Stack

- Backend: ASP.NET Core Minimal APIs (.NET 9)
- Data access: Npgsql + EF Core mapping support
- Database: PostgreSQL (Supabase)
- Frontend: Next.js 16 App Router + React 19 + Tailwind 4 + shadcn/ui
- State management: Redux Toolkit + RTK Query
- Security: JWT bearer auth, HttpOnly cookie session flow, CORS, rate limiting
- Docs/observability: Swagger (dev), health checks, global exception handling

## Solution Structure

```text
BarberFlow.sln
package.json
src/
  BarberFlow.API/            # Minimal API endpoints and platform config
  BarberFlow.Application/    # Application layer (expanding)
  BarberFlow.Domain/         # Entities/enums and core domain concepts
  BarberFlow.Infrastructure/ # EF Core DbContext and persistence mapping
  barberflow-web/            # Next.js owner application
supabase/
  migrations/                # SQL-first schema evolution
docs/
  DB_WORKFLOW.md
```

## Backend Architecture (.NET)

The backend is implemented as Minimal APIs grouped by business module:

- Auth endpoints: owner registration/login, token-based identity checks.
- Barbershops, services, barbers, customers endpoints: owner-scoped CRUD.
- Appointments endpoints: scheduling, status transitions, rescheduling.
- Availability endpoint: slot computation for booking UX.

### Runtime pipeline and platform concerns

Core platform concerns are centralized in `Program.cs`:

- Strict JWT configuration validation at startup.
- Connection string resolution with fallback support for `DATABASE_URL`.
- CORS policy for local frontend origins and configurable allowed origins.
- Auth-sensitive rate limiting (anti-bruteforce for login/register).
- Global exception and status code JSON responses (consistent error shape).
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.).
- Health checks endpoint for readiness monitoring.

### Data access approach

The current implementation combines:

- Direct Npgsql SQL commands in endpoint handlers (explicit control over queries).
- EF Core `BarberFlowDbContext` as runtime mapping layer aligned to SQL schema.

This hybrid approach keeps endpoint behavior explicit while preserving model consistency and enabling progressive evolution toward richer Application/Infrastructure patterns.

## Frontend Architecture (Next.js)

The owner app uses App Router with role-focused workspaces and shared UI primitives.

### Web structure and navigation

- Protected areas: `/dashboard`, `/admin`, operations modules.
- Operations modules: `/services`, `/barbers`, `/customers`, `/schedule`, `/payments`.
- Shared workspace shell for consistent sidebar/topbar behavior.

### Auth and API boundary (BFF-style proxy)

Frontend enforces session and API boundaries through:

- Route protection middleware-like proxy logic for auth pages and owner pages.
- Protected API proxy route (`/api/protected/[...path]`) that:
  - reads HttpOnly cookie token,
  - validates expiration before forwarding,
  - forwards safe request headers,
  - safely handles no-body upstream responses (`204/205/304`).

This avoids exposing raw access tokens to client-side JavaScript and keeps backend auth semantics centralized.

### State and data-fetching patterns

- Redux Toolkit store composition for shared app state.
- RTK Query for backend communication and cache consistency.
- Reusable loading and workspace components to standardize UX and reduce duplication.
- Centralized Spanish text catalog to keep UI copy maintainable.

## Good Practices Applied

The project already applies several production-oriented engineering practices:

- Security by default:
  - JWT key strength validation.
  - Rate limiting on auth-sensitive endpoints.
  - HttpOnly cookie session flow in web app.
  - Defensive response headers and strict CORS setup.
- Input hardening:
  - endpoint-level validation for names, emails, passwords, phone normalization.
  - owner-only access checks for restricted operations.
- Reliability and operability:
  - health checks and standardized JSON error responses.
  - startup compatibility check for `services.image_url` migration gap.
- Data governance:
  - SQL-first migration workflow as source of truth.
  - soft-delete semantics (`active`) for barbers/customers.
- Frontend maintainability:
  - role-based shared shell and modular pages.
  - centralized localized content.
  - consistent loading and protected-routing behavior.

## Recent Changes Included

Latest implemented changes reflected in this README:

- Services now support optional `imageUrl` and image uploads to Supabase Storage.
- API startup ensures `services.image_url` exists when possible.
- Customer create/update normalizes and validates 10-digit phone numbers.
- Protected proxy now safely handles no-body HTTP statuses (`204/205/304`).
- Owner panel remains consolidated with dashboard, operations modules, and payments workspace.

## Local Setup

### Prerequisites

- .NET SDK 9
- Node.js + npm
- Git

### 1) Configure backend environment

1. Copy `env/backend.example` to `.env.backend` in repository root.
2. Set one of the following:
   - `ConnectionStrings__DefaultConnection` (Npgsql format), or
   - `DATABASE_URL` (PostgreSQL URL format).

Notes:

- `src/BarberFlow.API/appsettings.json` intentionally uses a placeholder connection string.
- Do not commit real credentials.

### 2) Configure JWT settings

Set these keys in development configuration/environment:

- `Jwt:Issuer`
- `Jwt:Audience`
- `Jwt:Key`
- `Jwt:ExpirationMinutes`

Use a strong secret (minimum 32 bytes of entropy).

### 3) Run project

From repository root:

```bash
dotnet restore
dotnet build BarberFlow.sln
npm run dev
```

This starts:

- API: `https://localhost:7095` (and `http://localhost:5164`)
- Web: `http://localhost:3000`

Useful alternatives:

- API only (watch): `npm run dev:api`
- Web only: `npm run dev:web`

Swagger (development):

- `http://localhost:5164/swagger`

Important local rule:

- Do not run `npm run dev` and another manual API watcher simultaneously, or ports can conflict.

## Database Workflow

- Strategy: SQL-first with Supabase migrations.
- Source of truth: `supabase/migrations/*.sql`.
- EF Core is used as runtime mapping/alignment layer.

Detailed process:

- `docs/DB_WORKFLOW.md`

## Git Branch Strategy

- `main`: production-ready baseline.
- `stage`: validated and tested integration baseline.
- `dev`: active integration branch.
- Feature/task branches: from `stage` (for example `BBF-01`, `BBF-02`).

## Next MVP Focus

- Add integration/regression tests for critical owner flows.
- Improve filtering/search for larger datasets.
- Normalize appointment datetime responses with explicit timezone/UTC format.
- Replace ad-hoc confirmations with consistent dialog patterns.
- Improve observability around uploads and scheduling mutations.
- Define multi-branch owner model as next architecture increment.
