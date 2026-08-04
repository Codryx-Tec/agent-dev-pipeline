# RFC: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: RFC — WHICH path, among the possible ones
> owns: ASM-xxx (assumptions) · Q-xxx (open questions)
> status: rascunho
> gate: G2 — this document is approved when every decision records at least two
> alternatives considered, every assumption carries a status, and no question
> marked blocking remains open.

## Purpose

`PRD.md` fixed *what* Agent Dev Pipeline must do. This document fixes *how we will get
there*, decision by decision, with the roads not taken written down beside the
one we took. A decision recorded without its alternatives is indistinguishable
from a habit, and habits are what nobody can revisit later.

Two upstream sources shape most of these decisions and are named throughout:

- **onp-spec-driven** (Vitor Manoel, MIT) — a spec-anchored engine: markdown
  grammar, traceability from story to criterion to task to test, an audit whose
  verdict is an exit code, a file-conflict planner producing parallel lanes, and
  an event ledger stored outside the host repository.
- **Bridge Commander** (Tony Lampada) — an agent-orchestration harness whose
  control surface is a kanban board: durable at-least-once delivery queues,
  isolated worker worktrees, server-sent updates, and an operating doctrine whose
  central sentence we adopt outright: *board state is the truth, conversation
  memory is a cache*.

---

## Decisions

### D-001 — State is a projection of the documents, never a store

> **Narrowed by D-011.** The board this decision was written about is gone, but
> the rule it establishes governs the whole tool and is the reason there is no
> cache, no database and no state file anywhere: every command re-reads the
> documents. Kept in its original wording because the alternatives are what make
> the choice legible.

**Alternatives considered**

1. *Own board store.* A `board.json` holding cards, columns and ordering, the way
   Bridge Commander does it. Fast to read, trivially orderable, supports cards
   that have no counterpart in the repository.
2. *Projection.* Columns computed on demand from task status in `TDD.md` plus the
   engine's proof and audit state. No card exists that is not a task.
3. *Store with sync.* A board store kept in step with the documents by a
   reconciliation routine running on file change.

**Decision: alternative 2 — projection.**

**Rationale.** The entire product promise is that documentation cannot silently
diverge from reality. A second store is a second truth, and a second truth is
exactly the drift we are selling a cure for. Option 3 does not avoid this; it
merely moves the divergence into a reconciler that will itself have bugs, and it
is the largest of the three to build. Projection also collapses a whole class of
questions — what happens when a card is deleted, when a document is edited outside
the tool, when two people edit at once — into "re-read the files".

**Consequences.** Manual card ordering inside a column is not free; ordering must
derive from something in the document (declaration order) or not exist. Cards
with no task cannot exist, so "an idea I want to remember" needs a task with no
file list, which the planner already routes to the sequential remainder. Every
board read costs a parse of the documents, which bounds how large a feature can
grow before reads need caching — acceptable at the volumes in `SCOPE.md` §7.

### D-002 — Workers are headless subprocesses, not durable terminal sessions

**Alternatives considered**

1. *tmux-backed sessions*, as Bridge Commander does: each orchestrator and worker
   is a long-lived interactive agent session addressable by typing into its tmux
   pane. Durable across server restarts, attachable by a human, supports
   mid-flight conversation with a worker.
2. *Headless subprocesses*, as onp-spec does: each task is one non-interactive
   agent invocation spawned as a child process, with its output captured as a
   stream. No terminal multiplexer anywhere.
3. *No background execution.* The orchestrating session implements everything
   itself, sequentially.

**Decision: alternative 2 — headless subprocesses.**

**Rationale.** tmux is the single heaviest dependency in the Bridge Commander
model and it buys a capability we do not need: mid-flight conversation with a
worker. Our worker contract is one task, one worktree, one commit, one summary —
if it needs a conversation, the task was too big and belongs back in `TDD.md`.
Dropping tmux also removes the platform constraint that would otherwise force
WSL on a Windows workstation, and keeps the container image small for the
on-premise Linux target, which is where this runs. Option 3 was rejected because
it defeats the token-economy goal in US-007: one session doing everything is
precisely the context we are trying not to pay for.

