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

Then alias it once, because you will type it all day:

```sh
alias adp='npx @codryx/agent-dev-pipeline'

adp new student-enrolment
adp status              # seven lights
adp monitor             # the read-only page
```

There is no other install route, and nothing to uninstall. `npx` fetches one
small package and runs it; nothing is added to your project and no `node_modules`
appears in it. See [`INSTALL.md`](INSTALL.md) — including why you should pin the
version in CI.

Or read a finished project instead: **[`.exemplo/`](.exemplo/)** is a complete,
runnable project that reaches a clean `audit --ci` in three commands — `trust`,
`verify`, `audit`. It arrives **unproven on purpose**: proof is not a file
somebody hands you, it is the result of running the tests on your machine. Its
README lists four ways to break it so you can watch each gate fire.

---

## The seven gates

A gate is **green** when nothing it owns failed, **red** when something did, and
**blocked** when an earlier gate is red. Blocked is a third state on purpose:
"we have not got there yet" is not the same as "this is wrong", and rendering
them alike sends people to fix consequences instead of causes.

| Gate | Question | Passes when |
|---|---|---|
| **G0** | Is the scope agreed? | `.spec/SCOPE.md` says `Approved` |
| **G1** | What, for whom, why? | the PRD exists and its `feature:` line matches its directory |
| **G2** | Which path? | every decision records ≥2 alternatives and a chosen one |
| **G3** | How, in detail? | the design document exists |
| **G4** | Is it implementable? | every story owns a criterion, every criterion has Given/When/Then, every criterion is covered by a task, every reference resolves, no blocking question open |
| **G5** | Is it proven? | every criterion has a test that PASSED |
| **G6** | Do they still agree? | no orphan tests, no unproven "done", no violated principle |

**The exit code is the failing gate.** `0` clean, `1`–`7` for G0–G6. A pipeline
learns *where* it broke from the status alone, with nothing to parse.

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
| `.spec/SCOPE.md`, `CONSTITUTION.md` | the agreement and the rules, from templates |
| `.spec/CHANGELOG.md`, `BEST_PRACTICES.md`, `TROUBLESHOOTING.md` | process memory — how the next session starts smarter than this one |
| `.spec/STACK.md`, `STRUCTURE.md` | how to build, run and test without guessing |
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
project is **told**, not gambled on.

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

## Layout

```
src/                 THE ENGINE — this is the project
  cli.js               command dispatch, in three cost rings
  config.js            everything defaulted; runs with no config file
  parsers/             prd · rfc · spec · design · constitution · annotations
  core/                project · audit · principles · gates · init · report
  util/                text · glob
bin/adp.js           the command
  server/              read-only http server + state projection
  ui/                  index.html · app.css · app.js, inlined at request time
scripts/             build-manifest.js — the payload's SHA-256 manifest
.github/workflows/   ci, and publish with provenance from OIDC
test/                197 tests, node:test, no framework
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
adp init [--agent <name>] [--minimal]   scaffold a project
adp new <feature>                       create PRD.md, SPEC.md, DESIGN.md
adp new --rfc <slug>                    create a new decision record
adp status                              seven lights
adp audit [--ci] [--json]               findings behind the first red gate
adp gates [--list]                      gates and their state
adp prompt [<gate>]                     paste-ready text for your AI
adp monitor [--port <n>]                the read-only page
adp doctor                              verify this copy against its manifest
adp trust [--revoke]                    approve this project's testCommand
```

(`Makefile.txt` wraps these for working *on* the engine — rename it to
`Makefile` if you are developing the tool. Using the tool needs no `make`.)

### In CI

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
```

`--ci` escalates the softer findings — unproven criteria, stale proof, open
questions, uncovered criteria, orphan source files — from warnings to errors. One
engine, two postures: quiet enough to work under, strict enough to be a gate.

Pin the version in CI. Unpinned, `npx` runs whatever was published most
recently, which means the gate guarding your repository can change without a
commit — awkward for a tool whose job is producing evidence.

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
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

Built and tested: the engine, the seven gates, the executable constitution, the
installer, the templates, the skills, the read-only monitor, and the worked example.
**197 tests**, each carrying its own `@spec:AC-xxx` or `@principle:P-xxx` annotation — the tool proves
itself with its own mechanism.

This repository's own specification, in `.spec/features/agent-dev-pipeline/`,
is still written in the 0.5.0 grammar (PRD/RFC/TDD) and audited by the pinned
0.5.0 release — the tool bootstraps its next version in the grammar the
current one reads, and switches once the new parser passes its own tests. See
`.spec/SCOPE-0.6.0.md` for the version that introduced the PRD/RFC/DESIGN/SPEC
chain described above.

Specified and then **removed**: the browser monitor — a server, a projected
kanban, a document editor. It was eight tasks of interface for one operator who
is already sitting in a terminal. The reasoning, and the alternatives weighed
against it, are recorded as D-011 rather than deleted, so the next person to
propose a page finds the argument instead of repeating it.

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
in `.spec/features/agent-dev-pipeline/RFC.md` — D-001 through D-010.
