---
name: adp
description: Spec-anchored development driven by seven mechanical gates. Guides a project through SCOPE → PRD (what, for whom, why) → RFC (which path, when a decision is genuinely one-way) → DESIGN (how, in detail) → SPEC (the layer the machine confers) → code → test → audit, with traceability from user story to acceptance criterion to task to test, an executable constitution whose regexes actually run, a ceremony matrix that scales documentation to the size of the decision, and a verdict that is an exit code rather than a claim. Use when specifying a feature, deciding an architecture with alternatives recorded, breaking work into parallelizable tasks, proving an implementation against its specification, checking whether documentation has gone stale, estimating effort, or answering "is this done?". Triggers: "specify this feature", "new feature", "write the PRD", "write the RFC", "break this into tasks", "audit against the spec", "is this done", "what has no test", "which gate is red", "the docs are out of date", "how much ceremony does this need", "estimate this".
license: MIT
metadata:
  version: 0.6.0
  engine: agent-dev-pipeline
---

# agent-dev-pipeline — the specification that stays true

Most spec-driven tooling is **spec-first**: the specification generates code, the
code evolves, and the specification becomes well-formatted fiction. This is
**spec-anchored**: the specification is audited mechanically against the code, all
the time. You do not claim the work is done. **The machine decides, and it says so
with an exit code.**

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ code ──▶ verify ──▶ audit
  G0      G1      G2       G3         G4                 G5        G6