**Consequences.** A worker cannot be asked a follow-up question; it either
succeeds, fails, or times out, and the orchestrator reacts to the result. We lose
the ability to attach a human terminal to a running worker, so worker output
streams must be good enough to diagnose from after the fact. The orchestrator
becomes responsible for supervision that the harness would otherwise provide.

### D-003 — Three documents, each owning a distinct family of codes

**Alternatives considered**

1. *One `spec.md` plus one `tasks.md`*, as onp-spec does. Fewer files, one
   grammar, less to keep consistent.
2. *Three documents — PRD, RFC, TDD — each owning specific codes.* PRD owns
   stories and criteria, RFC owns assumptions and questions, TDD owns tasks.
3. *Three documents that are purely narrative*, with the machine-readable codes
   still centralized in a separate `spec.md`.

**Decision: alternative 2 — three documents with divided ownership.**

**Rationale.** The three-document habit exists because the three questions have
different audiences and different lifetimes: *what and why* changes when the
business changes, *which path* changes when the constraints change, *how* changes
constantly. Splitting them lets each be approved on its own gate. Option 3 was
rejected for the same reason as D-001: a narrative document beside a canonical
one is a second truth that will drift. Dividing code ownership rather than
duplicating it means each code has exactly one definition site, which keeps
duplicate detection meaningful.

**Consequences.** Cross-document references are the normal case, so reference
resolution must be project-global rather than per-file. The gate order becomes
load-bearing: a task cannot reference a criterion that has not been written yet,
so G1 genuinely must precede G3. Migrating a project that already uses
`spec.md`/`tasks.md` needs a documented mapping.

### D-004 — The engine is a port of onp-spec-driven, not a rewrite and not a dependency

**Alternatives considered**

1. *Depend on the published package* and drive it as a black box.
2. *Port the source into this repository* under its MIT terms, with attribution,
   adapting the grammar, the finding catalogue and the language.
3. *Write a new engine from scratch*, keeping only the ideas.

**Decision: alternative 2 — port with attribution.**

**Rationale.** The engine's value is concentrated in details that are expensive to
rediscover: granting proof only on PASS and refusing skips, running
constitution-supplied regexes in a disposable subprocess with a timeout so a
pathological pattern degrades into a finding rather than hanging the gate, using
`process.exitCode` instead of `process.exit()` so large piped output is not
truncated, and refusing to parallelize a task whose file footprint is undeclared.
Each of those is a scar. Option 1 fails because our grammar diverges immediately
at D-003 and our finding catalogue grows codes the upstream does not have. Option
3 pays for those scars a second time. The upstream licence is MIT, so the port is
permitted; attribution is recorded in the repository root and in the ported files.

**Consequences.** We inherit no upstream fixes automatically and must decide
deliberately whether to track changes. The ported code arrives in Portuguese
identifiers and messages while this repository mandates English documentation, so
a naming and localization pass is part of the port rather than an afterthought.
Stable finding codes are the compatibility surface and, per `AGENTS.md`, are never
translated.

### D-005 — The interface is one self-contained HTML file with no build step

> **Superseded by D-011.** The page was removed; this decision is kept for its
> alternatives, not as current policy.

**Alternatives considered**

1. *React plus Vite*, matching the host project's frontend stack.
2. *One self-contained HTML file* — inline CSS and JS, no framework, no CDN, no
   bundler.
3. *Server-rendered HTML* with full page reloads and no client-side state.

**Decision: alternative 2 — self-contained HTML.**

**Rationale.** The zero-dependency promise in `SCOPE.md` §5 is not decoration: it
is what makes installation a folder copy and what keeps the container image
small. A build step means a toolchain, a lockfile, and a version of the tool that
can be broken by an upstream release — for a page whose entire job is a board, six
lights and a document editor. Option 1 would also entangle the tool's stack with
the host project's stack, which is wrong for a tool meant to serve any project.
Option 3 was rejected against AC-025: live updates without a reload are a stated
requirement.

