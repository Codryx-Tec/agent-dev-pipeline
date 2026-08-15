# RFC: Agent Dev Pipeline

> rfc: RFC-001
> document: RFC — WHICH path, among the possible ones
> owns: D-xxx (decisions)
> status: draft

Flat and global (Q-001): this file is not owned by one feature. `agent-dev-pipeline`'s
`PRD.md` links it via its `rfcs:` line.

## Purpose

`PRD.md` fixed *what* Agent Dev Pipeline must do. This document fixes *how we will get
there*, decision by decision, with the roads not taken written down beside the
one we took. A decision recorded without its alternatives is indistinguishable
from a habit, and habits are what nobody can revisit later. This file alone
now carries 16 decisions — a number that only means something because each
one still names what lost and why, not just what won.

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
4. *Do nothing.* No board or state abstraction at all — the CLI prints raw
   findings text; nothing computes a board-shaped view over the documents.

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
3. *Do nothing — no background execution.* The orchestrating session
   implements everything itself, sequentially.

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
4. *Do nothing.* No structured document grammar at all — free-form notes,
   nothing machine-readable, no traceability codes anywhere.

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
4. *Do nothing.* No engine at all — the tool would be prompts and
   instructions only, with no mechanical audit, no exit code, no proof.

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
4. *Do nothing.* No interface beyond the command line at all — no page, no
   board, nothing to build.

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
4. *Do nothing.* No live-update mechanism — the page would need a manual
   reload to see anything new.

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
4. *Do nothing.* No execution telemetry at all — a lane's run leaves no
   record anywhere once it finishes.

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
2. *Do nothing — excluded entirely.* The tool never talks to a remote, and
   GitHub integration is never built.
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
3. *Do nothing.* No audit engine at all — the documents exist, but nothing
   mechanically checks whether they agree with the code or with each other.

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
3. *Do nothing.* No container image at all — the tool runs only by
   installing Node directly on the target machine.

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
2. *Do nothing — remove it.* The command line and the exit code are the
   whole interface; the container is how the tool reaches a machine that
   has no Node.
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
unbuilt criteria in the documents are what `AC_WITHOUT_TASK` and `TASK_DONE_WITHOUT_PROOF`
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
4. *Do nothing.* No automated test execution at all — a human runs the
   project's tests manually, outside the tool, whenever they choose to.

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

1. *Do nothing — keep it dead.* The terminal and the exit code are the whole
   interface, as D-011 decided.
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

### D-014 — Ordering is declared; parallelism is inferred from writes alone

**Answers Q-010.**

**Alternatives considered**

1. *`Depends on:` alone.* Add explicit ordering, and keep uniting lanes on every
   file a task declares. The smallest change to the planner.
2. *`Reads:` alone.* Distinguish reading from writing so lanes stop collapsing on a
   shared read, and leave ordering to emerge from write overlap as it does today.
3. *Both.* Ordering becomes declarable and reading stops implying collision.
4. *Do nothing.* No `Depends on:`/`Reads:` declarations at all — file
   overlap stays the only lever, and Q-010's workaround (declaring a false
   read to force ordering) stays the honest thing left to do.

**Decision: alternative 3 — both, because either one alone leaves the other's
failure in place.**

**Rationale.** Option 1 answers the question as asked and leaves the reason it was
asked. The experiment's fourth task did not want to declare three files; it wanted
to run last, and declaring files was the only lever available. Give it `Depends on:`
while `Reads:` still costs parallelism and the lever is still there, still cheaper
than being precise. Option 2 removes the incentive but not the gap: without a way
to say "after", a task that genuinely needs another's output has nothing to say it
with, and the honest thing left is to declare a false write. Each option fixes the
half that makes the other half survivable.

A task says what it runs after with `Depends on: T-001`, and what it merely reads
with `Reads: src/a.js`. Neither existed before, and their absence had a cost that
only showed up when the executor first ran.

**Why ordering cannot be inferred.** The planner had exactly one mechanism: two
tasks declaring the same file run in the same lane. That is the right rule for
safety and it cannot express "after", because file overlap is symmetric and
"after" is not. The experiment that raised Q-010 showed what people do with the
mechanism they have — the fourth task declared three files it only READ, in order
to be pulled into everyone else's lane and therefore run last. It worked, and it
collapsed all four tasks into one lane. Ordering and parallelism were the same
mechanism, so buying either one spent the other.

