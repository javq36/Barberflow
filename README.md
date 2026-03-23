# BarberFlow

BarberFlow is a SaaS platform to manage barbershop operations end-to-end: authentication, barbershop onboarding, services, barbers, customers, scheduling, and payments-ready admin flows — plus WhatsApp-based customer notifications.

The current product focus is the owner web application backed by a secure .NET API and PostgreSQL/Supabase persistence, combined with a public-facing appointment booking experience and automated WhatsApp messaging for customers.

## Architecture Overview

BarberFlow follows a modular monorepo with clear backend/frontend boundaries:

- Backend API: authentication, business rules, authorization, data access, and background services.
- Frontend web app: owner dashboard UX, public booking wizard, protected routes, and API consumption.
- Database layer: SQL-first migrations in Supabase as source of truth.
- WhatsApp layer: Twilio-backed outbound messaging with outbox pattern for reliable delivery.

High-level flow:

1. User logs in via web app.
2. API returns JWT.
3. Web stores JWT in HttpOnly cookie and calls protected proxy routes.
4. Proxy forwards authorized requests to backend endpoints.
5. Backend validates token, applies domain rules, and executes SQL operations.
6. Background services send WhatsApp notifications (confirmations, reminders, cancellations).

## Tech Stack

- Backend: ASP.NET Core Minimal APIs (.NET 9)
- Data access: Npgsql raw SQL + EF Core mapping support
- Database: PostgreSQL (Supabase)
- Frontend: Next.js 16 App Router + React 19 + Tailwind CSS 4 + shadcn/ui
- State management: Redux Toolkit + RTK Query
- Security: JWT bearer auth, HttpOnly cookie session flow, CORS, rate limiting
- WhatsApp: Twilio SDK (sandbox + production)
- Testing: Playwright (E2E)
- Docs/observability: Swagger (dev), health checks, global exception handling

## Solution Structure

```text
BarberFlow.sln
package.json
src/
  BarberFlow.API/            # Minimal API endpoints and platform config
  BarberFlow.Application/    # Application layer (interfaces, services, helpers)
  BarberFlow.Domain/         # Entities/enums and core domain concepts
  BarberFlow.Infrastructure/ # EF Core DbContext, persistence mapping, WhatsApp
    WhatsApp/
      TwilioWhatsAppService.cs       # Twilio SDK integration (sandbox + prod)
      OutboxProcessorService.cs      # BackgroundService — drains outbox
      AppointmentReminderService.cs  # BackgroundService — 24h reminders
      WhatsAppOutboxService.cs       # Writes messages to outbox table
      TwilioSettings.cs              # Twilio config binding
  barberflow-web/            # Next.js owner + public booking application
supabase/
  migrations/                # SQL-first schema evolution
  seed.sql                   # Dev seed data (demo barbershop + test users)
docs/
  DB_WORKFLOW.md
```

## Appointment Booking System

### Public Booking Flow

Customers can book appointments without creating an account through a 5-step wizard accessible via a barbershop's public slug URL:

```
/book/{barbershop-slug}
```

Steps:
1. **Service** — select the desired service.
2. **Barber** — choose a barber (or any available).
3. **Date** — pick a day from the calendar.
4. **Time** — select from available slots computed in real time.
5. **Contact** — enter name, phone (with country selector, default 🇨🇴 Colombia), and WhatsApp opt-in.

On confirmation, the customer receives a WhatsApp message if they opted in.

### Multi-Tenancy

Every barbershop is isolated via `barbershop_id`. Public booking routes use a human-readable `slug` to identify the shop without exposing internal IDs.

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
- Background services registered: `OutboxProcessorService`, `AppointmentReminderService`.

### Data access approach

The current implementation combines:

- Direct Npgsql SQL commands in endpoint handlers (explicit control over queries).
- EF Core `BarberFlowDbContext` as runtime mapping layer aligned to SQL schema.

This hybrid approach keeps endpoint behavior explicit while preserving model consistency and enabling progressive evolution toward richer Application/Infrastructure patterns.

## Frontend Architecture (Next.js)

The app serves two audiences: the barbershop owner (protected) and customers (public booking).

### Web structure and navigation

- Public areas: `/book/{slug}` — 5-step booking wizard (unauthenticated).
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
- International phone input with country flag selector (default Colombia 🇨🇴).

## WhatsApp Integration (Phase 1 — Outbound)

BarberFlow sends automated WhatsApp messages to customers who opt in at booking time.

