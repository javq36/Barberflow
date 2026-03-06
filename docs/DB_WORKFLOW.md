# Database Workflow (Day 3 - Official)

This project uses a SQL-first database workflow with Supabase migrations as the source of truth.

## Decision

- Source of truth for schema: `supabase/migrations/*.sql`
- Runtime data access: EF Core (`BarberFlowDbContext`) mapped to the same schema
- EF Core migrations: not used for schema deployment in this phase

Why this decision for MVP:

- Supabase tooling is already in place
- SQL migration history is explicit and easy to review
- Keeps deployment simple while the domain model is still evolving

## Current Paths

- SQL migrations: `supabase/migrations/`
- EF Core context: `src/BarberFlow.Infrastructure/BarberFlowDbContext.cs`
- DB readiness endpoint: `GET /health/ready`

## Local Development Workflow

1. Create or edit a SQL migration in `supabase/migrations/`.
2. Apply migration to local/dev Supabase environment.
3. Align EF Core mappings in `BarberFlowDbContext` if schema changed.
4. Run `dotnet build BarberFlow.sln`.
5. Run API and verify `GET /health/ready`.

## Rules

- Do not commit real DB credentials.
- Keep `ConnectionStrings:DefaultConnection` in user-secrets/environment.
- Update SQL and EF mappings together to avoid drift.

## Later Evolution (post-MVP)

Possible options:

- Continue SQL-first (recommended if Supabase stays primary)
- Or migrate to EF migrations if team workflow requires C#-first schema evolution

For now: SQL-first remains official.