**Why reads are a separate claim.** A lane is a worktree, so two tasks reading the
same file cannot collide; charging a reader the parallelism of every writer was
paying for a conflict that cannot happen. What reading does not buy is the
writer's version: the worktree is branched from HEAD, so a reader sees the
pre-run file. That gap is REPORTED rather than refused — reading the pre-run
version is legitimate and often the intent, and the two cases are indistinguishable
in the document. A warning names the task, the file and the writer.

**What is refused rather than guessed.** A dependency cycle, a dependency on an id
no task declares, and a dependency on a task that will not run in this plan. All
three go to the sequential remainder with the reason stated. Breaking a cycle by
picking a member to go first would invent a decision the documents did not make,
which is the same shape of mistake as counting a skipped test as proof.

**Mutually dependent LANES are merged, not refused.** Two lanes can each need to
follow the other without any single task being circular — A's first task follows
B's, B's second follows A's. There is no order, but there is no contradiction
either, so the lanes become one lane and the tasks inside it are ordered normally.

**Consequences.** Lanes carry a stage number and the executor iterates stages
rather than lanes, merging each stage before branching the next — which is the
only thing that makes "after" mean anything at runtime, since a lane sees a
dependency's work solely because it already landed. `--no-merge` therefore cannot
be combined with a plan of more than one stage: nothing would land, and the
ordering would be announced and not delivered. `--lane` can still select a lane
whose dependency is not in the run; that is the operator's choice and is printed
before the confirmation rather than discovered in the diff.

### D-015 — The orchestrator runs the tests in the lane; the worker still cannot

**Answers Q-009.**

**Alternatives considered**

1. *`--allow-tests`.* A flag permitting the worker to execute exactly the approved
   `testCommand` through its harness, giving it a real feedback loop: run, watch
   it fail, fix it.
2. *The orchestrator runs them.* After each task commits, the executor runs that
   same approved command in the lane and attributes the result to the task.
3. *Both*, with the lane's run as an independent verdict on top of the worker's.
4. *Do nothing.* Neither the worker nor the orchestrator runs the project's
   tests inside a lane — Q-009's failure (a broken test surfacing only at
   `adp verify`, after the merge, belonging to no task) stays exactly as
   observed.

**Decision: alternative 2 — the orchestrator runs them, and the worker is granted
nothing.**

**Rationale.** The failure recorded in Q-009 was not that workers guessed; it was
that nothing in the lane noticed when they guessed wrong, so a broken test arrived
at `adp verify` after the merge belonging to no task. Option 2 fixes exactly that,
using consent that already exists. Option 1 fixes a different and unproven problem
— all four workers in the experiment were in fact correct — and pays for it with a
much larger grant. Option 3 buys the same verdict twice: the orchestrator would
not take the worker's word for it anyway, so the worker's run is a second full
suite per task in exchange for a feedback loop nothing yet says is needed.

After each task commits, the executor runs the project's `testCommand` inside that
lane's worktree and attributes the result to that task. The worker is granted
nothing it did not have before.

**The grant already existed.** `adp trust` binds consent to one exact command,
and the orchestrator holds it. Running that command is not a new permission, it
is the permission already given, used in a directory that happens to be a
worktree. The alternative under consideration — letting the worker execute the
test command through its harness — would have been a genuinely larger grant:
editing files in a worktree is bounded by the diff a human reviews, and executing
commands is not.

**What this buys, stated narrowly.** Attribution, and nothing else. Before it, a
worker that wrote a failing test could not run it, said so, and the failure
surfaced at `adp verify` after the merge, belonging to no task in particular. Now
it stops the lane and names the task. What it does NOT buy is a feedback loop:
the worker still cannot see its own tests fail and fix them, so Q-009's second
half is answered "no" rather than "later".

**The tests run after the commit, deliberately.** A task whose tests fail has
still produced work, and its branch is the only place that work exists. Stopping
before the commit would leave it in a worktree, one `git worktree remove` from
gone.