**Consequences.** No component ecosystem, so anything rich — a markdown editor
with syntax highlighting, a diff view — is either hand-written or vendored with its
licence recorded. The single file grows large and needs internal discipline to
stay navigable. Browser support targets current evergreen browsers only.

### D-006 — Live updates use Server-Sent Events

> **Superseded by D-011.** There is nothing to update live; this decision is kept
> for its alternatives, not as current policy.

**Alternatives considered**

1. *Polling* on a short interval.
2. *WebSocket*, full duplex.
3. *Server-Sent Events*, server to client only, over plain HTTP.

**Decision: alternative 3 — Server-Sent Events.**

**Rationale.** The traffic is entirely one-directional: the server observes files
and processes and tells the page. Writes from the page are ordinary HTTP requests
that need a response anyway. SSE reconnects on its own, survives a server restart
without client code, and needs no dependency in Node — a WebSocket implementation
would be the tool's first runtime dependency, spent on duplex we do not use.
Polling was rejected because it either wastes work or feels slow, and because
AC-026 requires the page to *know* it has gone stale, which a polling client
learns late.

**Consequences.** Everything the page sends is a normal request, so write paths and
read paths use different transports and must be reasoned about separately. Some
corporate proxies buffer SSE; the documented fallback is direct loopback access.

### D-007 — Execution telemetry lives outside the host repository

**Alternatives considered**

1. *Inside the repository* under `.spec/`, versioned with the project.
2. *Inside the repository but git-ignored.*
3. *Outside the repository*, in a state directory whose root is configurable, as
   onp-spec does.

**Decision: alternative 3 — outside the repository.**

**Rationale.** Run events and worker output streams are machine-local, high-volume
and worthless to anyone reading the project's history. Option 1 puts churn into
every diff and would make a worker's raw transcript a permanent artifact of the
project. Option 2 avoids the diff noise but still couples telemetry lifetime to a
worktree that lanes create and destroy — telemetry about a lane must outlive the
lane. A configurable root additionally isolates the tool's own test suite from a
developer's real state.

**Consequences.** Pruning becomes the tool's responsibility rather than git's, so
a retention policy is required — raised as Q-005. The engine must tolerate a
corrupt trailing line in an append-only log without failing the read.

### D-008 — GitHub is a delivery mode, never a requirement

**Alternatives considered**

1. *Required*, as `AGENTS.md` currently mandates: every task gets an issue, every
   change a pull request.
2. *Excluded* entirely; the tool never talks to a remote.
3. *A delivery mode chosen per project*, following Bridge Commander's
   `local-only | direct-PR` model, with `local-only` as the default.

**Decision: alternative 3 — delivery mode, defaulting to local-only.**

**Rationale.** AC-018 is explicit that the full loop must close with no network,
and the deployment target is an on-premise server where outbound access is not
guaranteed. Option 1 also makes an external service's rate limits into a blocker
on proving that work is done, which contradicts the product's core promise.
Option 2 discards genuine value for teams that do want issues and pull requests.
Making it a mode keeps the engine's verdict independent of the delivery path,
which is the property that matters.

**Consequences.** `AGENTS.md` rules 2 and 3 currently state the GitHub flow as
unconditional and must be rewritten as mode-conditional — recorded as T-024 in
`TDD.md`. Two delivery paths mean two paths to test.

### D-009 — Six discrete gates rather than a single audit verdict

**Alternatives considered**

1. *One verdict.* The audit passes or fails; the operator reads the findings.
2. *Six gates*, G0 through G5, each a named checkpoint with its own subset of
   findings and its own exit code.

**Decision: alternative 2 — six gates.**

**Rationale.** A single red light for a project whose PRD is not written yet is
technically correct and practically useless: it reports dozens of findings that
are all consequences of not having started. Gates make the findings arrive in the
order the work happens, and they give the tool something honest to report — a
sequence of lights where the first red one is the only one that matters. They
also give US-008 a natural shape: one prompt per gate rather than one prompt for
the world.

