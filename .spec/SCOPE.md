# Project Scope — Agent Dev Pipeline

**Scope status:** Approved
**Approved on:** 2026-08-03
**Gathering date:** 2026-08-02
**Scope owner:** Tiago Tardelli

> While the status is not `Approved` and every required field is not filled in, development must not start.

> **Placement.** Settled by Q-001 and Q-002: this repository is the tool and
> nothing else. Portal Proauto stays in its own repository and becomes one of
> this tool's consumers.

---

## 1. Identification

- **Project name:** Agent Dev Pipeline (`agent-dev-pipeline`)
- **Goal in one sentence:** A local, zero-dependency engine — a command line and an exit code — that drives a project through the PRD → RFC → TDD → code → test → audit chain with mechanical gates, deriving every verdict directly from the specification files so the verdict can never disagree with the repository.
- **Problem/pain point it solves:** Documentation written alongside AI-assisted development goes stale within days, and nobody notices until someone asks "does this still work the way it is written?". Existing spec-driven tools generate documents but never prove the code still matches them, and existing agent tooling keeps its own state store, so the tracker and the repository drift apart independently. Meanwhile, driving several agent sessions from a chat window burns tokens re-reading context that a file could have held. Agent Dev Pipeline answers all three with one rule: **the specification files are the only state, and every status is an exit code.**

## 2. Users

- **Primary users:**
  - **Captain** (developer / tech lead, `Tiago Tardelli`): writes or approves the PRD/RFC/TDD, reads the gate verdicts from the terminal, and decides what runs in parallel.
  - **Orchestrator agent** (the AI session the captain talks to): reads gate state and audit output, writes documents, plans execution lanes, and dispatches workers. Never reads worker transcripts.
  - **Worker agents** (headless sessions, one per card): implement a single task inside an isolated git worktree with a fresh context, commit, and report back a short summary.
  - **CI / automation:** runs the engine headless (`audit --ci`) and consumes the exit code.
- **Access profiles:** Single-tenant, single-machine. The tool opens no socket and listens on nothing; whoever can run the command already has a shell, so the operating system's own permissions are the entire boundary. Nothing is exposed to a network by design or by accident.

## 3. Features

- **MVP (prioritized):**
  - [x] agent-dev-pipeline — the whole engine; the items below are its own delivery breakdown, not separate features
  - [ ] `init` command that scaffolds `.spec/` and installs the agent skill, never overwriting what is already there.
  - [ ] Document chain with templates and per-document ID ownership: `PRD.md` owns US-xxx / AC-xxx, `RFC.md` owns ASM-xxx / Q-xxx, `TDD.md` owns T-xxx.
  - [ ] Six mechanical gates (G0 scope → G5 audit), each a distinct exit code with a human-readable reason.
  - [ ] `verify` that actually executes the project's test command and extracts per-test results, granting proof only on PASS (a skipped test is never proof).
  - [ ] `audit` that executes the constitution's `verification(forbidden|required)` regexes against their globs, in a sandboxed subprocess with a timeout.
  - [ ] Drift detection: acceptance criterion without test, test pointing at a criterion that no longer exists, task marked done without proof, source file no task maps to.
  - [ ] "Back to the AI" output: for any red gate, `adp prompt` produces a ready-to-paste prompt naming the exact finding.
  - [ ] Background execution: file-disjoint tasks run in parallel, each in its own git worktree, branch and fresh headless session; per-card live status.
- **Nice-to-have (post-MVP):** GitHub adapter (issue per task, PR per lane) behind an explicit delivery mode; lessons-learned layer with mechanical backing; multi-project reporting; per-task cost/token reporting; a read-only board rendered from `audit --json`, needing no server.

## 4. Out of scope

- **GitHub as a dependency.** The full loop — specify, implement, test, prove — must close with no network and no remote. GitHub is an optional delivery mode, never a requirement.
- **Authentication, multi-user, or hosting.** A single-operator local tool. It is not a SaaS and will not grow session management, roles, or tenancy.
- **Replacing the agent harness.** Agent Dev Pipeline dispatches whatever headless CLI is configured; it does not implement model calls, prompting frameworks, or its own agent runtime.
- **Being a general project-management tool.** Tasks live in `TDD.md` and carry mechanical proof. There will be no free-form cards, sprints, estimates, or burndown charts.
- **Computing business rules of any host project.** The engine never interprets the domain it serves.

## 5. Technology

- **Engine and server:** Node.js ≥ 20, ESM, **zero runtime dependencies**. Everything ships in the repository; installation is copying a folder.
- **User interface:** One self-contained HTML file (inline CSS and JS, no build step, no framework, no CDN). Vendored assets only if unavoidable and license-recorded.
- **Transport:** stdout and an exit code for every command. The monitor adds a loopback HTTP page that is read-only and reaches nothing beyond the machine it runs on.
- **Persistence:** Markdown and JSON on disk under `.spec/`. Execution telemetry (event ledger and worker streams) lives **outside** the host repository, under a configurable state directory.
- **Deployment:** `npx`, a global install, or a copied folder. Anywhere Node ≥ 20 runs — zero dependencies means there is nothing else to provision.
- **External integrations:** the configured agent CLI in headless mode (`claude -p` or equivalent); `git` for worktrees; optionally `gh` for the GitHub delivery mode.
- **Authentication and authorization:** none at the application layer; loopback bind is the security boundary.