**Consequences.** A fresh worktree holds what git tracks, and installed
dependencies are the one thing every project deliberately does not track — so
`npm test` in a new lane would fail on a missing module rather than on the code,
which would make this useless everywhere except a project with no dependencies.
Paths named in `parallel.linkIntoWorktree` (default `node_modules`) are symlinked
in, but only when they already exist at the root and only when git confirms they
are ignored: a linked directory git can see would be swept into the lane's
`git add -A`, which is worse than the tests not running. When there is no test
command, or none approved, the runner is absent and the run proceeds without it —
the check is optional, and its absence costs the run its attribution, not its
result. `--no-lane-tests` turns it off for a suite too slow to run per task.

### D-016 — The engine vocabulary is English, in one spelling

**Alternatives considered**

1. *Do nothing — keep the Portuguese vocabulary.* Statuses, finding codes
   and field labels stay as they were written; only prose is English.
   Nothing breaks.
2. *Accept both spellings, English canonical.* The parser reads `[concluida]`
   and `[done]`; scaffolds emit English; the Portuguese keeps working forever.
3. *English only, with a hard cut.* One spelling per token, and every existing
   document stops parsing until it is rewritten.

**Decision: alternative 3 — English only, and the break is taken now.**

**Rationale.** The vocabulary was bilingual by accident rather than by design:
prose, gate titles and the readable finding names were already English, while the
tokens those names described were not. `TASK_CONCLUIDA_SEM_PROVA` rendered as
"task completed without proof" — the same fact, twice, in two languages, and a
reader had to hold both. The cost was not translation, it was that neither half
could be guessed from the other.

Option 1 keeps that. Option 2 removes it for new projects and doubles the
grammar for everyone: two spellings per token means two things to document, two
to test, and a permanent question about which one a given document is in. That
price is worth paying to protect a large installed base and is not worth paying
to protect a small one — at 0.4.1, with no dependents on record, the installed
base does not justify carrying a second grammar for the life of the project.

**What this is NOT.** The rule that a finding code never changes with the
reader's language stands, and this decision does not weaken it — a pipeline that
greps `AC_WITHOUT_PROOF` must find that exact string on every machine, in every
locale, forever. What changed is which language the one spelling is in, once.
That distinction was blurred in the old wording ("never translated"), which read
as a ban on this change rather than as the runtime guarantee it actually is.

**Consequences.** This is a breaking change for any project already carrying
`.spec/` documents, so it takes a minor version of its own and the release notes
have to lead with it rather than mention it. Five token families move: 40 finding
codes, 4 task statuses, 5 document statuses, the assumption and question
statuses, and the field labels — `Arquivos:` becomes `Files:`, `Lê:` becomes
`Reads:`, `Depende:` becomes `Depends on:`, `Notas:` becomes `Notes:`. The three
English field labels already parsed as aliases before this decision, which is
what made the inconsistency visible in the first place.

No migration command ships with it. One would be the right answer for a tool with
users to carry across; writing it now would be building for an installed base
that has not been observed to exist, and the rewrite is a find-and-replace that
takes longer to describe than to run.

### D-017 — Brownfield archiving copies by default; `--move` opts into `git mv`, and three guards apply to both

**Decision criteria:** W-001, W-002, W-003, W-005, W-006

**Options considered**

- **OPT-000 — Do nothing.** Ship Passo 1 (recognition) and Passo 2 (the
  consent listing) only, indefinitely. `project_old_artifacts/` never gets
  built; a legacy project's old documentation stays exactly where it already
  was, un-triaged, forever.
- **OPT-001 — Copy only, no move mode at all.** Every archived file is
  duplicated into `project_old_artifacts/`; the original never moves,
  `git mv` is never invoked, and the tool carries no code path that removes a
  file from where it already lives.
- **OPT-002 — `git mv` by default, no copy mode.** Archiving always moves; a
  project that wants a duplicate instead of a move runs its own `cp` first,
  outside the tool.
