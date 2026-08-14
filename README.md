# agent-dev-pipeline

*English · [Português](README.pt-BR.md)*

**The specification that stays true.**

Most spec-driven tooling is *spec-first*: the specification generates code, the
code evolves, and within a fortnight the specification is well-formatted fiction.
This is *spec-anchored*: the specification is audited mechanically against the
code, all the time, and **the verdict is an exit code rather than a claim**.

Zero runtime dependencies. Node ≥ 24 and `git`. Nothing to install: it runs from
`npx` and leaves nothing behind.

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ code ──▶ test ──▶ audit
  G0      G1      G2       G3         G4                G5       G6
what we   what,   which    how,       the layer          is it    do they
agreed    whom,   path     in detail  the machine        proven   still agree
          why                        confers
```

---

## Start here

```sh
cd ~/my-project && git init

npx @codryx/agent-dev-pipeline init     # installs everything below
```

`init` writes an executable `./adp` (and `adp.cmd` for Windows) **into the
project**, pinned to the exact version that installed it — no alias to set
up by hand, and it doubles as the pinned-version story for CI:

```sh
./adp new student-enrolment
./adp status              # seven lights
./adp monitor             # the read-only page
```

Want a bare `adp` on your `PATH` too? `./adp init --shell-alias` appends a marked,
removable block to your shell rc file — opt-in, and it asks before writing
anything outside the project, same as `adp trust` does before running
anything from inside it.

There is no other install route, and nothing to uninstall. `npx` fetches one
small package and runs it; nothing is added to your project and no `node_modules`
appears in it. See [`INSTALL.md`](INSTALL.md) — including why you should pin the
version in CI, and how the tool stays installable on the version you pinned
after a new one ships.

Or read a finished project instead: **[`.exemplo/`](.exemplo/)** is a complete,
runnable project that reaches a clean `audit --ci` in three commands — `trust`,
`verify`, `audit`. It arrives **unproven on purpose**: proof is not a file
somebody hands you, it is the result of running the tests on your machine. Its
README lists four ways to break it so you can watch each gate fire.

---

## The seven gates

A gate is **green** when nothing it owns failed, **red** when something did,
**blocked** when an earlier gate is red, and **n/a** when the ceremony
matrix says it is not due. Four states, not two, on purpose: "we have not
got there yet" is not the same as "this is wrong," and "not required at
this size" is not the same as either — rendering them alike sends people to
fix consequences instead of causes, or to write a document nobody needs.

| Gate | Question | Passes when |
|---|---|---|
| **G0** | Is the scope agreed? | `.spec/SCOPE.md` says `Approved` |
| **G1** | What, for whom, why? | the PRD exists, its `feature:` line matches its directory, and it is named in `SCOPE.md`'s MVP checklist |
| **G2** | Which path? | every decision records ≥2 alternatives and a chosen one — `n/a` below rfc-first ceremony |
| **G3** | How, in detail? | the design document exists — `n/a` at light ceremony |
| **G4** | Is it implementable? | every story owns a criterion, every criterion has Given/When/Then, every criterion is covered by a task, every reference resolves, no blocking question open |
| **G5** | Is it proven? | every criterion has a test that PASSED |
| **G6** | Do they still agree? | no orphan tests, no unproven "done", no violated principle |

**The exit code is the failing gate.** `0` clean, `1`–`7` for G0–G6. `n/a`
never sets the exit code — G4, G5 and G6 are evaluated no matter what G2/G3
read. A pipeline learns *where* it broke from the status alone, with
nothing to parse.

**Not every feature owes the same ceremony.** A PRD's `> signals:` line
declares which of five things are true about it — `multiple-teams`,
`hard-to-reverse`, `money-or-pii`, `new-tech`, `large-estimate` — and a
level is computed from that, never written by hand: none declared means
SPEC and tasks direct (G2/G3 both `n/a`); one softer signal means a light
DESIGN is due; a cross-team open decision means RFC-first; money or
personal data means the full chain. `adp new <feature> --signals <list>`
scaffolds only what the computed level needs, and `adp status` reports the
level and signals per feature.

**Every PRD is in the MVP or nowhere at all.** `SCOPE.md`'s "MVP
(prioritized)" checklist names features by slug — `- [ ] <feature-slug> —
description` — and a PRD whose slug is missing there is `PRD_UNPLACED`
(G1). What hasn't started belongs in `BACKLOG.md` instead: plain prose,
one item per line, deliberately carrying no tracking code — only a
promoted PRD earns one. An item that already looks like a real code
(`AC-002`, `T-003`, ...) is `BACKLOG_ITEM_WITH_CODE`, a warning. To
promote an item: remove its line, run `adp new <feature-slug>`, add the
slug to the checklist — no dedicated command for it.

Only the first red gate's findings are printed. For a project whose PRD is not
written yet, printing all of them buries the one thing to do next under dozens of
its own consequences.

---

## The four documents

Each one owns a distinct family of traceability codes, so every code has exactly
one definition site and duplicate detection actually means something. Codes are
unique **across the whole project**, not per file.

| Document | Answers | Owns |
|---|---|---|
| `PRD.md` | **what**, for **whom**, **why** | nothing of its own — an `rfcs:` header line links the `RFC-xxx` file(s) it depends on |
| `RFC.md` | **which path**, among the possible ones | `D-xxx` decisions, each with alternatives and a choice |
| `DESIGN.md` | **how**, in detail — the blueprint a human reads | prose only — no code of its own |
| `SPEC.md` | **what the machine confers** | `US-xxx` stories · `AC-xxx` criteria · `ASM-xxx` assumptions · `Q-xxx` open questions · `T-xxx` tasks, each declaring `Refs:`, `Files:` and optionally `Reads:` and `Depends on:` |

`RFC.md` is flat and global, at `.spec/rfc/RFC-<NNN>-<slug>.md` — not nested
under a feature. One RFC can serve several PRDs, and one PRD often needs
several, one per one-way door (Q-001); a fixed sibling file couldn't express
that. Create one with `adp new --rfc <slug>`.

Four documents rather than one because the questions they answer have
different audiences and different lifetimes: *what and why* changes when the
business changes, *which path* when the constraints change, *how* rarely, and
*what the machine confers* every time a task is written or a test is added.
PRD and RFC stay prose a product owner and a reviewer can read without
tripping over code; SPEC is the layer that exists purely to be checked.

### The chain, and why it holds

```
US-001 ──owns──▶ AC-001 ◀──Refs──  T-001 ──Files──▶ src/thing.js
                    ▲                                        │
                    └────── @spec:AC-001 in a test title ─────┘