**Consequences.** Every finding code must be assigned to exactly one gate, and new
codes must be assigned when introduced or they become invisible. Gates evaluate
in order and later gates report as *blocked* rather than red when an earlier one
fails, so "blocked" is a third state that must be rendered distinctly from red.

### D-010 — The container mounts the repository; it does not contain it

> **Retired by D-013.** Docker left the plan entirely: the container's only job
> was isolating the page from the project, and with a read-only page and a
> zero-dependency tool that isolation is structural. Kept for its reasoning — if
> a container is ever wanted again, mounting rather than containing is still the
> right answer.

**Alternatives considered**

1. *Image contains the project*, built per project.
2. *Image contains only the tool*; the repository, the git configuration and the
   state directory are mounted at run time.

**Decision: alternative 2 — mount the repository.**

**Rationale.** The tool must serve any project, and a per-project image rebuild on
every change is the opposite of a pipeline. Mounting also keeps the image free of
project source, which matters for a private repository.

**Consequences.** The container needs `git` and the configured agent CLI available
inside it, and the mounted repository's ownership must match the container user or
git refuses to operate on it. Worktrees created inside the container appear on the
host, so their paths must be inside the mount. Whether the agent CLI's credentials
are mounted or the CLI runs on the host is unresolved — raised as Q-004, and it is
the highest-risk open item in this document.

### D-011 — The monitor is removed; the terminal and the exit code are the interface

**Supersedes D-005 and D-006**, which chose a self-contained HTML page and
Server-Sent Events. Both decisions remain recorded above: a superseded decision
that is deleted takes its alternatives with it, and the next person to propose a
page deserves to find the reasoning rather than repeat it.

**Alternatives considered**

1. *Build the monitor as specified.* M4 and M5: an HTTP server on loopback, a
   projected kanban, a document editor, live updates over SSE.
2. *Remove it.* The command line and the exit code are the whole interface; the
   container is how the tool reaches a machine that has no Node.
3. *Defer it.* Keep the milestones, the criteria and the tasks in the documents,
   marked as post-MVP.

**Decision: alternative 2 — remove it.**

**Rationale.** The page was the largest remaining body of unbuilt work — eight
tasks, a server, an event stream and a UI — in service of a control surface for a
single operator who is already sitting in a terminal running an AI agent. The
agent reads `adp audit --json`; a human reads `adp status`. Neither needs a
browser, and every hour spent on the page is an hour not spent on `verify`, which
is the thing that actually makes proof real.

Option 3 is the one to argue against hardest, because it looks free. It is not:
unbuilt criteria in the documents are what `AC_SEM_TASK` and `TASK_CONCLUIDA_SEM_PROVA`
exist to complain about, so a deferred milestone keeps a gate permanently red or
teaches the team to ignore a finding. A tool that asks its users to tolerate a
red light will not be believed when it shows one.

**Consequences.** AC-003, AC-013, AC-015, AC-025 and AC-026 are retired, and
US-005 and US-009 with them; AC-014 is restated against the audit because the rule
it carries — done is a verdict, not a word — is the product. `port` and `host`
leave the configuration, because a setting nothing reads is a promise the tool
does not keep. Retired codes are **not** reused, so the numbering carries gaps on
purpose. Whether the board returns later as a read-only renderer over
`audit --json`, needing no server, is left open rather than decided here.

### D-012 — Executing the project's test command requires recorded consent

**Alternatives considered**

1. *Run it.* The config is part of the project; whoever cloned the repository
   chose to. This is what `make`, `npm run` and most task runners do.
2. *Prompt every time.* Show the command and ask before each run.
3. *Trust on first use, bound to the command text*, as direnv does: approve once,
   re-approve whenever the command changes, with the record kept outside the
   repository.

**Decision: alternative 3 — trust on first use, bound to the content.**