- **OPT-003 — Copy by default, `--move` opts into `git mv`, three guards in
  both modes.** Refuse outside a git repository, refuse on a dirty working
  tree, and an untouchable list (`README.md`, `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, and any path a CI workflow's own text
  references) stays copied regardless of mode.

**Scoring matrix**

| Option | W-001 | W-002 | W-003 | W-005 | W-006 | Total |
|---|---|---|---|---|---|---|
| OPT-000 | 9 | 9 | 10 | 10 | 1 | 39 |
| OPT-001 | 8 | 9 | 8 | 8 | 5 | 38 |
| OPT-002 | 3 | 3 | 7 | 7 | 6 | 26 |
| OPT-003 | 8 | 9 | 6 | 6 | 9 | 38 |

**Recommendation:** OPT-003 — do nothing scores highest only because four of
its five criteria (`W-001`, `W-002`, `W-003`, `W-005`) measure the *absence*
of risk or cost, and any option that ships nothing trivially maximizes all
four. `W-006` — does this actually solve `PB-002` — is the one criterion
that inverts the ranking, and it is not a minor one: the entire reason
`PRD-002` exists is that a legacy project's documentation stays mixed with
current, live docs otherwise, which is the exact complaint the archaeologist
role and the ratchet baseline were both built to answer. `OPT-001` scores
within one point of `OPT-000` for the same reason and shares its actual
defect: a "copy forever, never move" tool teaches every adopting project to
carry two permanent copies of everything it archives, which is not what
`git mv`'s history-preserving, revertible-with-`git reset` promise —
`PRD-002`'s own stated reason for choosing `git mv` over plain `mv` — is
for. `OPT-002` loses outright: a destructive default is exactly the shape of
mistake `W-001`/`W-002` (the two highest-weighted criteria) exist to catch,
independent of any guard sitting in front of it.

**Decision: OPT-003 — copy by default, `--move` opts into `git mv`, guards apply to both.**

**Rationale.** `SCOPE-0.6.0.md` §PRD-002's own text is unambiguous that this
is the one feature in the whole 0.6.0 scope that moves a user's real files,
and `Q-005` already answers the shape verbatim — this decision records that
answer in this repository's own decision log rather than re-deriving it, the
same way `D-016` recorded a choice `SCOPE-0.6.0.md` had already made. Copy as
the default matches the posture every other write-capable command in this
tool already takes (`upgrade` dry-runs by default, `init` never overwrites):
the safe path costs nothing extra to try, and the destructive path is
something an operator reaches for on purpose. The three guards are not
independent knobs so much as one property stated three ways — "this can
always be undone" — and each closes a different way that property would
otherwise fail: no git repository means no `git reset` exists to undo
anything with; a dirty tree means the undo commit would carry the operator's
own unrelated work along with it; and the untouchable list exists because
some files' *location*, not their content, is load-bearing (`README.md` is
GitHub's landing page; a CI-referenced path is a build input), so moving
them is a different kind of mistake than moving a stale ADR — one this tool
would have made while presenting itself as the thing that organizes the
house.

**Consequences.** `.spec/BACKLOG.md`'s M4-archiving-step entry is removed by
this pass, not left behind as done-but-undocumented debt. The untouchable
list is matched by basename, not exact root-relative path, because
`RECOGNITION_GLOBS`'s own `docs/**` pattern can reach a
`docs/CODE_OF_CONDUCT.md` GitHub itself would still treat as a community
health file — a broader match only ever costs an unnecessary copy, never a
wrongly-moved file. The CI-workflow-reference guard is a literal substring
check of each candidate's path against `.github/workflows/**`'s raw text; it
does not resolve a glob or a templated path inside a workflow, so a
workflow that names its inputs indirectly can still lose a file to `--move`
that a human would have flagged — documented in `adp archive --help` rather
than solved, since solving it properly means parsing YAML and step syntax
for a case this project has not yet observed happening. `.exemplo-legado/`'s
own `START-HERE.md` still narrates this step in prose rather than running it
for real; wiring that walkthrough to the actual command is its own pass, not
part of this one. And the dirty-working-tree refusal, unlike the same check
`adp run`/`adp rerun` already perform, has no `--yes` override — the three
guards this decision names are stated as non-negotiable in the source text,
and `run`'s override exists for a different reason (letting an operator
proceed against their *own* uncommitted work on purpose), which does not
apply here.

---

