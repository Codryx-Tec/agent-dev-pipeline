# AGENTS.md — Rules for AI Agents

> Read before any task. All `.md` output in English. **Never translate engine
> tokens** — finding codes (`AC_WITHOUT_TEST`, `AC_WITHOUT_PROOF`,
> `TASK_DONE_WITHOUT_PROOF`, `PRINCIPLE_WITHOUT_VERIFICATION`) and task statuses
> (`[pending]`, `[in-progress]`, `[in-test]`, `[done]`) are the
> machine's vocabulary, not prose. Talk to the human in their own language.

## Core loop

Start every session with `adp status`. Seven lights come back. Work on the
**first red one** — the ones after it read `blocked`, not broken, and fixing
those first is wasted effort.

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ code ──▶ verify ──▶ audit
  G0      G1      G2       G3         G4                 G5        G6
```

`PRD.md` is prose only — what, for whom, why. `RFC.md` owns `D-xxx` decisions.
`SPEC.md` is where `US-xxx`, `AC-xxx`, `ASM-xxx`, `Q-xxx` and `T-xxx` all
live now — it is the layer the machine confers. `DESIGN.md` (formerly called
TDD in older projects) is the technical blueprint a human reads; it has no
grammar of its own beyond existing.

| Gate | Passes when |
|---|---|
| G0 | `.spec/SCOPE.md` says `Approved` |
| G1 | the PRD exists, its `feature:` line matches its directory, and it is named in `SCOPE.md`'s MVP checklist |
| G2 | every decision records ≥2 alternatives and a chosen one — `n/a` below rfc-first ceremony |
| G3 | the DESIGN document exists — `n/a` at light ceremony |
| G4 | every story owns a criterion, every criterion has Given/When/Then, every criterion is covered by a task, every reference resolves, no blocking question is open |
| G5 | every criterion has a test that PASSED (a skip is never proof) |
| G6 | documents, code and constitution still agree |

**The exit code is the failing gate**: `0` clean, `1`–`7` for G0–G6. Never parse
output to find out where you are. `n/a` never sets the exit code — G4, G5 and
G6 are evaluated regardless of what G2/G3 read.

### The ceremony matrix decides what G2 and G3 are actually due

Not every feature owes the same four documents. A PRD's `> signals:` line
declares which of five things are true — `multiple-teams`, `hard-to-reverse`,
`money-or-pii`, `new-tech`, `large-estimate` — and the level is *computed*
from that, never written by hand: money or PII means the full chain; a
cross-team open decision means RFC-first; any one of the three softer
signals alone means a light DESIGN; none declared means SPEC and tasks
direct, no RFC, no DESIGN. `adp new <feature> --signals <list>` declares
signals and scaffolds only what that level needs; `adp status` shows the
level and signals per feature. Getting this wrong costs a re-read, not a
rewrite — edit the `signals:` line and re-audit.

### Every open question declares its door

The machine cannot tell whether a decision is cheap to reverse. It can tell
whether anyone was ever asked, so every `Q-xxx` — answered or not — must
carry `Door: one-way` or `Door: two-way`:

```markdown
- **Q-005** — Which cache backend? *(status: open, Door: one-way)*
```

`Door: one-way` (irreversible, or expensive to undo) plus `status: open` is
`RFC_REQUIRED` (G2, error) — a decision this costly to get wrong needs a
real RFC, not a guess left open. `Door: two-way` (cheap to reverse) can stay
open or get answered in the question's own prose; no RFC is owed. The field
missing entirely is `DOOR_UNDECLARED` (G2, error), regardless of status —
silence on reversibility is exactly the loophole this closes. **Never guess
a door on the person's behalf when it materially changes what is owed** —
if genuinely unsure, ask, the same rule as everything else this file marks
as the human's call alone.

### Every PRD is in the MVP or nowhere at all

A PRD sitting outside `SCOPE.md`'s "MVP (prioritized)" checklist is
`PRD_UNPLACED` (G1) — there is no third state between "building this now"
and "not yet." Each checklist line names the feature by its slug first —
`- [ ] <feature-slug> — description` — and checkbox state tracks delivery,
not membership. What hasn't started yet belongs in `BACKLOG.md` instead:
plain prose, one item per line, deliberately carrying no tracking code —
only a promoted PRD earns one. An item that already looks like a real code
(`AC-002`, `T-003`, ...) is `BACKLOG_ITEM_WITH_CODE`, a warning: it would
otherwise be free to claim progress the audit can't see. To promote an
item: remove its line, run `adp new <feature-slug>`, add the slug to the
MVP checklist.

### `adp report` — a portable snapshot, before committing to code

`adp report` prints (or, with `--html <path>`, writes as one self-contained
file) what the engine already knows: gate states, ceremony per feature, MVP
placement, backlog size — no server required, unlike `adp monitor`. It also
reads `**Decision:**` from `SCOPE.md` (`pending`/`go`/`no-go`), the recorded
answer to "do we build this?" Purely declarative: no gate checks it, and a
`no-go` refuses nothing — the documents already written stay useful on
their own, including to a different tool.

### `adp estimate` — hours, from a Function Point count

`adp profile [--stack <s>] [--familiarity never|delivered|master] [--app-type
business-crud|real-time|infra|mathematical] [--brownfield] [--tests]`
declares the stack/team profile once (rerunnable); `adp estimate [--pf <n>]
[--csv]` multiplies a PF count by the profile's row in
`.spec/metrics/hours-per-fp.json` (seeded at `init`, hand-editable) and
writes `.spec/ESTIMATE.md`. `adp report` shows the result once one exists.

**The PF count comes from one of two places — declared by hand, or counted
and confirmed.** `--pf <n>` is the direct declaration: fastest, and fine for
a feature small enough that formal counting is overkill. The fuller loop is
`SCOPE-0.6.0.md` PRD-003's own design, now built: **you** (the agent)
propose the count, citing evidence, and a **human** confirms it before
anything is recorded.

1. Write `.spec/metrics/count-draft.json` yourself, one entry per counted
   function while reading the PRD/SCOPE: `{ "name", "type":
   ALI|AIE|EE|CE|SE, "complexity": low|medium|high, "source": "<the exact
   PRD.md/SCOPE.md line that justifies this classification>" }`. `ALI`/`AIE`
   are data functions, `EE`/`CE`/`SE` are transactional. **The complexity
   band is your judgment call, not a formula** — this version does not
   derive it from CPM's DET/RET/FTR counts; the citation is what makes the
   judgment call accountable, not a computation.
2. `adp estimate --review` shows the draft and its PF total, without
   recording anything. **Show this to the human before confirming anything**
   — that is the entire point of the two-step split.
3. Only the human's `adp estimate --confirm` (or your `--yes` **after** they
   said so, never on your own authority) locks it in as
   `.spec/metrics/count-confirmed.json`, attributed to whoever's `git
   config user.name`/`user.email` confirmed it. `adp estimate` then uses
   that total automatically.

**An entry with no `source` is excluded from the total and reported, not
silently dropped and not silently counted** — the engine's version of
`FUNCTION_WITHOUT_SOURCE`. None of this is a gate: like `adp report`'s
decision field and `adp close`, the whole family is declarative, never
enforced, never escalated under `--ci`. **Never claim `adp estimate`'s
output is proof, and never confirm a count on your own authority** — same
rule as `verification(gate)` in the constitution: declare, do not fabricate.
When `appType` is `real-time`/`infra`/`mathematical`, say so: Function Point
analysis measures those poorly, and the tool already prints that caveat —
repeat it, don't drop it.

### `adp close` — closing the loop, so the table stops being a guess

Every row in `hours-per-fp.json` starts `source: "cold-start"` — a market
figure nobody here has confirmed. `adp close --hours <n> [--note "<s>"]`
records what a feature actually took and recalibrates the row `adp
estimate` last used toward it: 1 observation nudges the range gently, 3–5
blend the observed mean in and widen the bounds to fit, 6+ replaces the
row with this team's own numbers. **`--hours` is the one field nothing
else can supply** — declare it honestly, after the feature is actually
done, not as a target to hit. `--note` is stored on the closure record but
**not** auto-written into `.spec/BEST_PRACTICES.md` — that file only earns
an entry once a pattern has worked more than once, which a single closure
can never establish; add it there by hand if it turns out to be one.
`adp report` shows the resulting calibration label ("no calibration" /
"partial calibration" / "calibrated") next to the estimate.

### Cross-project history — a fourth project starts where the third left off

`adp close` writes two records now: the local `.spec/metrics/closures.jsonl`
entry (this project's own audit trail), and a minimal one into
`hours-history.jsonl` in the **state directory** — outside any repository,
shared by every project on the machine (or at `config.metrics.historyPath`,
for a team-shared location). **That shared file, not the local one, is what
actually recalibrates the table now** — "o histórico é a verdade; a tabela
é cache." `adp estimate` reads it too, before computing: a brand-new
project's *first* estimate can already come out calibrated if the shared
history has matching observations.

**The shared record never carries a project, feature or person name — by
construction, not by stripping it later.** Only a profile, a PF count, the
declared hours, the derived h/PF, a deviation percentage, and a
`projectHash` (a hash for dedup, never the literal path or name). "Nada
disso é necessário para calibrar" — the source document's own line — is
why the identifying fields are simply never written, which is a stronger
guarantee than writing them and stripping them at export.

`adp metrics import <file>` brings another team's exported records in,
forcing `imported: true` on every one regardless of what the file claims —
provenance is not the importer's to assert. `adp metrics export [<path>]
[--csv]` writes the shared file back out — already anonymous, so there is
no un-anonymized form to opt into. Both `adp close` and `adp estimate`
print a composition line when observations exist: `N observations — M from
this project, K other`, with `(J imported)` appended only when `J > 0`.

**Not built this version:** `actors[]` (human vs. agent hours) and
`corroboration` (calendar days, lanes, reruns, red gates from the ledger)
on each record; `adp estimate --history`'s retrospective cold-vs-calibrated
accuracy report; keeping identifying fields at all (no `--with-names`, since
nothing is ever written to strip). Don't imply any of these exist.

### The audit also catches document quality, not just structure

Passing G0–G6 proves a document exists and resolves — it never proved the
*decision* behind it was any good. All eight checks from the source
document are built now:

| Finding | Fires when |
|---|---|
| `PRD_WITH_SOLUTION` (G1) | the PRD names a technical solution (a database, a framework) — that belongs in the RFC or DESIGN, never the PRD |
| `CONTEXT_WITHOUT_NUMBERS` (G2) | an RFC's context has no measurable figure before its first decision — an impression, not evidence |
| `STRAW_OPTION` (G2, warning) | a `create-rfc`-dialect option has no declared cons, or cons far shorter than the favorite's — checked only when a favorite (⭐/Recommended) with real cons exists; the native dialect has no Pros/Cons structure to compare |
| `OPTION_DO_NOTHING_MISSING` (G2, warning) | no alternative or option is named "do nothing" / "status quo" — a plain warning in every mode, not the always-on error the source text specifies, since that would break every RFC this engine has ever produced retroactively, including the shipped `.exemplo/` example |
| `AC_NOT_OBSERVABLE` (G4) | a criterion reads like a feeling ("fast", "simple") with no number a test could check |
| `DOC_TOO_LONG` (G6, warning) | `PRD.md`/`DESIGN.md` is over its configured line ceiling (`docLengthLimits` in config) |
| `DOC_FOSSIL` (G6, warning, error in `--ci`) | `DESIGN.md` is older than the code it maps, past a tolerance window — the blueprint stopped describing reality |
| `DUPLICATE_PROSE` (G6, warning) | a substantial passage (≥25 words) repeats near-verbatim between a feature's own `PRD.md`, linked RFC(s) and `DESIGN.md` — "the documents point at each other, they don't copy" |

`PRD_WITH_SOLUTION`'s vocabulary lives in `.spec/PRD_VOCABULARY.json` (seeded
at `init`, editable) — false positives are expected on a generic word used
legitimately in business prose; prune the list rather than fighting the
finding.

### Adopting an existing project — `adp init --brownfield`

A four-year-old repository does not start from nothing, and the audit
should not treat it as if it did. `adp init --brownfield` adds two
read-only steps to normal `init` — nothing here moves or rewrites a file
of the user's:

- **Recognition.** Scans for `README*`, `docs/**`, `adr/**`, `rfc/**`,
  `wiki/**`, OpenAPI/Swagger specs, migrations, `CHANGELOG*`, and
  `CONTRIBUTING*`, and prints what it found. That inventory is the
  **archaeologist** role's starting point — invoke it next, and it
  proposes a `SCOPE.md` draft (always `Draft`, never `Approved`) with
  every claim cited to the file it came from.
- **`.spec/BASELINE.md`** records the commit and the pre-existing
  `srcGlobs` files at adoption time. A finding tied to one of those files
  stays a **warning** — it never escalates under `--ci` — for as long as
  the file is untouched since that commit; touch it again, or write a
  task that maps it, and it owes the same full-strength check as any new
  file. This is what keeps the first `adp audit` on a legacy codebase
  readable instead of a wall of `FILE_ORPHAN`.

**Not built yet:** the archiving step (`git mv` old documentation into
`project_old_artifacts/`) and `BASELINE_WIDENED` (catching an attempt to
re-grow the baseline after it shrinks) — both named in `.spec/BACKLOG.md`.
Don't imply either exists.

### Living with a real finding on purpose — `DEFERRALS.md`

Not every real finding gets fixed today. The honest answer is neither
silence nor a switch that turns a gate off — it is a dated, owned decision,
recorded where the audit can see it:

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
fileless finding's feature name. **Never** write a deferral yourself without
being asked — `Owner:` names a real person who answers for the debt, and
that is not your call to make. Renewing is a **second** `Until:` line
appended under the same block, never an edit of the first one; the last
line is always the active deadline.

| Finding | Fires when |
|---|---|
| `DEFERRAL_TOO_BROAD` | `Scope:` matches more findings than `deferrals.maxMatches` (default 5) — deferring this broadly is turning the gate off with extra steps |
| `DEFERRAL_WITHOUT_OWNER` | `Owner:` or `Reason:` is missing |
| `DEFERRAL_WITHOUT_DEADLINE` | no `Until:` line at all |
| `DEFERRAL_TOO_LONG` | the active `Until:` is further out than `deferrals.maxDays` (default 90) from today |
| `DEFERRAL_NOT_ELIGIBLE` | the named `Finding:` is not G5/G6, or is on the never-deferrable list (proof, and decisions nothing should route around — `TASK_DONE_WITHOUT_PROOF`, `AC_WITHOUT_PROOF`, `PROOF_WEAK`, `PROOF_STALE`, `SCOPE_NOT_APPROVED` among them) |
| `DEFERRAL_EXPIRED` (warning) | the active `Until:` is in the past — the finding it covered is back at full severity, escalating under `--ci` like any other |
| `DEFERRAL_RENEWED_REPEATEDLY` (warning) | a third renewal of the same entry — not deferred anymore, accepted; belongs in `BASELINE.md` or `BACKLOG.md` instead |

`adp audit --ci` still honors a valid deferral. `adp audit --strict` ignores
`DEFERRALS.md` entirely — use it when asked for the real, undeferred state.

## Proof is written by `verify`, and by nothing else

`adp audit` reads documents and tests. It can see that a criterion has a test
annotated `@spec:AC-xxx`; it **cannot** see whether that test passed, because
nothing in a document can tell it that. Proof is written by `adp verify`, which
runs the project's test command and records which criteria actually passed.

```sh
adp verify        # runs the tests, writes .spec/verification/<feature>.json
adp audit --ci    # now G5 can be green
```

Before verify has run, every criterion reports `AC_WITHOUT_PROOF` — *has a test, but
no PASS proof*. That is not a bug to work around; it means nobody has run the
tests through the engine yet. A slow suite goes to `adp verify --background`,
followed by `adp verify --status`.

**The first verify will be refused, and that is correct.** The test command lives
in the project's config — a file in the repository — so running it executes code
that came from a repo. `adp trust` shows the human that exact command and asks.
**Never approve on their behalf, and never reach for `--yes` to get past it.**

## Rules

1. **Spec first.** `PRD.md` before `RFC.md` before `DESIGN.md` before
   `SPEC.md` before code. The gates enforce the order; do not route around them.
2. **Every acceptance criterion becomes a test whose TITLE carries
   `@spec:AC-xxx`.** No annotation, no criterion — as far as the machine is
   concerned.
3. **You never declare a criterion passed.** The test runner does. A skipped
   test is not proof.
4. **Never mark `[done]` without PASS proof.** `[in-test]` is the honest
   resting place — implemented, proof not yet granted. The audit checks, and
   `TASK_DONE_WITHOUT_PROOF` is an error.
5. **`adp verify` is what grants proof.** A test that exists is not a test that
   passed. Run it before claiming anything.
6. **Never approve the test command for the human.** `adp trust` is their
   decision; `--yes` is not yours to use. The same goes for `adp run`, which
   invokes an AI whose work gets committed, for `--allow-edits`, which lets
   that AI write to the worktree without asking, and for `adp estimate
   --confirm`, which locks in a Function Point count as if a human reviewed
   it — you propose the draft, only they confirm it.
7. **A decision without at least two alternatives is not a decision.** Write
   down what you rejected and why.
8. **Assumptions and open questions are mandatory.** Filled a gap without
   confirming? That is an `ASM-xxx`. Could not decide? That is a `Q-xxx`, marked
   **blocking** if the path depends on it. If there are genuinely none, write
   "None." and be suspicious of yourself.
9. **The constitution rules.** `[MUST]` principles are executed, not read. Never
   fix the principle to make the check pass — fix the code.
10. **Never weaken, skip or delete a test to go green.** If the same finding
   survives **three attempts**, STOP and bring it to the human. Do not iterate
   forever.
11. **`adp verify` then `adp audit --ci` exits 0 before any hand-off.** Paste the output.
12. **Read paths from `adp.config.json`.** Never hard-code a test path or a
    verification directory.
13. **A command run more than once becomes a `Makefile` target**, mirrored in
    `README.md`. Deploy- or usage-relevant changes update `docs/DEPLOYMENT.md`
    and `docs/USAGE.md`.
14. **Keep the memory files current** — see Memory below.

## Delivery mode

Set `delivery` in `adp.config.json`. It decides how finished work reaches
main, and **nothing else in the loop depends on it**:

- **`local-only`** (default) — work lands in a branch. No remote, no network, no
  account. The full chain from specification to proof closes offline, on purpose.
- **`direct-PR`** — push and open a pull request; a human merges. One issue per
  task, `Closes #N` in the pull request body.

Rules 2, 3 and 4 do not change between modes. An external service's rate limit
must never be what stops you proving that work is done.

## Running several tasks at once

When `SPEC.md` holds several `[pending]` tasks, the engine can run them in
parallel, each in its own git worktree:

```sh
adp plan          # the lanes — show the human this before running anything
adp run           # asks for confirmation, then executes
adp rerun lane-02 # one lane again, leaving merged work untouched
```

`adp run` on its own cannot write anything: the workers are invoked in a mode
that must ask before editing, and a headless process has nobody to ask, so every
task finishes having changed nothing. Writing is granted by `--allow-edits`, and
that grant is the human's to make — like `adp trust` and `--yes`, it is not
yours to add on their behalf.

Tasks whose `Files:` lists overlap share a lane and run in order; disjoint
tasks run at the same time. **A task with no declared files is never
parallelised** — that is the file list earning its keep, not paperwork.

`Files:` is what a task WRITES. `Reads:` is what it only reads, and costs no
parallelism. `Depends on: T-001` is how a task says it runs after another one —
overlap cannot say it, because overlap is symmetric and "after" is not. A lane is
branched from HEAD, so a file you merely read is the version from before the run
until you declare the dependency; the plan tells you when that gap exists.

After every task commits, the pipeline runs the project's **approved** test
command inside that lane and stops the lane if it fails, so a broken test is
attributed to the task that broke it instead of surfacing at `adp verify` after
the merge. This spends the consent `adp trust` already holds and grants the agent
nothing new.

`adp monitor` serves a read-only page with the gates and per-feature progress.
`adp doctor` checks this copy of the tool against its own manifest — reach for it
when something behaves impossibly, before blaming the project.

## Roles

| Agent | Owns |
|---|---|
| business-analyst | stakeholder interviews; `SCOPE.md` |
| architect | architecture; `STACK.md`, `STRUCTURE.md`, `CONSTITUTION.md`, `RFC.md` |
| techlead | task assignment, review, final sign-off |
| designer | UX only; end-user experience |
| backend | backend implementation |
| frontend | framework ↔ API integration |
| security | all security; reviews code and principles |
| tester | tests everything before techlead sign-off |
| researcher | external research — market figures, library/API claims, technology comparisons; never writes to a tracked document itself |
| archaeologist | reads an existing codebase's own history and proposes a `Draft` `SCOPE.md`; only for a project adopting this tool mid-life, only once, right after `adp init --brownfield` |

Pipeline: business-analyst → architect → techlead → designer/backend/frontend
(security reviews) → tester → techlead. `researcher` is called in, not part
of the line — by architect before an RFC decision, by business-analyst for
a PRD's context number, or by anyone running `adp estimate` who wants the
h/PF table checked against current data. `archaeologist` runs once, before
the pipeline starts, only on a brownfield adoption.

Writing an `RFC.md`? It is flat and global, at `.spec/rfc/RFC-<NNN>-<slug>.md`
— `adp new --rfc <slug>` creates one — and the PRD that needs it links it by
adding the id to its own `rfcs:` line. One RFC can serve several PRDs, and one
PRD often needs several, one per one-way door. The `create-rfc` skill produces
the decision-record shape — options with pros and cons, decision criteria with
weights, RACI, outcome. The engine reads that shape natively. Assumptions and
open questions belong in `SPEC.md`, not here: give each one an `ASM-xxx`/
`Q-xxx` code instead of a bare row number. Without codes an assumption cannot
be referenced, tracked or closed.

## Feature or issue

**Broken existing behaviour → ISSUE.** `fix(<module>): <desc>`. Body: current
behaviour with logs, expected behaviour, steps to reproduce.

**New capability → FEATURE.** `feat(<module>): <desc>`. Run `adp new <name>
[--signals <list>]` and write whichever documents it scaffolds — the
ceremony matrix above decides how many that is.

A one-line fix does not need a feature folder. A change that alters what the
system promises does, even when the diff is small — the promise is what the
documents track.

## Memory

`.spec/CHANGELOG.md` what changed · `.spec/BEST_PRACTICES.md` patterns that
worked more than once · `.spec/TROUBLESHOOTING.md` problems that actually
happened and what fixed them.

Every test failure, bug and incident lands in TROUBLESHOOTING. A pattern that
recurs across features also earns a line in BEST_PRACTICES. These files are how
the next session starts smarter than this one — an empty one after a hard week
means the week was wasted.

## YAGNI

Stop at the first that solves it: speculative → do not build · reuse an existing
helper · standard library or an existing dependency · a framework built-in ·
otherwise the smallest implementation.

No single-use abstractions, no configuration for constants, no scaffolding for a
future nobody has specified. Fix bugs at the root cause, not at the call site.
**Never** simplify boundary validation, data-loss prevention, or security.

## References

`.spec/SCOPE.md` context · `.spec/STACK.md` and `.spec/STRUCTURE.md` details ·
`.spec/CONSTITUTION.md` principles · `adp.config.json` configuration ·
`README.md` and `docs/` product documentation · `.claude/skills/<name>/SKILL.md`
the skills — note the **plural**: `.claude/skill/` is never read by the harness.