**Rationale.** Option 1 makes `adp verify` a remote code execution primitive: clone,
run, and the repository author's command executes with your privileges. That the
category is familiar — a `Makefile` does the same — is not a defence; it is why the
answers are already known. Option 2 is safe and unusable: a prompt on every run is
a prompt nobody reads by the third day, and a confirmation people answer reflexively
is worse than none, because it manufactures a record of consent that was not given.

Binding approval to the command *text* rather than to the project is what makes the
difference. "I agreed to run the test suite" must never decay into "I agree to run
whatever appears in that field later", and that decay is precisely the attack.

**Consequences.** The trust record must live in the state directory (D-007), never
in the repository — a project that can grant itself permission has been granted
nothing. CI clones fresh every time and would be blocked by every run, so an
explicit escape hatch is required: `ADP_TRUST_TEST_COMMAND=1`, exact match only,
never inferred from a truthy string. When stdin is not a terminal the tool refuses
rather than prompting, because auto-approving in a non-interactive context would
hand every wrapper script a silent yes. And this is consent, not containment: an
approved command still runs with full privileges, so the claim must be stated
narrowly wherever it is documented.

### D-013 — The monitor returns, read-only, and Docker leaves the plan

**Partially reverses D-011**, which removed the page entirely, and **narrows
D-005 and D-006**, which it had superseded. D-011 stays as written: the reasoning
that killed the writable page is still the reasoning that keeps it dead.

**Alternatives considered**

1. *Keep it dead.* The terminal and the exit code are the whole interface, as
   D-011 decided.
2. *Bring back the full monitor*, M4 and M5 — page, board, document editor, live
   updates over SSE.
3. *Bring back only the read half.* A page that renders gates, findings and
   feature progress, with no write path anywhere in it.

**Decision: alternative 3 — read-only.**

**Rationale.** The requirement that came back is *visibility of specifications and
progress*, with one hard constraint: the page must not be able to affect the
project being developed. Option 2 cannot satisfy that constraint structurally — a
writable page can corrupt a `PRD.md` through a bug, and the guarantee degrades
from "cannot" to "does not, if the code is right". Option 3 satisfies it by
construction: with no write endpoint, there is nothing to get wrong.

That single choice also dissolves the three hardest problems the old design
carried. Q-006 asked whose write wins when the page and an agent touch the same
file — there are no writes, so there is no conflict. D-006 chose Server-Sent
Events partly so the page could know it had gone stale; a polling client learns
the same thing from a failed request, and for a local tool reading a few dozen
markdown files, polling costs less than a watcher plus a fan-out. And the editor,
the largest single piece of the old UI, has no reason to exist when the documents
are edited where they were always edited: in an editor, and by the agent.

**Docker leaves the plan as a consequence, not as a separate decision.** Its only
job was isolating the page from the project, and isolation is now structural: the
tool has zero dependencies, lives outside the repository, writes nothing into it,
keeps telemetry in the state directory (D-007), and serves a page that cannot
write. Whoever runs `npx` already has everything the container was going to
provide. D-010 — the container mounts the repository rather than containing it —
remains correct for anyone who wants to run the engine without Node; it is simply
no longer the plan.

**Consequences.** `port` and `host` return to the configuration, and a port
already in use must fail loudly and start nothing — the developer's own dev
server owns 5173 and 8000, and a tool that quietly moves is a tool you have to go
hunting for. Binding is loopback, with no authentication, so the bind address is
the boundary; a Host header that is not loopback is refused, because binding
alone does not stop DNS rebinding through the operator's own browser. The page
never renders with `innerHTML`: the documents are the user's own, but a title is
still untrusted input. And a read-only page means the whole of M5 stays dead —
if editing is ever wanted, this decision is what must be revisited first.

---

## Assumptions

Status values: `aberta` · `confirmada` · `invalidada`.