```

`PRD.md` is prose only — what, for whom, why; it owns nothing a machine
cross-references. `RFC.md` is flat and global (`.spec/rfc/RFC-<NNN>-<slug>.md`,
not a fixed sibling file) and owns `D-xxx` decisions. `DESIGN.md` (called
`TDD.md` in projects older than 0.6.0) is the technical blueprint a human
reads — presence-only, no grammar of its own. `SPEC.md` is where `US-xxx`,
`AC-xxx`, `ASM-xxx`, `Q-xxx` and `T-xxx` all live now — "the layer the
machine confers."

**Not every feature owes every document.** A PRD declares signals
(`> signals: multiple-teams, hard-to-reverse, money-or-pii, new-tech,
large-estimate`); the ceremony matrix computes a level from them and decides
whether G2 (RFC) and G3 (DESIGN) are even due — see below. Gates read `n/a`,
not red, when a document genuinely isn't required at this size.

## Talk to the human in their language, and in plain words

The files use short **traceability codes**, because that is what links the
documents to the tests mechanically. With the person, always use the full name;
the code goes in parentheses only when they need it.

| Code | What you call it | Lives in |
|---|---|---|
| US-xxx | **user story** — who needs it, what, and why | `SPEC.md` |
| AC-xxx | **acceptance criterion** — an observable result a test can check | `SPEC.md` |
| ASM-xxx | **assumption** — a gap you filled with a guess, not yet confirmed | `SPEC.md` |
| Q-xxx | **open question** — a decision the product owner still owes | `SPEC.md` |
| T-xxx | **task** — one step of implementation | `SPEC.md` |
| D-xxx | **decision** — a chosen path, with the alternatives recorded | `RFC-<NNN>-<slug>.md` |
| P-xxx | **principle** — a non-negotiable constraint from the constitution | `CONSTITUTION.md` |
| G0–G6 | **gate** — a mechanical checkpoint between phases | — |

Say "the acceptance criterion AC-003 (late delivery warning) still has no test",
never "AC-003 is missing its @spec tag". Never require the person to know the
alphabet soup in order to understand what you told them.

Answer in whatever language the person is writing to you in. Prose INSIDE
generated documents follows `SCOPE.md`'s `**Docs language:**` field (defaults
to English if absent) — see `AGENTS.md`. The engine's own tokens (statuses,
finding codes, field labels) are English always, unconditionally, regardless
of that field.

## The engine

```sh
npx @codryx/agent-dev-pipeline <command>
```

Run it from the **root of the user's project**. Below, `adp <command>` is
shorthand for that invocation — the person will usually have it aliased.

| Command | What it does |
|---|---|
| `status` | seven lights, one line each, plus ceremony/backlog/deferrals — start here, every session |
| `report [--html <path>] [--json]` | a portable viability snapshot: gates, ceremony, MVP/backlog, the recorded decision, the estimate if one exists — no server needed |
| `audit [--ci] [--strict] [--json]` | every gate, with the findings behind the first red one — `--strict` ignores `DEFERRALS.md` and shows the real state |
| `gates [--list]` | the gates and their state, without the findings |
| `prompt [<gate>]` | the paste-ready text for a red gate |
| `verify [--background]` | **run the tests and record what they prove** |
| `verify --status` | how a background verification is doing |
| `trust [--revoke]` | approve this project's test command for execution |
| `plan` | the execution lanes, without running anything |
| `run [--lane <id>]` | execute pending tasks in isolated git worktrees |
| `rerun <lane>` | re-run one lane, leaving merged work alone |
| `clean [--force]` | remove worktrees whose work is already merged |
| `resume` / `checkpoint --note "<s>"` | where the work stands, at the start of a session / what to remember for the next one |
| `monitor [--port <n>]` | a read-only page showing gates and progress |
| `init [--brownfield] [--shell-alias]` · `new <feature> [--signals <list>]` | scaffold a project (`--brownfield` adopts an existing one, read-only) · scaffold a feature (only the documents its ceremony level needs) |
| `new --rfc <slug>` | a new global decision record at `.spec/rfc/RFC-<NNN>-<slug>.md` |
| `profile [--stack] [--familiarity] [--app-type] [--brownfield] [--tests]` | declare the stack/team profile `estimate` reads |
| `estimate [--pf <n>] [--csv]` | hours = a PF count × the profile's table row — declared with `--pf`, or from a confirmed count; never proof |
| `estimate --review` / `--confirm [--yes]` | show the draft count / lock it in — only a human confirms |
| `close --hours <n> [--note]` | record what a feature actually took; recalibrates the table row from cross-project history |
| `metrics import <file>` / `export [--csv]` | move the shared, anonymized calibration history between machines or teams |
| `upgrade [--apply] [--only-migrations]` | compare the installed payload against the version currently running; dry-run unless `--apply` |
| `doctor` | verify this copy of the tool against its manifest |

**The exit code is the failing gate.** `0` clean, `1`–`7` for G0–G6. You never
have to parse output to learn where you are. A gate reading `n/a` never sets
the exit code — it means the ceremony matrix decided that gate isn't due, not
that it passed.

**Graceful degradation.** If Node is not available, do the audit by hand — re-read
the documents against the finding catalogue below — and label the result, in
writing, as **`WEAK PROOF (manual audit)`**. Never present a manual reading as if
it were the mechanical gate.

## The ceremony matrix — not every feature owes the same documents

A one-line config tweak and a payment-flow redesign do not owe the same
paperwork. A PRD's `> signals:` line declares which of five things are true
about it:

| Signal | What it means |
|---|---|
| `multiple-teams` | the decision affects more than one team |
| `hard-to-reverse` | expensive or risky to undo |
| `money-or-pii` | payment or personal data involved |
| `new-tech` | the team hasn't shipped on this stack before |
| `large-estimate` | big enough that `adp estimate`'s threshold would flag it (today, declared by hand — auto-computation is not built yet) |

The level is **computed**, never written by hand: `money-or-pii` → full chain,
reviewed; `multiple-teams` (without money/PII) → RFC required, then DESIGN;
any one softer signal alone → a light DESIGN, no RFC; none declared → SPEC and
tasks direct, no RFC, no DESIGN. `adp new <feature> --signals <list>`
scaffolds only what the computed level needs; `adp status` and `adp report`
both show the level and which signals lit it — never just the verdict, always
the reasoning behind it.

## Every open question declares its door — `Q-xxx`'s `Door:` field

You cannot judge whether a decision is cheap to reverse; you can make sure
someone was asked. Every `Q-xxx`, answered or not, must carry `Door:
one-way` or `Door: two-way`:

```markdown
- **Q-005** — Which cache backend? *(status: open, Door: one-way)*
```

`Door: one-way` (irreversible, or expensive to undo) plus `status: open` is
`RFC_REQUIRED` — write a real RFC, don't leave it a guess. `Door: two-way`
(cheap to reverse) can stay open or close in the question's own prose; no
RFC owed. The field missing at all is `DOOR_UNDECLARED`, unconditionally —
the same posture `STATUS_INVALID` already takes toward a missing status.
**Never assign a door on the person's behalf when it changes what is
owed** — ask, the same rule as every other judgment call this document
reserves for the human.

## A decision can opt into a scored structure — `Decision criteria`/`Options considered`

The default RFC shape (alternatives, a chosen one) is enough most of the
time. A decision that is genuinely close can opt into weighted criteria and
a scoring matrix instead, declared by the decision itself, never inferred:
`**Decision criteria:** W-001, W-002` (ids from `SCOPE.md`'s `## 11.
Decision criteria`, weights summing to 100), `**Options considered**` with
`- **OPT-xxx — Name.** Requires: <tag>` bullets (at least 3, including
`OPT-000` for "do nothing"), a `**Scoring matrix**` table, and a
`**Recommendation:** OPT-xxx — reason.` Only a decision carrying one of
those two markers reaches the stricter checks: `CRITERIA_AFTER_OPTIONS`
(order, completeness, the matrix has no gaps), `RECOMMENDATION_AGAINST_SCORE`
(a recommendation off the top score needs real justification prose, not
silence), `CONTEXT_NUMBER_WITHOUT_SOURCE` (a number in an option's own
prose with nothing backing it), and `OPTION_BEYOND_TEAM` (an option's
`Requires:` names a capability `adp profile --capabilities <list>` never
declared — this also auto-lights the `new-tech` ceremony signal). Every
decision written before this stays exactly as it was; opting in is a choice
made once, by the decision, not a retrofit.

## The MVP boundary, and `BACKLOG.md`

Every PRD that exists must be named in `SCOPE.md`'s "MVP (prioritized)"
checklist — `- [ ] <feature-slug> — description`, slug first. A PRD that
exists but isn't named there is `PRD_UNPLACED` (G1): there is no third state
between "building this now" and "not yet." What hasn't started belongs in
`.spec/BACKLOG.md` instead — plain prose, one item per line, deliberately
carrying **no tracking code**; only a promoted PRD earns one. An item that
already looks like a real code (`AC-002`, `T-003`, ...) is
`BACKLOG_ITEM_WITH_CODE`, a warning — it would otherwise be free to claim
progress the audit can't see. To promote an item: remove its line, run
`adp new <feature-slug>`, add the slug to the MVP checklist. No dedicated
command exists for this — three ordinary actions are enough.

`SCOPE.md` also carries `**Decision:** pending|go|no-go` — the recorded
answer to "do we build this?", read by `adp report`. It is purely
declarative: no gate checks it, and `no-go` refuses nothing. If the answer
is "use another tool," the documents written up to that point are still the
person's — that is the point of writing them first.

## Adopting an existing project

`adp init --brownfield` recognizes a codebase that already exists instead of
auditing it as if it were new. It scans for `README*`, `docs/**`, `adr/**`,
`rfc/**`, `wiki/**`, OpenAPI/Swagger specs, migrations, `CHANGELOG*` and
`CONTRIBUTING*`, and prints what it found — **nothing is moved or
rewritten**. It writes `.spec/BASELINE.md`: the commit and the pre-existing
source files at adoption time.

A finding tied to a baselined file stays a **warning**, exempt from `--ci`
escalation, for as long as that file is untouched since the recorded commit —
touch it again (even uncommitted), or map it with a task, and it owes the
same full-strength check as any new file. This is what keeps a legacy
repository's first `adp audit` **legible** instead of a wall. The
**archaeologist** role reads the recognition inventory and the code and
proposes a `Draft` `SCOPE.md`, every claim cited — invoke it once, right
after `--brownfield`, never for a project born with this tool. `adp archive`
does the archiving itself, on its own explicit consent gate, separate from
`init`: copies the recognized documentation into `project_old_artifacts/`
by default, or moves it via `git mv` under `--move`. Refuses outside a git
repository or on a dirty tree, in either mode, with no override; `README.md`/
`LICENSE`/`CONTRIBUTING.md`/`SECURITY.md`/`CODE_OF_CONDUCT.md` (by basename)
and anything a CI workflow references always stay copied. Dry-run by
default — show the human that output before ever suggesting `--apply`.

## Living with a real finding on purpose — `DEFERRALS.md`

Not every real finding gets fixed today, and the honest answer is neither
"block everything" nor a hidden switch that turns a gate off. `.spec/DEFERRALS.md`
records a **dated, owned decision** instead:

```markdown
## DEF-001 — legacy suite leaves with the billing migration

- Finding: TEST_ORPHAN
- Scope: test/legacy/**
- Owner: alice
- Reason: the old suite leaves with the billing migration
- Opened: 2026-08-05
- Until: 2026-11-03
```

`Scope:` is a glob against the finding's file, or an exact match against a
fileless finding's feature name. Renewing appends a **second** `Until:` line
to the same block — never an edit of the first one; the last line is always
the active deadline. **Never write an entry yourself unless asked** —
`Owner:` names a real person who answers for the debt, the same rule that
keeps you from confirming an estimate or approving `adp trust` on the
person's behalf.

Only findings that describe the world changing under a document (G5/G6) are
eligible, and ten of those — proof, and decisions nothing should route
around — never are, regardless of scope. A `Scope:` too broad
(`DEFERRAL_TOO_BROAD`), an `Until:` too far out (`DEFERRAL_TOO_LONG`), a
missing `Owner:`/`Reason:`/`Until:`, or a third renewal of the same entry
(`DEFERRAL_RENEWED_REPEATEDLY`, a warning — that debt is accepted now, not
deferred, and belongs in `BASELINE.md` or `BACKLOG.md` instead) each earn
their own finding. An expired `Until:` returns the finding to full severity
on its own. `--ci` still honors a valid deferral; `adp audit --strict`
ignores `DEFERRALS.md` entirely — reach for it when asked for the real,
undeferred state.

## Proof comes from `verify`, and from nothing else

This is the part most agents get wrong, so it is stated on its own.

`audit` **reads** documents and tests. It can see that a criterion has a test
annotated `@spec:AC-xxx`. It cannot see whether that test passed — nothing in a
document can tell it that. Proof is written by **`adp verify`**, which runs the
project's test command, extracts the result of each test, matches titles to
criteria, and records what actually passed.

```sh
adp verify        # runs the tests, writes .spec/verification/<feature>.json
adp audit         # now G5 can be green
```

Until `verify` has run, every criterion reports `AC_WITHOUT_PROOF` — *has a test, but
no PASS proof*. That finding is not a bug and not something to work around: it
means nobody has run the tests through the engine yet.

**The first `verify` will be refused, and that is correct.** The test command
lives in the project's config, which is a file in the repository — running it is
executing code that came from a repo. The engine refuses until a human has read
that exact command and approved it:

```sh
adp trust         # shows the command, asks for confirmation
```

**Never approve on the person's behalf and never reach for `--yes` to get past
it.** Show them the command, explain that approving binds to that exact text, and
let them answer. If the command later changes, approval is void by design — say
so rather than re-approving.

If the suite takes minutes, use `adp verify --background` and follow it with
`adp verify --status`. The verdict is identical either way.

## Estimation — hours from a Function Point count, never proof

`adp profile` declares the stack/team profile once (rerunnable);
`adp estimate [--pf <n>]` multiplies a PF count by that profile's row in
`.spec/metrics/hours-per-fp.json` (seeded at `init`, hand-editable) and
writes `.spec/ESTIMATE.md`. `adp report` shows the range once one exists.

**The PF count comes from `--pf <n>` by hand, or from counting and
confirming.** `--pf` stays the fast path for a feature too small to bother
formally counting. The fuller loop, now built: you write
`.spec/metrics/count-draft.json` yourself — one entry per counted function
(`{ name, type: ALI|AIE|EE|CE|SE, complexity: low|medium|high, source:
"<the PRD.md/SCOPE.md line that justifies it>" }`) while reading the PRD —
then `adp estimate --review` shows the draft and its PF total without
recording anything, and **only a human's `adp estimate --confirm`** locks
it in as `count-confirmed.json`, attributed to their `git config` identity.
`adp estimate` then uses that total automatically. An entry with no
`source` is excluded from the total and reported, never silently dropped
or silently counted.

**Never present any of this as proof, and never confirm a count on your own
authority** — propose the draft, show `--review` to the human, let *them*
run `--confirm` (or explicitly tell you to pass `--yes`, the same rule as
`adp trust` and `adp run`). Complexity is a judgment call you cite, not a
formula this version derives from DET/RET/FTR counts. When the app type is
`real-time`/`infra`/`mathematical`, the tool prints a caveat that Function
Point analysis measures those poorly — repeat it to the person, don't drop
it silently.

**`adp close --hours <n> [--note "<s>"]`** closes the loop once a feature
actually ships — the one field nothing else can supply, declared after the
fact, never as a target. It recalibrates the profile's table row from
**cross-project history**: `hours-history.jsonl`, kept in the state
directory outside any repository (or at `config.metrics.historyPath` for a
team-shared location), so a fourth project starts where the first three
left off instead of every project beginning at cold start. The shared
record never carries a project, feature or person name — only a profile,
PF, hours, the derived h/PF, a deviation percentage, and a hash for dedup —
"nada disso é necessário para calibrar." `adp metrics import <file>` /
`adp metrics export [--csv]` move it between machines or teams; an
imported record is always marked `imported: true`, regardless of what the
file claims. `adp close` and `adp estimate` both print a composition line
when observations exist (`N observations — M from this project, K other`).
Not built this version: per-observation human/agent hour breakdown, ledger
corroboration on each record, and `adp estimate --history`'s retrospective
accuracy report — don't imply any of them exist.

## Running work in the background

For a `SPEC.md` with several pending tasks, the engine can run them in
parallel, each in its own git worktree:

```sh
adp plan          # shows the lanes — read this before running anything
adp run           # asks for confirmation, then executes
adp rerun lane-02 # one lane again, leaving merged work untouched
```

Tasks whose `Files:` lists overlap land in the same lane and run in order;
disjoint tasks run at the same time. A task that declares no files is never
parallelized — that is the file list earning its keep.

`Files:` is what a task WRITES. Use `Reads:` for a file it only reads, which costs
no parallelism, and `Depends on: T-001` to say it runs after another task. Ordering
cannot be inferred from file overlap, because overlap is symmetric and "after" is
not — and a lane is branched from HEAD, so a file you only read is the pre-run
version until you declare the dependency.

After each task commits, the pipeline runs the project's approved test command
inside that lane and stops the lane if it fails, so a broken test belongs to the
task that broke it. That uses the consent `adp trust` already recorded; it grants
the agent nothing. `--no-lane-tests` turns it off for a suite too slow to run
after every task.

`adp run` invokes an AI that writes code and whose work gets committed. Show the
person `adp plan` first and let them start it. It refuses on a dirty working
tree, outside a git repository, and without a terminal to confirm at.

## Commands to offer, not to run unprompted

`adp monitor` serves a **read-only** page on loopback showing the seven gates, the
findings behind the first red one, and each feature's progress. Offer it when the
person is trying to see where things stand across several features — it is easier
to read than repeated `status` calls. It has no write endpoints and cannot change
their project. It holds a terminal until stopped, so suggest it rather than
starting it in the middle of other work.

`adp report --html <path>` is the offer when the person wants a document to
hand to someone else, or wants to weigh viability before committing to code —
it needs no running server and no other tool installed to open.

`adp doctor` checks that this copy of the tool matches the manifest shipped with
it. Reach for it when something behaves impossibly — a command that vanished, a
skill file that does not match its documentation — before assuming the person's
project is at fault.

## Non-negotiable rules

1. **Every acceptance criterion becomes a test whose title carries `@spec:AC-xxx`.**
   Without the annotation, the criterion does not exist for the machine.
2. **The test runner decides whether a criterion passed — never you.** You cannot
   declare victory. **A skipped test is not proof**, and the audit says so.
3. **`adp verify` is what grants proof.** A test that exists is not a test that
   passed. Run verify before you claim anything, and never mark a task
   `[done]` on a criterion the engine has not recorded as proven.
4. **Never approve the test command for the person.** `adp trust` shows them what
   will execute; that decision is theirs, and `--yes` is not yours to use. The
   same goes for `adp estimate --confirm` — you propose the count, only they
   confirm it.
5. **The feature closes when `adp audit --ci` exits 0.** Running it and pasting
   the output is the last step, always.
6. **Assumptions and open questions are mandatory.** Filled a gap without
   confirming? That is an assumption. Missing information? That is an open
   question. If there are truly none, write "None." and be suspicious of yourself.
7. **A decision without at least two alternatives is not a decision.** Write down
   what you rejected and why, or the RFC gate stays red — and only write an RFC
   at all when the ceremony matrix says one is due.
8. **The constitution rules.** `[MUST]` principles are executed. Never fix the
   principle to make the check pass — fix the code.
9. **Never weaken, skip or delete a test to go green.** If the same finding
   survives **three attempts**, STOP and bring the findings to the person. Do not
   iterate forever and do not route around the gate.
10. **A PRD is never presence alone.** It must be named in `SCOPE.md`'s MVP
    checklist, or it is `PRD_UNPLACED` — nothing exists in limbo.
11. **`adp estimate`'s number is a PF count times an editable table, never
    proof.** The count itself is either declared by hand (`--pf`) or
    proposed by you and confirmed by a human (`--review`/`--confirm`) —
    never confirmed by you, and never presented as anything more certain
    than a declared, editable estimate. Say so every time you show it.

## Working the flow

**Start every session by asking the machine where you are:** `adp status`. Seven
lights come back. Work on the **first red one** — the ones after it are `blocked`,
not broken, and fixing them first is wasted effort. A light reading `n/a` is not
broken either — the ceremony matrix decided that document isn't due.

**G0 — Scope.** `.spec/SCOPE.md` must say `Approved`. Not approved means the work
has not been agreed. Do not start; go get the agreement. While you're there, the
feature's slug belongs in the MVP checklist and the ceremony signals — if any —
belong on the PRD.

**G1 — PRD.** One `PRD.md` per feature in `.spec/features/<name>/`, **prose
only** — what, for whom, why. No stories, no criteria, no technology; those
belong to `SPEC.md` and `RFC.md`. A PRD that names a database or a framework
has drifted into being a spec in disguise.

**G2 — RFC.** Due only when the ceremony level says so (`rfc-first`/`full`) —
otherwise this gate reads `n/a` and there is nothing to write. When it is due:
for each real decision, record the alternatives considered, the one you chose,
why, and what it costs, in a global `RFC-<NNN>-<slug>.md` (`adp new --rfc
<slug>`), linked from the PRD's `rfcs:` line. Register every assumption and
open question with an honest status — in `SPEC.md`, not here.

**G3 — DESIGN.** Due at every level except the lightest — otherwise `n/a`.
Presence-only: the technical blueprint a human reads, no grammar of its own
beyond existing.

**G4 — SPEC.** Write the user stories and, for each one, acceptance criteria
in Given/When/Then — a criterion must be observable, something a test
asserts. Break the work into tasks: `Refs:` (the stories and criteria it
serves), `Files:` (what it WRITES, comma-separated), optionally `Reads:` and
`Depends on:`. A task with no file list is never parallelized.

**Implementation.** One task, one atomic commit whose message names the task.
Update the status in `SPEC.md` as you go: `[pending]` → `[in-progress]` →
`[in-test]` → `[done]`.

`[in-test]` is the honest resting place: implemented, proof not yet granted.
Moving to `[done]` without proof is `TASK_DONE_WITHOUT_PROOF`, an error, and
the audit will catch you. This is the rule the whole product rests on — you do not
get to declare a task done.

**G5 — proof.** Run `adp verify`. It executes the test command and records which
criteria actually passed. Skipped, pending and todo all count as **not proven**;
a skip tells you nothing. Only now can `[done]` be honest.

**G6 — aligned.** Run `adp audit --ci`, paste the output, translate it in one
sentence. If it did not exit 0, it is not done.

## Explain yourself as you go

After **every** action, say in plain words: what you did, the path of every file
you created or changed, and what comes next. The person should never have to ask
"where is the file?" or "what now?".

Mirror the tasks in whatever native task list your harness offers, and keep the
status current — that is how the person follows along without asking.

When you run an engine command, paste the raw output (that is the proof) **and**
summarize it in one to three sentences. Never hand over the raw output alone.

If the person clearly knows the flow — uses the codes, asks for commands directly —
drop the tutoring and get to the point. The explanation shortens; the rigour never
does.

## What the audit reports

Use the readable name when you talk. The code in parentheses is for pipelines.
It is English and it **never changes with the reader's language** — a pipeline
grepping for it must find the same string on every machine.

| Finding (code) | What it means | What to do |
|---|---|---|
| scope document missing (`SCOPE_MISSING`) | there is no `.spec/SCOPE.md` | run `adp init`, then fill it in |
| scope not approved (`SCOPE_NOT_APPROVED`) | work was not agreed | get the approval before coding |
| required scope field empty (`SCOPE_FIELD_EMPTY`) | the scope is a template, not an agreement | fill the field it names |
| PRD missing (`PRD_MISSING`) | a feature has no `PRD.md` | `adp new <feature>` creates it |
| duplicate traceability code (`ID_DUPLICATE`) | the same code defined twice | codes are unique across the WHOLE project |
| traceability code too short (`ID_TOO_SHORT`) | `AC-1` instead of `AC-001` | codes are zero-padded to three digits |
| unrecognized ceremony signal (`SIGNAL_UNKNOWN`) | `> signals:` names something not in the five | use one of the five recognized slugs |
| PRD not declared in the MVP boundary (`PRD_UNPLACED`) | the PRD exists but isn't in `SCOPE.md`'s MVP checklist | add `- [ ] <slug>` there |
| PRD names a technical solution (`PRD_WITH_SOLUTION`) | a database, framework or library name in `PRD.md` | describe the problem, not the technology — that belongs in the RFC or DESIGN |
| backlog item carries a real tracking code (`BACKLOG_ITEM_WITH_CODE`) | a `BACKLOG.md` line looks like a declared criterion | remove the code, or promote it to a real PRD |
| RFC missing (`RFC_MISSING`) | this feature's ceremony level requires one and it's absent, or the `rfcs:` link doesn't resolve | `adp new --rfc <slug>`, then link it |
| question does not declare whether it is a one-way or two-way door (`DOOR_UNDECLARED`) | a `Q-xxx` has no `Door:` field, answered or not | add `Door: one-way` or `Door: two-way` — ask the person if genuinely unsure |
| a one-way-door question is still open with no RFC (`RFC_REQUIRED`) | `Door: one-way` and `status: open` together | write a real RFC — this decision is too costly to reverse to leave as a guess |
| scored decision structure is malformed (`CRITERIA_AFTER_OPTIONS`) | criteria declared after options (or a matrix with none), too few options, no `OPT-000`, or a gap in the matrix | fix the order, add the missing option, or fill the gap |
| recommendation contradicts the score with no justification (`RECOMMENDATION_AGAINST_SCORE`) | the recommended option isn't top-scored, and no reason is given | either recommend the top score, or write the reason for departing from it |
| numeric claim in an option with no cited source (`CONTEXT_NUMBER_WITHOUT_SOURCE`) | a figure inside an option's own prose, nothing backing it | cite the source, or drop the number |
| option requires a capability the team profile does not declare (`OPTION_BEYOND_TEAM`) | an `OPT-xxx`'s `Requires:` names something `adp profile --capabilities` never declared | declare the capability if the team has it, or budget for the learning curve |
| RFC context has no measurable figure (`CONTEXT_WITHOUT_NUMBERS`) | the prose before the first decision is an impression, not evidence | ground it in a number |
| decision without alternatives (`DECISION_WITHOUT_ALTERNATIVE`) | a habit, not a decision | record what you rejected |
| decision without a chosen option (`DECISION_WITHOUT_CHOICE`) | alternatives listed, none picked | say which one, and why |
| option propped up with weak or missing cons (`STRAW_OPTION`) | a `create-rfc`-dialect option next to a favorite has no cons, or far fewer than it | give the option real, comparable drawbacks — or drop it |
| no option considers not doing this (`OPTION_DO_NOTHING_MISSING`) | every alternative assumes action; none names "do nothing" | add one, even if it's rejected in the same breath |
| DESIGN missing (`DESIGN_MISSING`) | this feature's ceremony level requires one and it's absent | write `DESIGN.md` |
| SPEC missing (`SPEC_MISSING`) | a feature has no `SPEC.md` | `adp new <feature>` creates it |
| SPEC has no user story (`SPEC_WITHOUT_US`) | a SPEC with nothing in it | write the stories |
| user story without acceptance criterion (`US_WITHOUT_AC`) | a story nobody can check | write its criteria |
| incomplete acceptance criterion (`AC_INCOMPLETE`) | missing Given, When or Then | complete the clause it names |
| criterion reads like a feeling (`AC_NOT_OBSERVABLE`) | a vague adjective ("fast", "simple") with no number a test could check | give it a number |
| criterion outside any story (`AC_OUTSIDE_US`) | a criterion serving nothing | move it under its story |
| acceptance criterion covered by no task (`AC_WITHOUT_TASK`) | a requirement nobody will build | add or extend a task |
| broken reference (`REF_BROKEN`) | a task cites something that does not exist | fix the reference |
| task references no criterion (`REF_WITHOUT_AC`) | refs resolve, but none is an AC — proof is impossible | reference at least one AC |
| task without declared files (`TASK_WITHOUT_FILES`) | cannot be parallelized | declare the files it touches |
| invalid task status (`TASK_STATUS_INVALID`) | not one of the four words | `pending` · `in-progress` · `in-test` · `done` |
| task maps a file that does not exist (`FILE_MISSING`) | declared but unwritten | expected while pending; an error once `[done]` |
| blocking question still open (`Q_BLOCKING_OPEN`) | the path cannot be chosen yet | ask the person |
| assumption or question without a code (`ASM_WITHOUT_CODE`) | written as prose, unreferenceable | code it `ASM-001` / `Q-001` |
| required section missing (`SECTION_MISSING`) | no Assumptions or no Open questions section | add it; "None." is a valid answer, silence is not |
| invalid status (`STATUS_INVALID`) | not `open`/`confirmed`/`invalidated`/`answered` | use the exact word, no markdown around it |
| acceptance criterion without a test (`AC_WITHOUT_TEST`) | a requirement with no proof | write the test with `@spec:AC-xxx` in its title |
| acceptance criterion without proof (`AC_WITHOUT_PROOF`) | the test exists but never passed, or was SKIPPED | run verify; a skip is never proof |
| proof is out of date (`PROOF_STALE`) | code moved after the last proof | `adp verify` again |
| weak proof (`PROOF_WEAK`) | proven only by the runner's global exit code | configure a per-test reporter |
| orphan test (`TEST_ORPHAN`) | a test points at a criterion that is gone | the spec moved and the test did not — reconcile them |
| task completed without proof (`TASK_DONE_WITHOUT_PROOF`) | `[done]` with unproven criteria | verify, or reopen the task |
| open assumption (`ASM_OPEN`) | a guess in a feature declared done | confirm or invalidate it with the person |
| open question (`Q_OPEN`) | a decision still owed | answer it, or accept a red `--ci` |
| principle without executable verification (`PRINCIPLE_WITHOUT_VERIFICATION`) | a MUST nothing checks | give it a verification, or lower its level honestly |
| principle violated (`PRINCIPLE_VIOLATED`) | the constitution was broken | fix the code, never the principle |
| invalid principle level (`LEVEL_INVALID`) | not MUST, SHOULD or MAY | use one of the three |
| verification matches no file (`GLOB_WITHOUT_FILES`) | the check is inert | fix the glob — a check that cannot fail looks like one that passed |
| malformed verification (`VERIFICATION_MALFORMED`) | invalid regex, or one that timed out | simplify the pattern |
| source file mapped by no task (`FILE_ORPHAN`) | code nothing asked for | map it to a task, or question why it exists |
| a file removed from the baseline is back (`BASELINE_WIDENED`) | `BASELINE.md`'s own git history shows a file that left the ratchet and returned | give it a fresh, honest baseline entry never happens by re-adding the old one — live with it at full strength instead |
| document is over its length ceiling (`DOC_TOO_LONG`) | `PRD.md`/`DESIGN.md` past its configured line ceiling | split it, or move detail to where it belongs |
| document is older than the code it describes (`DOC_FOSSIL`) | `DESIGN.md` predates the newest file its tasks map | update it — a document that lies is worse than none |
| substantial prose repeated across documents (`DUPLICATE_PROSE`) | a feature's own `PRD.md`/RFC/`DESIGN.md` share a near-identical passage | point at it from one document, don't copy it |
| deferral matches more findings than allowed (`DEFERRAL_TOO_BROAD`) | a `DEFERRALS.md` entry's `Scope:` covers more than `deferrals.maxMatches` findings | narrow the `Scope:`, or split it into several entries |
| deferral without an owner or a reason (`DEFERRAL_WITHOUT_OWNER`) | missing `Owner:` or `Reason:` | ask the person who owns the debt to fill it in — never you |
| deferral without an `Until:` date (`DEFERRAL_WITHOUT_DEADLINE`) | no deadline at all | add one, or the finding is effectively deleted |
| deferral deadline beyond the allowed ceiling (`DEFERRAL_TOO_LONG`) | `Until:` is further out than `deferrals.maxDays` from today | pick a nearer date; renew later instead |
| deferral of a finding that cannot be deferred (`DEFERRAL_NOT_ELIGIBLE`) | the `Finding:` code is outside G5/G6, or on the never-deferrable list | it cannot be deferred at all — fix the underlying finding |
| deferral past its deadline (`DEFERRAL_EXPIRED`) | the active `Until:` is in the past | the finding is back at full severity; renew or fix it |
| deferral renewed three times or more (`DEFERRAL_RENEWED_REPEATEDLY`) | the same entry keeps getting a new `Until:` line | that is acceptance, not deferral — move it to `BASELINE.md`/`BACKLOG.md` |
| feature name diverges from its directory (`FEATURE_MISMATCH`) | the header and the folder disagree | make them match |
| project could not be read (`PROJECT_INVALID`) | a document failed to parse | the message names the file |

## Questions the engine answers for you

"Which requirement has no test?" → `adp audit` → `AC_WITHOUT_TEST`.
"Which test maps to no requirement?" → `TEST_ORPHAN`.
"Which code serves no requirement?" → `FILE_ORPHAN`.
"Which principle is decoration?" → `PRINCIPLE_WITHOUT_VERIFICATION`.
"Which criteria are actually proven?" → `adp verify` → the proof record.
"Which proof went stale?" → `PROOF_STALE`.
"How much ceremony does this feature need?" → `adp status` / `adp new --signals`.
"Is anything unaccounted for?" → `PRD_UNPLACED`.
"What can run in parallel?" → `adp plan`.
"Where are we?" → `adp status`.
"Is this worth building, and can I hand the answer to someone else?" → `adp report --html <path>`.
"What do I send back to fix this?" → `adp prompt`.

## The golden rule

If you are about to say "done", run `adp verify` and then `adp audit --ci`, and
paste the output. If it did not exit 0, it is not done.

Both, in that order. `audit` alone can only tell you a test exists; `verify` is
what makes it a test that passed. Here, "done" is something a machine verifies —
not a sentence you wrote.
