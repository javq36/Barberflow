# BarberFlow Custom Agents

This workspace defines two specialized agents:

- React Frontend Architect: [.github/agents/react-frontend-architect.agent.md](.github/agents/react-frontend-architect.agent.md)
- .NET Backend Architect: [.github/agents/dotnet-backend-architect.agent.md](.github/agents/dotnet-backend-architect.agent.md)

## Why This v2 Exists

This setup follows common AGENTS.md patterns used in mature repositories:

- Clear guardrails and red lines
- Explicit setup and validation commands
- Task checklists and output contracts
- Concise, high-signal communication defaults

## When To Use Each Agent

- Use React Frontend Architect for Next.js App Router, components, UI architecture, Redux Toolkit, RTK Query, performance, and accessibility.
- Use .NET Backend Architect for ASP.NET Core APIs, clean layering, contracts, domain rules, EF Core, and backend robustness.

## Repo-First Commands

- Full local stack: `npm run dev`
- API only in watch mode: `npm run dev:api`
- Frontend only: `npm run dev:web`
- Solution build: `dotnet build BarberFlow.sln`
- Frontend lint: run `npm run lint` inside `src/barberflow-web`

## Shared Best Practices

- Prefer minimal, localized changes over broad refactors.
- Keep architecture boundaries explicit and enforceable.
- Prioritize readability, typed contracts, and predictable behavior.
- Run targeted validation for changed areas before broad checks.
- For reviews, report findings first by severity with file/line references.

## Token Consumption Policy

- Search first, then read only directly relevant files.
- Keep plans short and update only when scope changes.
- Avoid long file dumps; use concise summaries and exact file references.
- Return compact implementation notes and concrete outcomes.

## Team Usage Pattern

1. Start in the specialist agent that matches the layer you are changing.
2. Provide constraints in the first prompt: scope, files, and acceptance criteria.
3. Ask for review mode when you want bug/risk-focused findings instead of implementation.
4. Keep prompts scoped to avoid unnecessary context and token usage.