- **ASM-001** — The configured agent CLI supports a non-interactive invocation
  that accepts a prompt, performs file edits and exits with a meaningful status
  code. *(status: confirmada — exercised directly against Claude Code 2.1.221 in
  a scratch directory, all three clauses separately. Prompt accepted and answered:
  `claude -p` returned the requested output and exited 0. File edits performed: a
  run asked for a named file with exact contents produced that file, with those
  contents. Status code meaningful: an invalid flag exited 1 where the successful
  runs exited 0, so the executor can tell the two apart.*

  *One finding came out of confirming it, and it matters more than the assumption
  did. The edit only happened because the invocation carried
  `--permission-mode acceptEdits`. What `resolveAgentCommand` actually configures
  is `claude -p '{{PROMPT}}'`, with no permission flag, and under the default mode
  a non-interactive run has no way to answer the approval it needs. The CLI can do
  what D-002 requires; the invocation this project would send it cannot. See
  Q-008.)*
- **ASM-002** — The host project's test runner can emit per-test results in a
  machine-readable form. Their `spec.config.json` runs `pytest` and `vitest`, both
  of which can, but the exact reporter flags are unconfirmed. *(status: confirmada —
  four adapters shipped: `tap`, `vitest-json`, `junit` and the degraded
  `exitcode`. `junit` is what makes `pytest --junitxml` work. Confirmed against
  this project's own suite, which required `--test-reporter=tap` on the command:
  the reporter is a property of the COMMAND, not of the runner, and a config
  naming a reporter the command does not emit produces a read error rather than
  a silent empty pass.)*
- **ASM-003** — The captain is the only operator, so concurrent writes to the same
  document come only from the captain's editor and an agent, never from two
  humans. *(status: confirmada — SCOPE §2 states single-tenant, single-operator)*
- **ASM-004** — Task granularity in `TDD.md` stays small enough that one task is
  one commit and one worker invocation. If tasks routinely need conversation, the
  worker contract in D-002 is wrong. *(status: aberta — and it cannot honestly be
  closed yet, because there is no evidence either way. Confirming it needs runs
  to look at, and the execution ledger contains none: 17 entries, all `verify`,
  no lane has ever been executed. The 27 tasks in this document were written to
  be one commit each, which is an intention rather than a measurement. What
  closes this is a handful of real `adp run` invocations and a count of how many
  needed a second pass — until then the worker contract in D-002 is a design
  under test, and it should be described that way to anyone evaluating it.)*
- **ASM-005** — Declaring a task's file list up front is accurate enough often
  enough to be useful. A worker that touches an undeclared file breaks the
  disjointness guarantee that makes lanes safe. *(status: confirmada — the mitigation is built: `runLane` compares what the commit actually touched against what the task declared and records an `undeclared-files` event. The declaration is trusted for planning and checked afterwards, which is the only honest combination.)*
- **ASM-006** — Reading and parsing the documents on every board request is fast
  enough at the stated volumes, so no caching layer is needed for MVP. *(status:
  confirmada — measured against this project's own `.spec/`, the largest real
  corpus available: 13 stories, 38 criteria, 27 tasks, 9 principles. A full
  `adp audit`, parsing every document from cold, runs in 323–473 ms wall clock
  including Node's own startup. The modification-time cache in the fallback
  would be optimising something that is already an order of magnitude below the
  threshold where a human notices a delay.)*
- **ASM-007** — The eight existing role agents in `.claude/agents/` remain the
  right division of labour and the pipeline maps onto them rather than replacing
  them. *(status: invalidada — the premise no longer holds. Those agents belonged
  to `Projeto_Agent`, and this tool has since been extracted into its own
  repository, which is what SCOPE Q-002 was asking. `.claude/agents/` does not
  exist here and nothing in the package depends on it. What replaced the
  assumption is narrower and already built: the agent is whatever
  `resolveAgentCommand` names — claude, codex, cursor or an explicit
  `agent.command` — and the division of labour is the task graph in `TDD.md`,
  not a fixed roster of roles.)*

## Open questions

Status values: `aberta` · `respondida`. A question marked **blocking** must be
answered before G2 can pass.

