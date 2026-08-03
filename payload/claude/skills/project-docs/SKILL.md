---
name: project-docs
description: Templates and rules for README.md, docs/DEPLOYMENT.md, docs/USAGE.md, and turning recurring commands into Makefile targets and git hooks. Use when creating or updating the README, writing/updating deployment or usage documentation, or when a command has been run more than once and should become a tracked target or hook.
---

# Project docs, commands, and hooks

`.spec/` holds the project's *process* memory (scope, stack, changelog, troubleshooting) — internal, for the agents. `docs/` and `README.md` hold the project's *product* documentation — external, for a human installing, deploying, or using the system. Keep them separate; don't duplicate content, link between them instead.

## When to use

- Creating or refreshing `README.md`.
- A feature changes install steps, environment variables, deploy process, or end-user workflow → update `docs/DEPLOYMENT.md` and/or `docs/USAGE.md`.
- A bash command has been run more than once during development (build, migrate, seed, deploy, backup) → turn it into a `Makefile` target, then decide if it also needs a git hook.

## README.md

The entry point. Keep it short — link out to `.spec/` and `docs/` for depth instead of duplicating them.

```md
# <Project name>

<One-sentence goal, from .spec/SCOPE.md>

## Quick start

\`\`\`bash
<clone, install deps, copy .env, run migrations, start dev server>
\`\`\`

## Stack

See `.spec/STACK.md`.

## Available commands

| Command | What it does |
| ------- | ------------ |
| `make run-backend` | Starts the backend dev server |
| `make run-frontend` | Starts the frontend dev server |
| `make test-backend` | Runs the backend test suite |
| `make test-frontend` | Runs the frontend test suite |
| ... | Mirror every Makefile target here — this table is the discoverability layer |

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [Usage guide](docs/USAGE.md)
- [Project scope](.spec/SCOPE.md)

## Contributing

See `AGENTS.md` for the development flow (issue → branch → PR → CI).
```

Update it whenever: a new top-level command is added, the quick-start steps change, or the stack changes. Owner: **techlead**, at each milestone close.

## docs/DEPLOYMENT.md

Production install/deploy manual — written for whoever has to stand this up on a server, not for an AI agent.

```md
# Deployment Guide

## Prerequisites
- <runtime versions, external services, accounts needed>

## Environment variables
| Variable | Required | Description |
| -------- | -------- | ------------ |
| `DATABASE_URL` | Yes | ... |

## Build
\`\`\`bash
<exact build commands>
\`\`\`

## Deploy
\`\`\`bash
<exact deploy commands / CI trigger / manual steps>
\`\`\`

## Migrations
\`\`\`bash
<exact migration command, and how to roll back>
\`\`\`

## Health check
How to confirm the deploy succeeded (endpoint, expected response).

## Rollback
Exact steps to revert to the previous version if something breaks.
```

Owner: **architect** drafts it when the deploy architecture is defined; **techlead** keeps it current after every deploy-relevant change.

## docs/USAGE.md

End-user–facing manual — how to actually use the running system, not how to develop it.

```md
# Usage Guide

## Accessing the system
<URL, login flow>

## Roles and permissions
| Role | Can do |
| ---- | ------ |
| ... | ... |

## Common workflows
### <Workflow name>
1. Step
2. Step

## Troubleshooting (end-user)
| Symptom | Likely cause | What to do |
| ------- | ------------ | ---------- |
```

This is not the same file as `.spec/TROUBLESHOOTING.md` — that one is for developers debugging the codebase; this one is for end users hitting expected error states. Owner: **designer** drafts the workflows section from the approved UX; **techlead** keeps it current.

## Commands, Makefile targets, and git hooks

Rule: a command run more than once during development stops being a one-off and becomes a tracked target.

1. **Check for a `Makefile` at the root.** If it doesn't exist, create a minimal one.
2. **Add the command as a target** (e.g. `make test-backend`, `make deploy-staging`). Never leave a recurring command as an ad-hoc shell line in a PR description or a chat message — the next agent or human should not have to rediscover it.
3. **Mirror the target in `README.md`'s "Available commands" table** — a target nobody can find is as good as not existing.
4. **Decide if it needs a git hook.** A command becomes a hook candidate when skipping it is a real risk (e.g. committing with failing lint, pushing with a red `audit.js`) — not for every target.
   - Hooks live in `.githooks/` (not `.git/hooks/`, which isn't version-controlled): `.githooks/pre-commit`, `.githooks/pre-push`.
   - One-time setup, documented in `README.md`'s Quick Start: `git config core.hooksPath .githooks`.
   - Suggested defaults:
     ```bash
     # .githooks/pre-commit
     #!/bin/sh
     make lint-backend && make lint-frontend

     # .githooks/pre-push
     #!/bin/sh
     node scripts/verify.js && node scripts/audit.js
     ```
   - Keep hooks fast (seconds, not minutes) — a slow hook gets `--no-verify`'d out of habit, which defeats the point. Push the full/slow suite to CI instead.

Don't create a hook nobody asked for; don't wrap something in a Makefile target that's genuinely a one-off. Same YAGNI bar as everything else in `AGENTS.md`.
