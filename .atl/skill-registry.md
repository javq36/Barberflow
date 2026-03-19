# Skill Registry — BarberFlow

Generated: 2026-03-18

## Project Conventions

| File | Purpose |
|------|---------|
| `.github/AGENTS.md` | Agent index — defines 3 specialized agents and shared practices |
| `.github/agents/react-frontend-architect.agent.md` | React/Next.js frontend architect agent |
| `.github/agents/dotnet-backend-architect.agent.md` | .NET backend architect agent |

## User Skills

### Frontend

| Skill | Trigger |
|-------|---------|
| `nextjs-15` | Working with Next.js routing, Server Actions, data fetching |
| `react-19` | Writing React components — no useMemo/useCallback needed |
| `tailwind-4` | Styling with Tailwind — cn(), theme variables |
| `typescript` | Writing TypeScript — types, interfaces, generics |
| `zustand-5` | Managing React state with Zustand *(project uses RTK — use for reference only)* |

### Backend / API

| Skill | Trigger |
|-------|---------|
| *(no dedicated .NET skill — use `.NET Backend Architect` agent)* | |

### Testing

| Skill | Trigger |
|-------|---------|
| `playwright` | Writing E2E tests — Page Objects, selectors |
| `pytest` | Writing Python tests |

### AI / API

| Skill | Trigger |
|-------|---------|
| `ai-sdk-5` | Building AI chat features with Vercel AI SDK 5 |
| `claude-api` | Using Claude API or Anthropic SDK |

### SDD Workflow

| Skill | Trigger |
|-------|---------|
| `sdd-explore` | Explore and investigate ideas before committing |
| `sdd-propose` | Create a change proposal |
| `sdd-spec` | Write specifications with scenarios |
| `sdd-design` | Create technical design document |
| `sdd-tasks` | Break down a change into tasks |
| `sdd-apply` | Implement tasks from the change |
| `sdd-verify` | Validate implementation against specs |
| `sdd-archive` | Sync delta specs and archive completed change |

### Utilities

| Skill | Trigger |
|-------|---------|
| `pr-review` | Review GitHub PRs and issues |
| `skill-creator` | Create new agent skills |
| `skill-registry` | Update this registry |
| `technical-review` | Review technical exercises or candidate submissions |