```

Cut any link and a gate turns red naming the link you cut. The annotation goes in
the **test title**, not a comment, because a title survives into every runner's
reporter output — which is what lets one scanner serve `pytest` and `vitest`
without knowing either.

### The rule the whole thing rests on

**You cannot declare a task done.** `[done]` with an unproven criterion is
`TASK_DONE_WITHOUT_PROOF`, an error. The test runner decides, and **a skipped
test is never proof**. That refusal is the product; everything else is
scaffolding around it.

---

## The constitution actually runs

`.spec/CONSTITUTION.md` holds `P-xxx` principles at `[MUST]`, `[SHOULD]` or
`[MAY]`. Every `[MUST]` needs an executable verification, in one of four forms:

```markdown
## P-002 [MUST] Secrets never in source

- verification(forbidden): `(password|secret)\s*[:=]\s*['"][^'"]{8,}` in `src/**`
- verification(required): `import hvac` in `src/core/vault.py`
- verification(test): @principle:P-002
- verification(gate): reviewed by a human — declares, proves nothing
```

The regexes **execute**. A `[MUST]` with nothing machine-checkable is
`PRINCIPLE_WITHOUT_VERIFICATION`. A glob matching no file is `GLOB_WITHOUT_FILES`,
because a check that cannot fail looks exactly like a check that passed — the
most expensive kind of green light there is.

Those patterns come from your project, which means they are arbitrary regexes
written by a human. `(a+)+$` against the wrong input backtracks catastrophically.
They run in a **disposable subprocess with a hard timeout**, so a pathological
pattern degrades into a finding instead of hanging the gate forever.

---

## What `adp init` installs

Everything a project needs lives under `payload/` and gets copied in. **Nothing
is ever overwritten**: every write goes through a create-only-if-missing path, so
re-running `init` after you have edited everything is safe, and the report says
what it *kept* rather than asking you to trust it. That is also why upgrading
needs no migration step — the tool never assumes it wrote what is on disk.

| Installed | What it is |
|---|---|
| `./adp`, `adp.cmd` | the wrapper, pinned to the installing version — never overwritten |
| `.spec/SCOPE.md`, `CONSTITUTION.md`, `BACKLOG.md` | the agreement, the rules, and what fell outside the MVP boundary |
| `.spec/CHANGELOG.md`, `BEST_PRACTICES.md`, `TROUBLESHOOTING.md` | process memory — how the next session starts smarter than this one |
| `.spec/STACK.md`, `STRUCTURE.md` | how to build, run and test without guessing |
| `.spec/metrics/hours-per-fp.json`, `fp-weights.json` | the cold-start hours table `adp estimate` reads, and what it recalibrates as `adp close` records real outcomes |
| `AGENTS.md` | the contract every AI reads first |
| `docs/USAGE.md`, `DEPLOYMENT.md` | product documentation, for humans rather than agents |
| `.claude/skills/**` | 15 skills, including `adp` and `create-rfc` |
| `.claude/agents/**` | 8 role agents: analyst, architect, tech lead, backend, frontend, designer, security, tester |
| `.claude/hooks/**` | auto-format, secrets scanner, context persistence |
| `adp.config.json` | paths, test command, port, delivery mode |

Flags trim it: `--minimal` installs only `.spec/` and the engine's own skill;
`--no-roles`, `--no-docs`, `--no-memory`, `--no-skills`, `--no-agents-md` each
skip one part. `--agent claude|cursor|codex|antigravity|none` picks the harness;
otherwise it is detected from the directories already present, and an ambiguous
project is **told**, not gambled on. `--brownfield` scans an existing codebase
for doc-shaped files and writes `.spec/BASELINE.md` — read-only, nothing moved
or rewritten; see [Adopting an existing project](#adopting-an-existing-project)
below.

> **A trap worth knowing.** Claude Code reads `.claude/skills/` — plural. A
> `.claude/skill/` directory looks right, is easy to create by hand, and is
> silently never loaded. The installer always writes the plural form, and warns
> if it finds the singular one lying around.

### The skills

`adp` is the agent's contract with the engine: the vocabulary, the
non-negotiable rules, the translated finding catalogue, and an explicit
three-attempt cap so a failing gate escalates to a human instead of looping
forever.

`create-rfc` (Tech Leads Club, CC-BY-4.0) writes the decision record — options
with genuine pros and cons, weighted decision criteria, RACI, outcome. **The
engine reads its output natively**, with no conversion step: `### Option 1:`
headings are the alternatives, and a `⭐` marker or an `## Outcome` decision line
is the choice. Assumptions and open questions belong in `SPEC.md`, not here —
code them `ASM-001` instead of a bare `1`. See
[`payload/claude/skills/create-rfc/INTEGRATION.md`](payload/claude/skills/create-rfc/INTEGRATION.md).

The other thirteen cover test-driven development, incremental implementation,
debugging, front-end work, documentation, memory files, worktree cleanup,
GitHub flow and project kickoff.

---

## Adopting an existing project

`adp init --brownfield` recognizes a codebase that already exists instead of
treating it as if it were new. It scans for doc-shaped files —
`README*`, `docs/**`, `adr/**`, OpenAPI specs, migrations, `CHANGELOG*`,
`CONTRIBUTING*` — and **prints what it found; nothing is moved or
rewritten**. What it does write is `.spec/BASELINE.md`: the current commit
and the source files that already existed, so the audit can tell inherited
debt from new debt.

A file named in the baseline stays a **warning**, exempt from `--ci`
escalation, for as long as it is untouched since that commit — a real edit
(even uncommitted) owes the same full-strength check as any new file, from
that moment on. The list only ever shrinks by design; growing it back is a
finding in its own right. This is what keeps a legacy repository's first
`adp audit` **legible** — a few dozen real lines, not a wall of thousands.

The `archaeologist` role reads the recognition inventory and the code itself
and proposes a `Draft` `SCOPE.md`, every claim cited to its source file — a
starting point for the human who owns the scope, never a finished one.
Archiving old documentation into `project_old_artifacts/` is deliberately
not built yet: it is the one step in this whole tool that would move a
user's real files, and it ships on its own once it exists, not bundled
behind the safe, read-only half.

## Living with a real finding on purpose

Not every real finding gets fixed today, and the honest answer to that is
neither "block everything" nor a hidden switch that turns a gate off.
`.spec/DEFERRALS.md` — optional, project-wide — records a **dated, owned
decision** to live with a specific finding for a while:

```markdown
## DEF-001 — legacy suite leaves with the billing migration

- Finding: TEST_ORPHAN
- Scope: test/legacy/**
- Owner: alice
- Reason: the old suite leaves with the billing migration
- Opened: 2026-08-05
- Until: 2026-11-03
```

Six rules keep this from becoming a second way to disable a gate: only
findings that describe the world changing under a document — G5/G6 — are
eligible at all, and ten of those (proof, and the decisions nothing should
route around) never are; a `Scope:` too broad, an `Until:` too far out, a
missing `Owner:`/`Reason:`/`Until:`, or three renewals of the same entry
each earn their own finding. An expired deferral returns to full severity
on its own — nobody has to remember to notice — and the active deferred
count is always printed next to green and red, never folded in silently.
`--ci` still honors a valid deferral; `adp audit --strict` ignores
`DEFERRALS.md` entirely, for the run that shows the real state regardless.

---

## Layout

```
src/                 THE ENGINE — this is the project
  cli.js               command dispatch, in three cost rings
  config.js            everything defaulted; runs with no config file
  parsers/             prd · rfc · spec · design · constitution · backlog · baseline · deferrals · annotations
  core/                project · audit · principles · gates · ceremony · init
                        estimate · count · closure · history · plan · executor
                        ledger · resume · trust · upgrade · report(-html)
  util/                text · glob
bin/adp.js           the command
  server/              read-only http server + state projection
  ui/                  index.html · app.css · app.js, inlined at request time
scripts/             build-manifest.js — the payload's SHA-256 manifest
.github/workflows/   ci, and publish with provenance from OIDC
test/                374 tests, node:test, no framework
payload/             WHAT GETS INSTALLED — templates, AGENTS.md, skills, agents, hooks, docs
.exemplo/            a finished, green, runnable project to read and break
ARCHITECTURE.md      why the engine looks like it does — read before changing it
INSTALL.md           the one install route, and why CI should pin a version
```

The split that matters: **what the tool *is* lives in `src/`; what the tool
*installs* lives in `payload/`.** Nothing pretends to be both, which is why the
repository root is clean and why `init` has no special cases.

`src/core/` never touches I/O beyond reading the documents: it takes a project
and returns findings. `src/cli.js` renders them, `--json` serialises them, and
neither can reach a conclusion the other would not. Keeping the verdict in one
place is why the number your pipeline reads and the text you read are the same
verdict, rather than two implementations that agree today.

---

## Commands

```sh
# the chain
adp init [--agent <name>] [--minimal] [--brownfield] [--shell-alias]
adp new <feature> [--signals <list>]    create PRD.md, SPEC.md, DESIGN.md if the ceremony matrix owes one
adp new --rfc <slug>                    create a new decision record
adp status                              seven lights
adp audit [--ci] [--strict] [--json]    findings behind the first red gate
adp gates [--list]                      gates and their state, without the findings
adp prompt [<gate>]                     paste-ready text for your AI
adp verify [--background]               run the test command and record what it proves

# viability and estimate
adp report [--html <path>] [--json]     a portable snapshot: gates, ceremony, MVP/backlog, estimate
adp profile [--stack] [--familiarity] [--app-type] [--brownfield] [--tests]
adp estimate [--pf <n>] [--csv] [--review] [--confirm] [--history]
adp close --hours <n> [--note "<s>"]    record real hours; recalibrates the estimate table
adp metrics import <file> | export [--csv]

# background execution
adp plan                                execution lanes, without running anything
adp run [--lane <id>] [--allow-edits]   execute pending tasks in isolated git worktrees
adp rerun <lane> [--allow-edits]        re-run one lane, leaving merged work alone
adp resume | checkpoint --note "<s>"    where the work stands, across sessions
adp clean [--force]                     remove worktrees whose work already merged

# housekeeping
adp monitor [--port <n>]                the read-only page
adp upgrade [--apply] [--only-migrations]
adp doctor                              verify this copy against its manifest
adp trust [--revoke]                    approve this project's testCommand
```

`adp <command> --help` is `adp help` today — the full reference, with every
flag, lives in one place: run `./adp help`. (`Makefile.txt` wraps a few of
these for working *on* the engine itself — rename it to `Makefile` if you are
developing the tool. Using the tool needs no `make`.)

### In CI

```yaml
- run: ./adp audit --ci
```

`--ci` escalates the softer findings — unproven criteria, stale proof, open
questions, uncovered criteria, orphan source files — from warnings to errors,
and still honors a valid `DEFERRALS.md` entry. One engine, two postures: quiet
enough to work under, strict enough to be a gate.

**Pin the version in CI.** `./adp` already does this for you — it calls
`npx --yes @codryx/agent-dev-pipeline@<the version that wrote it>`, so the
gate guarding your repository cannot change without a commit. Without the
wrapper, `npx @codryx/agent-dev-pipeline` (no version) runs whatever was
published most recently, which is awkward for a tool whose job is producing
evidence:

```yaml
- run: npx --yes @codryx/agent-dev-pipeline@0.6.0 audit --ci
```

---

## The monitor

```sh
adp monitor          # http://127.0.0.1:7788
```

A page showing the seven gates, the findings behind the first red one, and each
feature's progress. It is **read-only, structurally** — not by policy.

Any method other than `GET` or `HEAD` is refused with 405 **before the path is
even examined**, so adding a route later cannot open a write path by accident.
No request body is ever read. The server file contains no write call, and a test
asserts that rather than trusting the comment.

That single property is what lets the page be safe around work in progress: it
cannot corrupt a document, so there is no conflict to resolve when you and your
AI edit the same file, no version check, no editing protocol. You edit where you
always edited; the page reflects it within a couple of seconds.

**It cannot affect the project it watches.** The tool has zero dependencies and
lives outside your repository — nothing is added to your `package.json`, no
`node_modules` appears, there is no build step and no artifact. Telemetry lives
in the state directory, outside the repo. The two real points of contact are
handled: the port is configurable and a port already taken **fails loudly and
starts nothing** rather than quietly moving, and there is no write path at all.

Binding is loopback with no authentication, so the bind address is the boundary —
and a request whose `Host` header is not a loopback name is refused, because
binding alone does not stop DNS rebinding through your own browser.

---

## Supply chain

This package writes **executable shell hooks** and **agent instructions** into
your repository, where they persist. That is a wider blast radius than an
ordinary dependency, so it gets proportionate defences — and each one is stated
with what it does *not* cover, because a defence advertised beyond its reach is
the same failure as a check that cannot fail.

| Defence | Covers | Does not cover |
|---|---|---|
| **Zero dependencies** | typosquatting, transitive compromise, a maintainer being socially engineered | anything in this package itself |
| **No install scripts** | code running on your machine at `npm install` | code you run deliberately |
| **Trusted publishing** (OIDC, no stored token) | a stolen publish token — the usual way npm packages fall | a compromised repository |
| **`--provenance`** | a tarball that did not come from this source | a malicious commit, perfectly attested |
| **`payload/MANIFEST.json`** | tampering after publication, a bad mirror, an edited local copy, drift | a malicious publish — the attacker controls the manifest too |
| **Consent for `testCommand`** | cloning a hostile repo and running its author's code | a command you deliberately approved |
| **Path guard in `init`** | a write escaping your project directory | — |
| **Never overwrites** | your edited hook being silently replaced | — |

Check the copy you have, and where it came from:

```sh
adp doctor              # payload matches the manifest shipped with it
adp trust               # read and approve the testCommand before it runs
npm audit signatures    # the package came from its stated source
```

`init` verifies the payload **before writing anything**, and a failed check is
fatal with no override flag. A missing manifest is a warning instead — running
from a working tree is a normal state, and refusing there would only teach people
to reach for the bypass.

Every one of these is a `P-xxx` principle in `.spec/CONSTITUTION.md` with an
executable verification, so the tool audits its own hardening and G6 turns red if
someone weakens it. That is not decoration: the first draft of P-008's forbidden
pattern matched the word `NODE_AUTH_TOKEN` in the comment explaining that no such
token exists, and the audit caught it.

---

## Where this is

Built and tested: the engine, the seven gates, the executable constitution,
the installer and its `./adp` wrapper, the ceremony matrix, MVP/backlog,
Function Point estimation and closing the loop with real hours, background
execution in isolated worktrees, brownfield adoption, declared deferral, and
the read-only monitor. **374 tests**, each carrying its own `@spec:AC-xxx` or
`@principle:P-xxx` annotation — the tool proves itself with its own
mechanism.

This repository's own specification, in `.spec/features/agent-dev-pipeline/`,
already runs the PRD/RFC/DESIGN/SPEC chain it describes above — `adp audit
--ci` against this repository is clean. What is not wired up yet is the CI
job that enforces that on every push (the last item on `.spec/SCOPE-0.6.0.md`'s
own milestone table): today's CI runs the test suite and audits the worked
example, not this repository's own `.spec/`.

The browser monitor has a two-part history worth knowing, because the RFC
records both halves rather than only the current one: **removed** first
(D-011) — a server, a projected kanban, a document editor was eight tasks of
interface for one operator already sitting in a terminal — then
**reintroduced, read-only** (D-013), once "watch a background run without a
terminal open" turned out to be a real need the removal had thrown out along
with the parts that were never needed. `adp monitor`, documented above, is
that second decision.

One consequence you can watch in `.exemplo/`: its three tasks say `[done]`,
and that word is worth nothing until `verify` has run. Delete the proof record and
all three report `TASK_DONE_WITHOUT_PROOF` — the status stays exactly where it
was written, and the engine simply stops believing it.

---

## Credit

The engine's design descends from
[onp-spec-driven](https://github.com/onovoprogramador/onp-spec-driven) by Vitor
Manoel (MIT): the markdown grammar, the finding catalogue, proof that refuses
skips, and the sandboxed pattern search.

The operating doctrine descends from
[bridge-commander](https://github.com/tonylampada/bridge-commander) by Tony
Lampada — including the sentence the whole board rests on: *board state is the
truth, conversation memory is a cache*.

`create-rfc` is by [Tech Leads Club](https://github.com/tech-leads-club),
CC-BY-4.0.

The reasoning behind each borrowing, and the alternatives rejected, is recorded
in `.spec/rfc/RFC-001-agent-dev-pipeline.md` — D-001 through D-016.