### Notification Types

| Event | Message Sent |
|---|---|
| Appointment booked | Confirmation with date, time, barber, and service |
| 24 hours before | Reminder with appointment details |
| Appointment cancelled | Cancellation notice |

### Architecture

```
Booking endpoint
  └─ writes → whatsapp_outbox table
       └─ OutboxProcessorService (BackgroundService)
              └─ TwilioWhatsAppService
                     └─ Twilio API (WhatsApp)
```

```
AppointmentReminderService (BackgroundService)
  └─ polls → appointments where start_at ≈ now + 24h
       └─ writes → whatsapp_outbox table
            └─ OutboxProcessorService → Twilio API
```

**Key design decisions:**

- **Outbox pattern**: messages are written to `whatsapp_outbox` before being sent, guaranteeing at-least-once delivery even if Twilio is temporarily unavailable.
- **Exponential backoff**: failed sends are retried with increasing delays.
- **E.164 normalization**: `PhoneNormalizer` auto-prepends `+57` for 10-digit Colombian numbers.
- **Sandbox support**: `TwilioSettings.UseSandbox` flag switches between sandbox and production sender.
- **Layer boundary**: `IWhatsAppService` is defined in the Application layer; `TwilioWhatsAppService` lives in Infrastructure — Twilio is an implementation detail.

### Application Layer Interfaces

```csharp
// BarberFlow.Application/Services/IWhatsAppService.cs
public interface IWhatsAppService
{
    Task SendConfirmationAsync(AppointmentDetails appointment);
    Task SendReminderAsync(AppointmentDetails appointment);
    Task SendCancellationAsync(AppointmentDetails appointment);
}

// BarberFlow.Application/Services/IWhatsAppOutboxService.cs
public interface IWhatsAppOutboxService
{
    Task EnqueueAsync(WhatsAppMessage message);
}
```

### Phone Normalization

`PhoneNormalizer` (Application layer) handles E.164 compliance:

- 10-digit number → prepends `+57` (Colombia default)
- Numbers already starting with `+` → passed through unchanged
- Used on customer create/update and at notification send time

### Twilio Sandbox Setup

For local development and testing, use the Twilio WhatsApp Sandbox:

1. [Sign up / log in to Twilio](https://console.twilio.com).
2. Go to **Messaging > Try it out > Send a WhatsApp message**.
3. Follow the sandbox join instructions (send a WhatsApp message to `+1 415 523 8886` with the join code).
4. Set in `.env.backend`:
   ```
   Twilio__AccountSid=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   Twilio__AuthToken=your_auth_token
   Twilio__FromNumber=whatsapp:+14155238886
   Twilio__UseSandbox=true
   ```

For production, set `Twilio__UseSandbox=false` and use your verified Twilio number as `FromNumber`.

## Good Practices Applied

The project already applies several production-oriented engineering practices:

- Security by default:
  - JWT key strength validation.
  - Rate limiting on auth-sensitive endpoints.
  - HttpOnly cookie session flow in web app.
  - Defensive response headers and strict CORS setup.
- Input hardening:
  - Endpoint-level validation for names, emails, passwords, phone normalization.
  - Owner-only access checks for restricted operations.
- Reliability and operability:
  - Health checks and standardized JSON error responses.
  - Startup compatibility check for `services.image_url` migration gap.
  - Outbox pattern for WhatsApp delivery guarantees.
  - Exponential backoff on failed Twilio requests.
- Data governance:
  - SQL-first migration workflow as source of truth.
  - Soft-delete semantics (`active`) for barbers/customers.
- Frontend maintainability:
  - Role-based shared shell and modular pages.
  - Centralized localized content.
  - Consistent loading and protected-routing behavior.

## Recent Changes Included

Latest implemented changes reflected in this README:

- Full 5-step public booking wizard via slug-based URLs (unauthenticated).
- WhatsApp Phase 1: outbound notifications via Twilio (confirmation, 24h reminder, cancellation).
- Outbox pattern (`whatsapp_outbox` table + `OutboxProcessorService` BackgroundService).
- `AppointmentReminderService` BackgroundService for automated 24h reminders.
- `PhoneNormalizer` utility for E.164 compliance (Colombian default `+57`).
- International phone input with country flag selector in booking form (default Colombia).
- Seed data (`supabase/seed.sql`) with demo barbershop, barbers, services, and test users.
- Services now support optional `imageUrl` and image uploads to Supabase Storage.
- Customer create/update normalizes and validates 10-digit phone numbers.
- Protected proxy now safely handles no-body HTTP statuses (`204/205/304`).

## Local Setup

### Prerequisites

- .NET SDK 9
- Node.js + npm
- Git
- (Optional) Twilio account for WhatsApp notifications

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

### 3) Configure Twilio (optional — for WhatsApp)

Add to `.env.backend`:

```
Twilio__AccountSid=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Twilio__AuthToken=your_auth_token
Twilio__FromNumber=whatsapp:+14155238886
Twilio__UseSandbox=true
```

See [Twilio Sandbox Setup](#twilio-sandbox-setup) above for full instructions.

If Twilio is not configured, the app runs normally — WhatsApp notifications are simply skipped.

### 4) Load seed data (development)

Run `supabase/seed.sql` against your local/dev database to create demo data:

```bash
psql $DATABASE_URL -f supabase/seed.sql
```

Seed creates:
- Demo barbershop: **Barbería El Maestro** (`slug: barberia-el-maestro`)
- Owner user + 2 barbers + 3 services (COP pricing)
- Working hours (Mon–Sat 9:00–18:00)
- Booking rules (30-min slots, 60-min advance, 30-day window)
- Test customer with WhatsApp opt-in

### 5) Run project

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

### DEV CREDENTIALS (seed data — DO NOT USE IN PRODUCTION)

> ⚠️ These credentials exist only in seed data for local development.

| Role | Email | Password |
|---|---|---|
| Owner | owner@barberia-el-maestro.com | `Dev123456!` |
| Barber 1 | carlos@barberia-el-maestro.com | `Dev123456!` |
| Barber 2 | miguel@barberia-el-maestro.com | `Dev123456!` |

Test customer phone (WhatsApp opt-in): `3001234567` → normalizes to `+573001234567`

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

## Roadmap

### WhatsApp Integration Roadmap

#### ✅ Phase 1 — Outbound Notifications (COMPLETED)

- Appointment confirmation on booking
- 24h reminder via background service
- Cancellation notification
- Outbox pattern for reliable delivery
- E.164 phone normalization
- International phone input with country flag selector

#### ✅ Phase 2A — AI Booking MVP (COMPLETED)

**Prerequisite**: Twilio paid account + OpenAI API key

Core: Customers can book, check availability, and cancel appointments via WhatsApp using natural language (Spanish).

Architecture: OpenAI GPT-4o-mini with Function Calling pattern — AI interprets natural language and calls BarberFlow functions (`check_availability`, `book_appointment`, etc.). The AI NEVER invents availability — it calls the existing `AvailabilityService` for ground truth.

Components:

- `POST /webhook/whatsapp` — Twilio webhook endpoint with signature validation
- `whatsapp_conversations` table — conversation history + context (JSONB)
- `AiBookingOrchestrator` — OpenAI function calling dispatch loop (max 5 iterations)
- `ConversationService` — load/save conversation history
- `ToolDefinitions` — 6 tools: `get_services`, `get_barbers`, `check_availability`, `book_appointment`, `get_my_appointments`, `cancel_appointment`
- System prompt builder (date/timezone aware, barbershop-scoped)
- Async reply pattern: 200 OK immediate → process in background → reply via outbox
- `SendTextAsync` added to `IWhatsAppService` for direct text replies

Estimated cost: ~$15–17/month for 300 appointments (OpenAI ~$0.40 + Twilio ~$15)

#### ✅ Phase 2B — Audio + UX Polish (COMPLETED)

- Whisper API integration for voice note transcription
- Conversation auto-reset after 30min inactivity
- Rate limiting on webhook endpoint
- Twilio Content Templates with Quick Reply buttons for reminders

#### ✅ Phase 3A — Barber Commands (COMPLETED)

- Barber identification by phone number (lookup in `users` table)
- Separate system prompt for barber role
- `delay_appointment` tool — barber sends "+15" or "voy atrasado 15 min"
- Auto-notify affected customers of delays via outbox
- 10-minute pre-appointment alert for barber
- Daily agenda summary message (morning)

#### 🔲 Phase 3B — Advanced Features (post-validation)

- Multi-service booking in single conversation
- Preferred barber memory across sessions
- Post-appointment feedback collection
- Conversation analytics dashboard

### Other Pending

- Error handling in frontend (proper error feedback to users)
- E2E tests for WhatsApp flows