## 6. Data and security

- **Sensitive data:** The engine reads whatever the host repository contains and prints it to the terminal. It stores no credentials of its own. Worker output streams may contain source code and must be treated with the same confidentiality as the repository itself.
- **Access restrictions:** Default bind `127.0.0.1`. Binding to any other interface requires an explicit configuration change and is documented as removing the only security boundary. The engine never transmits repository content anywhere; the only outbound process calls are the configured agent CLI and, in GitHub mode, `gh`.
- **Constitution enforcement:** regexes declared in `CONSTITUTION.md` are supplied by the project and executed by the engine. They run in a disposable subprocess with a hard timeout so a pathological pattern degrades into an audit finding instead of hanging the gate.
- **LGPD:** the tool processes no personal data of its own. Host projects that do (such as Portal Proauto) declare it in their own constitution, and the engine's job is to execute those declarations, not to define them.

## 7. Operations

- **Deploy environment:** wherever the developer works. The tool is a command, not a service.
- **Expected initial volume:** One repository, single operator, up to a few dozen tasks per feature and up to `maxParallel` (default 3) concurrent worker sessions.
- **Deadlines:** None fixed.
- **Milestones (incremental, each testable by the user before moving on):**
  1. **M1 — Engine core:** parsers plus `audit` over the document chain, running from the command line. Testable: point it at a project and read the findings.
  2. **M2 — Real proof:** `verify` executes the project's test command and grants proof per acceptance criterion; `audit --ci` consumes it. Testable: break a test and watch the gate turn red.
  3. **M3 — Executable constitution:** `verification(forbidden|required|test)` are executed against their globs. Testable: plant a forbidden pattern and watch `PRINCIPLE_VIOLATED` appear.
  4. **M4 and M5 — removed.** They were the monitor: a server, a projected kanban and a document editor. See RFC D-011. The milestone numbers are not reused.
  6. **M6 — Background execution:** the execution plan builds file-disjoint lanes and dispatches headless workers into git worktrees, reporting per-task status to the terminal. Testable: run two independent tasks at once and watch both progress.
  7. **M7 — removed.** It was the container. Docker left the plan with D-013: the tool has zero dependencies and runs anywhere Node does, so a container was isolating the page from a project it can no longer touch.
  8. **M8 — Skill and templates:** the agent skill plus document templates ship with the tool and `init` installs them. Testable: bootstrap an empty folder and reach a green G0 with no manual file creation.

## 8. Acceptance criteria

- A project can go from empty folder to a proven, audited feature without any network access and without a GitHub account.
- No task can be reported as done while the engine reports its acceptance criteria unproven — the audit refuses it, and the refusal is an exit code.
- Every gate reports a verdict as a process exit code, and every red gate carries a reason a non-expert can read plus a prompt they can paste back to the AI.
- The constitution's declared verifications are executed, not merely declared — a `[MUST]` principle without executable verification is itself a finding.
- Changing code without re-running proof is detected and reported, so documentation that has gone stale cannot be mistaken for current.
- Tasks that touch disjoint files can run concurrently in isolated worktrees, and a failed lane can be re-run alone without disturbing work that already passed.
- Detailed acceptance criteria are elaborated in `PRD.md`; the path chosen among alternatives is recorded in `RFC.md`; the implementation breakdown lives in `TDD.md`.

## 9. GitHub

- **Repository:** to be defined. The tool is developed inside `Projeto_Agent`; whether it gets its own repository is **Q-002** in `RFC.md`.
- **Visibility:** private, matching the host organization's default.
- **Tracking Project:** not used for MVP. `TDD.md` plus the audit is the tracker — the tool tracks itself (dogfooding).
- **Milestones:** M1–M8 as listed in section 7.

## 10. Open scope items

- [x] **Q-001** — Which scope does the repository root own: the tool or Portal Proauto? — the tool, and nothing else; Portal Proauto becomes a consumer. Answered in RFC Q-001.
- [x] **Q-002** — Does Agent Dev Pipeline get its own repository, or stay a folder inside `Projeto_Agent`? — its own: `Codryx-Tec/agent-dev-pipeline`.
- [x] **Q-003** — Is `agent-dev-pipeline` the final name? — yes, published as `@codryx/agent-dev-pipeline`.
- [x] To confirm: whether the existing eight sub-agents in `.claude/agents/` map onto pipeline roles, or whether the executor introduces its own worker roles. — neither. Those agents stayed behind in `Projeto_Agent` when the tool was extracted (Q-002); the executor invokes one configured CLI and takes its division of labour from the task graph. Recorded as ASM-007, invalidated.
- [ ] To confirm: retention policy for worker output streams (how many runs are kept before pruning).