- **Q-001** — Which scope does the repository root own: Agent Dev Pipeline or Portal
  Proauto? *(status: respondida — the repository root owns **Agent Dev
  Pipeline**, and nothing else. The tool was extracted from `Projeto_Agent` into a
  repository of its own; Portal Proauto stays where it is and becomes one of the
  tool's consumers rather than its host. This is the arrangement the third option
  described, and it is the only one that survives the tool being published: a
  package cannot ship a host product's scope document inside it.)*
- **Q-002** — Does Agent Dev Pipeline get its own repository, or stay a folder inside
  `Projeto_Agent`? *(status: respondida — its own: `Codryx-Tec/agent-dev-pipeline`,
  published to npm as `@codryx/agent-dev-pipeline`. Staying a subfolder was
  incompatible with being installed into other projects, which is the entire
  point of the tool.)*
- **Q-003** — Is `agent-dev-pipeline` the final name? It appears in the port number
  documentation, the skill name, the config filename and the container image tag,
  so renaming later is cheap now and expensive after M4. *(status: respondida —
  the product is `agent-dev-pipeline`, published as `@codryx/agent-dev-pipeline`;
  the command, the config file and the engine's own skill are `adp`. The package
  name stays descriptive so the registry is searchable, while the binary stays
  short because it is typed dozens of times a day — the same split as
  `@angular/cli`→`ng`. Renamed before any of it was hard to
  change, as this question asked for.)*
- **Q-004** — Retired with Docker (D-013). It asked whether the agent CLI would
  run inside the container with mounted credentials or on the host. There is no
  container, so credentials never leave the machine they were installed on.
  *(status: respondida — the question dissolved with the container)*
- **Q-005** — What is the retention policy for run events and worker output
  streams? *(status: respondida — the last **ten** runs' streams, pruned
  automatically after every run. The reason is token economy, not disk: worker
  transcripts are the bulk of what this tool produces and the least re-read part
  of it, and ten covers "what went wrong in the last few attempts", which is the
  only question a stream ever actually answers. Events are never pruned — they
  are small and are what a post-mortem reads.)*
- **Q-006** — Retired with the monitor (D-011). It asked whose write wins when the
  captain edits a document on the page while an agent writes the same file. The
  tool no longer writes documents at all — only `init` and `new` create files, and
  neither overwrites — so the conflict it guarded against cannot arise.
  *(status: respondida — dissolved with the page in D-011, and kept dissolved by D-013: the page came back with no write path)*
- **Q-007** — Does the tool need to keep working when the host project's test
  suite takes minutes rather than seconds? *(status: respondida — yes, and the
  answer is `adp verify --background`: the run is detached, its progress is
  written to the event ledger, and `adp verify --status` reports it. Synchronous
  stays the DEFAULT, because a fast suite finishing in front of you is better
  feedback than a job id; background is opt-in for the case where it is not.
  Nothing about the verdict changes — a background run writes the same proof
  record, so the audit cannot tell the difference and neither can a gate.)*
- **Q-008** — **blocking for M6.** Under which permission mode does the executor
  invoke the agent? *(status: aberta — surfaced while confirming ASM-001. The
  invocation in `resolveAgentCommand` is `claude -p '{{PROMPT}}'`. In the default
  permission mode that run cannot edit a file: it needs an approval, and a
  non-interactive process has nobody to ask. The same prompt with
  `--permission-mode acceptEdits` wrote the file and exited 0. So the executor as
  configured cannot perform the work D-002 assigns it, and no test caught this
  because the executor has never run.*

  *The fix is one flag and the decision behind it is not. This project's whole
  argument is that execution requires consent — `adp trust` exists so that a test
  command cannot run until a human approves it. Handing an agent blanket edit
  rights inside a worktree is defensible, because the worktree is disposable and
  the diff is reviewed before it merges; handing it those rights by default,
  silently, is the same mistake `adp trust` was built to prevent. The options are
  to carry the flag in the default args, to require the operator to put it in
  `agent.command`/`agent.args` themselves, or to gate it behind an explicit
  `adp run --allow-edits`. Answer before M6.)*
