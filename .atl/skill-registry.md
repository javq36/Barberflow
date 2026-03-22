# Skill Registry — BarberFlow

Generated: 2026-03-22

## Project Conventions

| File | Purpose |
|------|---------|
| `AGENTS.md` | Code review rules — TypeScript, React, Node.js, General |
| `.github/AGENTS.md` | Agent index — defines 3 specialized agents and shared practices |
| `.github/agents/react-frontend-architect.agent.md` | React/Next.js frontend architect agent |
| `.github/agents/dotnet-backend-architect.agent.md` | .NET backend architect agent |
| `.github/agents/node-backend-architect.agent.md` | Node.js backend architect agent |

## User Skills

### Frontend

| Skill | Path | Trigger |
|-------|------|---------|
| `nextjs-15` | `~/.claude/skills/nextjs-15/SKILL.md` | Working with Next.js routing, Server Actions, data fetching |
| `react-19` | `~/.claude/skills/react-19/SKILL.md` | Writing React components — no useMemo/useCallback needed |
| `tailwind-4` | `~/.claude/skills/tailwind-4/SKILL.md` | Styling with Tailwind — cn(), theme variables |
| `typescript` | `~/.claude/skills/typescript/SKILL.md` | Writing TypeScript — types, interfaces, generics |
| `zustand-5` | `~/.claude/skills/zustand-5/SKILL.md` | Managing React state *(project uses RTK — reference only)* |
| `zod-4` | `~/.claude/skills/zod-4/SKILL.md` | Using Zod for validation — breaking changes from v3 |

### Testing

| Skill | Path | Trigger |
|-------|------|---------|
| `playwright` | `~/.claude/skills/playwright/SKILL.md` | Writing E2E tests — Page Objects, selectors |
| `pytest` | `~/.claude/skills/pytest/SKILL.md` | Writing Python tests |

### AI / API

| Skill | Path | Trigger |
|-------|------|---------|
| `ai-sdk-5` | `~/.claude/skills/ai-sdk-5/SKILL.md` | Building AI chat features with Vercel AI SDK 5 |

### SDD Workflow

| Skill | Path | Trigger |
|-------|------|---------|
| `sdd-explore` | `~/.config/opencode/skills/sdd-explore/SKILL.md` | Explore and investigate ideas before committing |
| `sdd-propose` | `~/.config/opencode/skills/sdd-propose/SKILL.md` | Create a change proposal |
| `sdd-spec` | `~/.config/opencode/skills/sdd-spec/SKILL.md` | Write specifications with scenarios |
| `sdd-design` | `~/.config/opencode/skills/sdd-design/SKILL.md` | Create technical design document |
| `sdd-tasks` | `~/.config/opencode/skills/sdd-tasks/SKILL.md` | Break down a change into tasks |
| `sdd-apply` | `~/.config/opencode/skills/sdd-apply/SKILL.md` | Implement tasks from the change |
| `sdd-verify` | `~/.config/opencode/skills/sdd-verify/SKILL.md` | Validate implementation against specs |
| `sdd-archive` | `~/.config/opencode/skills/sdd-archive/SKILL.md` | Sync delta specs and archive completed change |

### Utilities

| Skill | Path | Trigger |
|-------|------|---------|
| `pr-review` | `~/.claude/skills/pr-review/SKILL.md` | Review GitHub PRs and issues |
| `skill-creator` | `~/.config/opencode/skills/skill-creator/SKILL.md` | Create new agent skills |
| `skill-registry` | `~/.claude/skills/skill-registry/SKILL.md` | Update this registry |
| `technical-review` | `~/.claude/skills/technical-review/SKILL.md` | Review technical exercises or candidate submissions |
| `jira-task` | `~/.claude/skills/jira-task/SKILL.md` | Create Jira tasks/tickets |
| `jira-epic` | `~/.claude/skills/jira-epic/SKILL.md` | Create Jira epics for large features |
