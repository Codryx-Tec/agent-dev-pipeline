# DESIGN: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: DESIGN — HOW to build it, in detail (the technical design a
> human reads — formerly called TDD in earlier versions of this tool)
> status: draft

## 1. Shape of the system

Three layers, each depending only on the layer beneath it. Nothing in an
inner layer knows an outer layer exists. (This is a different "ring" from
`cli.js`'s own "three cost rings" comment — that one is about how much of
the project a command loads before doing anything; this one is dependency
direction. Same word, two unrelated meanings, worth keeping straight.)

```
        the caller: a terminal, a CI job, or an AI agent
              │  argv in · stdout + exit code out
   ┌──────────▼───────────────────────────────────────────────┐
   │  bin/adp.js · src/cli.js   dispatch, rendering, --json    │
   └──────────────────────┬───────────────────────────────────┘
                          │  pure function calls
   ┌──────────────────────▼───────────────────────────────────┐
   │  src/core/  project · audit · gates · ceremony · verify   │
   │  init · upgrade · trust · plan · executor · resume        │
   │  estimate · closure · report · report-html · ledger       │
   └──────────────────────┬───────────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────────┐
   │  src/parsers/  prd · rfc · spec · design · constitution   │
   │                backlog · annotations                       │
   │  src/migrations/  0.5.0 · 0.6.0 · index (the registry)     │
   │  src/util/     text · glob                                 │
   └───────────────────────────────────────────────────────────┘

   outside the repository:  <state-dir>/ledger.jsonl · streams/<runId>/*.jsonl
```

**The load-bearing rule:** `src/core/` performs no I/O beyond reading the
documents — it takes a project and returns findings. Rendering and
serialisation sit above it, which is what makes `audit --ci` in a pipeline
and `status` in a terminal literally the same verdict rather than two
implementations that agree today.

## 2. Repository layout

The repository root **is** the package. What the tool *is* lives in `src/`;
what the tool *installs* lives in `payload/`; nothing is both:

```
├── bin/adp.js               entrypoint; sets process.exitCode, never process.exit
├── src/
│   ├── cli.js                  command dispatch, three cost rings
│   ├── config.js                DEFAULT_CONFIG + loader, everything defaulted
│   ├── version.js               the tool's own version, read exactly once
│   ├── parsers/
│   │   ├── prd.js                   prose only — what, for whom, why
│   │   ├── rfc.js                   D-xxx decisions, two dialects
│   │   ├── spec.js                  US/AC/ASM/Q/T — "the layer the machine confers"
│   │   ├── design.js                thin — DESIGN.md is presence-checked, not parsed
│   │   ├── backlog.js               what fell outside the MVP boundary
│   │   ├── baseline.js              brownfield: pre-existing files, the ratchet's own record
│   │   ├── constitution.js          P-xxx, levels, declared verifications
│   │   └── annotations.js           @spec / @principle scanner + sandboxed grep
│   ├── core/
│   │   ├── project.js               load the whole project once
│   │   ├── audit.js                 findings with stable codes
│   │   ├── ceremony.js              signals → level → which gates a feature owes
│   │   ├── principles.js            execute the constitution's verifications
│   │   ├── gates.js                 G0–G6: finding code → gate, ordering, blocking, n/a
│   │   ├── verify.js                run the test command, extract per-test results
│   │   ├── reporters/               tap.js · vitest.js · junit.js · exitcode.js
│   │   ├── estimate.js              Function Point hours from a declared PF count
│   │   ├── closure.js               adp close — recalibrate the hours table from outcomes
│   │   ├── plan.js                  file-conflict graph → lanes and waves
│   │   ├── executor.js              worktrees, headless workers, merges
│   │   ├── rerun.js                 re-run one lane or task, cleanly
│   │   ├── resume.js                derive session-resume briefing from the repo
│   │   ├── ledger.js                append-only events outside the repo
│   │   ├── prompts.js               red gate → paste-ready prompt
│   │   ├── report.js                terminal / json / markdown rendering
│   │   ├── report-html.js           adp report — self-contained viability snapshot
│   │   ├── trust.js                 consent gate for the project's test command
│   │   ├── integrity.js             payload SHA-256, the write guard
│   │   ├── install-map.js           one map of where every payload file lands
│   │   ├── paths.js                 shared path helpers
│   │   ├── upgrade.js               classify + apply payload drift against the lockfile
│   │   ├── agent.js                 headless agent CLI invocation
│   │   └── init.js                  scaffold, idempotent
│   ├── migrations/
│   │   ├── index.js                  pendingMigrations() — plain numeric version compare
│   │   ├── 0.5.0.js                  Portuguese → English token rename
│   │   └── 0.6.0.js                  PRD/RFC/TDD → PRD/RFC/SPEC/DESIGN, RFC un-nesting
│   ├── server/                       server.js (read-only http) · state.js (projection)
│   ├── ui/                           index.html · app.css · app.js
│   └── util/{text.js,glob.js}
├── payload/                     what init copies into a project
│   ├── templates/                    SCOPE · PRD · RFC · SPEC · DESIGN · CONSTITUTION
│   ├── metrics/                      hours-per-fp.default.json — the cold-start table
│   ├── claude/skills/adp/            the agent contract
│   └── claude/{agents,hooks}/        role agents and hooks
└── test/*.test.js                node:test, no framework
```

## 3. Document grammar

| Element | Owning document | Form |
|---|---|---|
| story | `PRD.md` used to; `SPEC.md` now | `### US-001 — Title` |
| criterion | `SPEC.md` | `#### AC-001 — Title` then `- **Given**` / `- **When**` / `- **Then**` bullets |
| assumption | `SPEC.md` | `- **ASM-001** — text *(status: open\|confirmed\|invalidated)*` |
| question | `SPEC.md` | `- **Q-001** — text *(status: open\|answered)*` |
| decision | `RFC-<NNN>-<slug>.md`, flat under `.spec/rfc/` | `### D-001 — Title` with an **Alternatives considered** list of ≥2 and a **Decision:** line |
| task | `SPEC.md` | `## T-001 — Title [pending\|in-progress\|in-test\|done]` then `- Refs:`, `- Files:`, optional `- Reads:` / `- Depends on:` |
| principle | `CONSTITUTION.md` | `## P-001 [MUST\|SHOULD\|MAY] Title` then `- verification(...)` |
| signal | `PRD.md` header | `> signals: multiple-teams, hard-to-reverse, money-or-pii, new-tech, large-estimate` (any subset) |
| RFC link | `PRD.md` header | `> rfcs: RFC-001, RFC-004` — one PRD may point at several |
| backlog item | `BACKLOG.md`, project-wide, optional | one prose line per item, no tracking code — a line that already looks like one (`US-001`, `T-003`, …) is `BACKLOG_ITEM_WITH_CODE` |
| decision field | `SCOPE.md` | `**Decision:** pending\|go\|no-go` — read, rendered, never enforced |
| baseline | `BASELINE.md`, project-wide, written once by `init --brownfield` | `> commit:` header plus one file path per bullet — pre-existing files whose findings stay warnings until touched again |
| test annotation | test title | `@spec:AC-001` or `@principle:P-001` |

0.6.0 split what one PRD/RFC/TDD trio used to hold: `PRD.md` is prose only
(what, for whom, why); `RFC.md` keeps only `D-xxx` and moved out of the
feature directory into a flat, globally-numbered family (`.spec/rfc/`),
because one RFC can serve several PRDs and one PRD often needs several;
`SPEC.md` is new and owns everything else the engine cross-references —
"the layer the machine confers"; `DESIGN.md` (renamed from `TDD.md`) is
prose only, HOW in detail, with no grammar of its own beyond its header —
gate G3 passes once it exists.

Two grammar notes carried over from the reference engine, both deliberate.
The annotation goes in the test *title*, not a comment, because a title
survives into every reporter's output — which is what lets one scanner
work across `pytest` and `vitest` without knowing either. And codes are
unique **project-wide**, not per-document, so a task may legally reference
a criterion defined in any `PRD.md`/`SPEC.md` in the project; reference
resolution is global.

Statuses are engine tokens: English, and never localised at render time
(D-016).

## 4. The gates

Each gate owns a subset of finding codes. A gate is green when none of its
codes fired at error severity, red when at least one did, **blocked** when
an earlier gate is red, and **n/a** when the ceremony matrix decided this
gate is not due for any feature at its current level — n/a applies only to
G2 and G3, never the other five, which are never skippable regardless of
ceremony. Four states because "we have not got there yet" (blocked), "this
is wrong" (red) and "not owed right now" (n/a) are three different claims,
and only a gate with zero findings of its own is ever allowed to read n/a —
a gate sitting on a real error is red even at a ceremony level that
wouldn't otherwise require it (a stale RFC that exists is still checked for
completeness, independent of who currently links it).

| Gate | Question it answers | Owns |
|---|---|---|
| G0 | Is the scope approved? | `SCOPE_MISSING`, `SCOPE_NOT_APPROVED`, `SCOPE_FIELD_EMPTY` |
| G1 | Is the PRD complete — what, for whom, why? | `PRD_MISSING`, `ID_DUPLICATE`, `ID_TOO_SHORT`, `SIGNAL_UNKNOWN`, `PRD_UNPLACED`, `BACKLOG_ITEM_WITH_CODE`, `PRD_WITH_SOLUTION` |
| G2 | Is the path decided, with alternatives recorded? | `RFC_MISSING`, `DECISION_WITHOUT_ALTERNATIVE`, `DECISION_WITHOUT_CHOICE`, `CONTEXT_WITHOUT_NUMBERS` — n/a-eligible |
| G3 | Is the design written? | `DESIGN_MISSING` — n/a-eligible, presence-only |
| G4 | Is the spec complete and implementable? | `SPEC_MISSING`, `SPEC_WITHOUT_US`, `US_WITHOUT_AC`, `AC_INCOMPLETE`, `AC_OUTSIDE_US`, `AC_WITHOUT_TASK`, `REF_BROKEN`, `REF_WITHOUT_AC`, `TASK_WITHOUT_FILES`, `TASK_STATUS_INVALID`, `FILE_MISSING`, `Q_BLOCKING_OPEN`, `ASM_WITHOUT_CODE`, `SECTION_MISSING`, `STATUS_INVALID`, `AC_NOT_OBSERVABLE` |
| G5 | Is every acceptance criterion proven by a passing test? | `AC_WITHOUT_TEST`, `AC_WITHOUT_PROOF`, `PROOF_STALE`, `PROOF_WEAK` |
| G6 | Do the documents, the code and the constitution still agree? | `TEST_ORPHAN`, `TASK_DONE_WITHOUT_PROOF`, `ASM_OPEN`, `Q_OPEN`, `PRINCIPLE_WITHOUT_VERIFICATION`, `PRINCIPLE_VIOLATED`, `LEVEL_INVALID`, `VERIFICATION_MALFORMED`, `GLOB_WITHOUT_FILES`, `FILE_ORPHAN`, `FEATURE_MISMATCH`, `PROJECT_INVALID`, `DOC_TOO_LONG`, `DOC_FOSSIL`, `DUPLICATE_PROSE`, `DEFERRAL_TOO_BROAD`, `DEFERRAL_WITHOUT_OWNER`, `DEFERRAL_WITHOUT_DEADLINE`, `DEFERRAL_TOO_LONG`, `DEFERRAL_NOT_ELIGIBLE`, `DEFERRAL_EXPIRED`, `DEFERRAL_RENEWED_REPEATEDLY` |

`gates.js` holds this map as data, and a test asserts that **every code the
audit can emit is assigned to exactly one gate**. Without that test, a new
code silently belongs to no gate and becomes invisible — the failure mode
D-009 warned about. That test reads the emittable codes out of the engine's
own source rather than from a hand-kept list, because a hand-kept list
would drift, and drift is the one thing this tool exists to catch.

The exit code is the number of the first failing gate (1–7 for G0–G6, 0
clean), so a pipeline learns *where* it broke from the status alone.

## 5. Task status and proof

Status lives in `SPEC.md`'s task heading and nowhere else. The engine reads
it, and pairs it with the proof recorded per acceptance criterion.

| Status | Meaning | The engine's view |
|---|---|---|
| `[pending]` | not started | nothing to check |
| `[in-progress]` | being worked on | nothing to check |
| `[in-test]` | implemented, proof not yet granted | legitimate resting state |
| `[done]` | claimed finished | **every referenced criterion must have PASS proof** |

That last row is the whole point: `[done]` is a claim, and the audit either
grants it or reports `TASK_DONE_WITHOUT_PROOF`. A task cannot leave
`[in-test]` by declaring itself finished — the test runner decides, and a
skipped test is never proof.

## 6. Execution model

`plan.js` builds the file-conflict graph — tasks whose `Files:` sets
intersect are fused into one lane, and each connected component becomes a
lane with its own branch and worktree. A task with no declared files is
never placed in a lane; it goes to the sequential remainder with its reason
recorded. Lanes are cut into waves of at most `maxParallel`. Declared
`Reads:`/`Depends on:` lay a separate ordering graph over the same lanes: a
cycle among tasks, a dependency on an unknown id, or a dependency on an
excluded task is refused rather than guessed at; mutually dependent lanes
are merged, not refused, since two lanes each needing the other is a real
absence of parallelism, not a contradiction.

`executor.js` runs a lane by creating the worktree, invoking the configured
agent CLI once per task in headless mode with the task brief as its
prompt, expecting exactly one commit per task, then merging the lane back
with `--no-ff`. It is a **dispatcher, not a script**: every lane and every
sequential task is an addressable target, so re-running one lane cleans
that lane's previous worktree and branch and leaves merged work alone.

Token economy is enforced structurally rather than by good intentions. The
worker writes its raw output to `<state-dir>/streams/<runId>/<lane>--
<task>.jsonl`, which lives outside the repository and is read only on
explicit request. The orchestrator composes its progress reports from task
status, the ledger and each worker's short final summary — never from a
transcript. One task, one worktree, one fresh context, one commit, one
summary.

**Two honest limits, both consequences recorded in `RFC.md`.** ASM-005
assumes declared file lists are accurate; a worker touching an undeclared
file breaks lane disjointness, so the executor detects the violation after
the fact and reports it rather than trusting the declaration. And per D-002
a worker cannot be asked a follow-up: it succeeds, fails, or times out.

## 7. What 0.6.0 added

Six pieces landed after M1's original six-gate, four-parser shape (US-018
through US-023 in `SPEC.md` carry the full Given/When/Then criteria for all
of them):

**Ceremony matrix** (`core/ceremony.js`). A PRD's declared signals compute
a level (`light`/`medium`/`rfc-first`/`full`), never the other way around —
a PRD can never disagree with its own signals. The level decides whether a
feature owes G2 (RFC) and G3 (DESIGN); `projectCeremony()` aggregates every
feature's level project-wide, worst case wins, feeding `gates.js`'s `n/a`
state.

**MVP boundary and backlog** (`parsers/backlog.js`). Every feature with a
PRD must be named in `SCOPE.md`'s MVP checklist or it is `PRD_UNPLACED` —
nothing exists in limbo. `.spec/BACKLOG.md` is where everything else waits,
as prose with no tracking code; a backlog line that already carries one is
`BACKLOG_ITEM_WITH_CODE`, because a deferred item that already looks proven
is the loophole this check exists to close.

**Viability report** (`core/report-html.js`, `adp report`). A portable,
self-contained snapshot — one HTML file with no external reference, or a
text form for a terminal — carrying every gate, every feature's ceremony
and MVP placement, and `SCOPE.md`'s `**Decision:**` field. Declared and
rendered, never enforced; the same posture ceremony signals and the
backlog already take.

**Function Point estimation** (`core/estimate.js`, `core/count.js`, `adp
profile` / `adp estimate`). Hours are a PF count times the matching row of
`.spec/metrics/hours-per-fp.json` (seeded from
`payload/metrics/hours-per-fp.default.json`, every row `source:
"cold-start"`). The PF count itself is either declared directly
(`--pf <n>`) or produced by the automated counting loop
(`.spec/metrics/count-draft.json`, one entry per function classified
`ALI`/`AIE`/`EE`/`CE`/`SE` at low/medium/high complexity, weighed against
`.spec/metrics/fp-weights.json`): `adp estimate --review` shows the draft
and its total, and only a human's `adp estimate --confirm` locks it in as
`count-confirmed.json`. An entry with no cited source is excluded from the
total and reported, never silently dropped or counted — none of this is a
gate, matching the rest of this family. `real-time`/`infra`/`mathematical`
app types carry an explicit applicability warning, since Function Point
analysis measures them poorly.

**Closing the estimation loop** (`core/closure.js`, `core/history.js`, `adp
close --hours <n>`). Without this, the hours table never leaves cold start
and every estimate stays opinion imported from a market figure, forever.
`recalibrateRow()` blends each real outcome into the matching table row —
nudge at 1 observation, blend at 2, mean-plus-widen at 3–5, fully observed
at 6+ — always clamped so `low ≤ likely ≤ high` holds. Its inputs now come
from `hours-history.jsonl` in the state directory, shared across every
project on the machine (or a team path via `config.metrics.historyPath`),
never from the local project's own `closures.jsonl` alone — "o histórico é
a verdade; a tabela é cache." The shared record carries no project, feature
or person name by construction, only a profile, PF, hours and a dedup hash.
`adp metrics import <file>` / `export [--csv]` move it between machines;
imported records are always marked as such. Deferred: per-observation
human/agent hour breakdown, ledger corroboration fields, and `adp estimate
--history`'s retrospective accuracy report.

**Antipatterns as findings** (`core/audit.js`, `parsers/rfc.js`,
`parsers/design.js`). All eight of PRD-003b's codes now: `PRD_WITH_SOLUTION`
(a PRD naming a forbidden technical term), `CONTEXT_WITHOUT_NUMBERS` (an
RFC's context with no measurable figure), `DOC_TOO_LONG` (a PRD or DESIGN
over its configured line ceiling — `SPEC.md` is exempt, its length tracks
real content), `DOC_FOSSIL` (a DESIGN older than the newest file its tasks
map, past a five-minute copy-jitter tolerance), `AC_NOT_OBSERVABLE` (a
criterion with a vague adjective and no number anywhere in its
Given/When/Then text), `STRAW_OPTION` (a `create-rfc`-dialect option with
no cons, or cons far shorter than the favorite's — the native dialect has
no Pros/Cons structure to weigh), `OPTION_DO_NOTHING_MISSING` (no
alternative names "do nothing," in either dialect — a plain warning in
every mode, deliberately not the always-on error PRD-003b specifies, since
that broke the shipped `.exemplo/` example retroactively the moment it
shipped), and `DUPLICATE_PROSE` (a substantial passage shared between a
feature's own PRD/RFC/DESIGN, word-set Jaccard similarity ≥0.75 on
paragraphs of at least 25 words).

**The migration registry** (`migrations/index.js`, `0.5.0.js`, `0.6.0.js`,
`adp upgrade`). `0.5.0.js` was the Portuguese-to-English token rename,
written after the fact since 0.5.0 shipped without one. `0.6.0.js` is the
PRD/RFC/TDD → PRD/RFC/SPEC/DESIGN codemod and RFC un-nesting, operating per
feature directory rather than per file since it reads up to three source
documents to write three destination ones, and never overwrites a SPEC.md
section that already exists — a partial or hand-started SPEC.md is merged
into, not clobbered.

**Brownfield recognition and the baseline ratchet** (`parsers/baseline.js`,
`adp init --brownfield`, M4-readonly-core). The read-only half of
SCOPE-0.6.0.md PRD-002 — the highest-risk item in the whole document
(`Reversible: no`, its archiving step moves the user's real files), split
so the safe half could ship without the dangerous half riding along
untested. `--brownfield` scans for `README*`/`docs/**`/`adr/**`/OpenAPI/
migrations/`CHANGELOG*`/`CONTRIBUTING*` and prints what it found — nothing
moved, nothing rewritten — and writes `.spec/BASELINE.md`: the commit and
the pre-existing `srcGlobs` files at adoption time. `project.js` diffs that
commit against the working tree once (`git diff --name-only <commit>`, no
`..HEAD`, so an uncommitted edit still counts as touched) and
`audit.js`'s `emit()` exempts any finding tied to a baselined,
untouched file from ever escalating under `--ci` — general, not
`FILE_ORPHAN`-specific, though that is the finding the source document's
own "wall of `FILE_ORPHAN`" framing is about. The new **archaeologist**
role (`payload/claude/agents/archaeologist.md`, skill
`project-archaeology`) reads the recognition inventory plus the code and
proposes a `SCOPE.md` draft — always `Draft`, never `Approved`, every
claim cited to its source file. Deferred: the archiving step itself
(`git mv` to `project_old_artifacts/`, its three guards, its own consent
gate), `BASELINE_WIDENED`, and a no-git mtime fallback for the ratchet —
all named in `.spec/BACKLOG.md`.

**The monitor shows the work, not just the verdict** (`core/ledger.js`,
`server/state.js`, `ui/app.js`, M5-monitor-core). PRD-004's own complaint:
the chain happens and the page only ever showed the six (now seven)
lights. Most of the answer already existed by the time this pass started
— the per-feature document trail and the raw findings behind the first
red gate were built earlier this session — so this closes the specific
gaps PRD-004 names that didn't: **live lanes**, reading `ledger.js`'s
existing `progress(config, runId)` for whichever run
`latestRunId(config)` finds most recent, one `id`/`state` per lane and
per task, `live` derived from whether every lane has reached a terminal
state; **the paste-ready prompt**, reusing `prompts.js:buildPrompt(gate)`
on the first red gate — the same text `adp prompt` already prints,
now also in a `readonly` textarea on the page; and **a debt panel**
showing the baseline's file count (never the file list — a summary, not
another wall) next to the existing backlog count, plus the last `adp
close`'s declared hours beside the estimate, human hours only —
wall-clock stays off this page, the same "two clocks never mix" rule
that keeps it out of `hours-per-fp.json`. Deferred: SSE (polling already
works and already fails honestly; this pass changes what's visible, not
the transport) — left out rather than half-built.

**Declared deferral** (`parsers/deferrals.js`, `core/audit.js`,
M5b). SCOPE-0.6.0.md §12.1's "camada 2": the honest way to live with a
real finding on purpose, instead of a finding either blocking everything
or a gate getting turned off entirely. `.spec/DEFERRALS.md` is
project-wide and optional, owner of the `DEF-xxx` family — one file, so
scattered debt stays summable. Each entry names the finding code, a
`Scope:` (a glob against the finding's file, or an exact match against a
fileless finding's feature name — "path or instance"), an `Owner:`, a
`Reason:`, and one or more `Until:` lines; renewing is a second `Until:`
line, never an edit of the first — the file's own grammar was
underspecified in the source prose and settled by asking rather than
guessing, so a human hand-editing this file later is not guessing either.
Six rules keep it from becoming the gate-off switch by the back door: only
G5/G6 findings are eligible, and ten of those (`NEVER_DEFERRABLE` in
`gates.js`) never are — proof and decisions, never; a `Scope:` matching
more than `deferrals.maxMatches` (default 5) findings is
`DEFERRAL_TOO_BROAD`; an `Until:` past `deferrals.maxDays` (default 90)
from the moment the audit runs is `DEFERRAL_TOO_LONG`; a missing `Owner:`
or `Reason:` is `DEFERRAL_WITHOUT_OWNER`; a missing `Until:` is
`DEFERRAL_WITHOUT_DEADLINE`; an expired `Until:` returns the finding to
full severity and reports `DEFERRAL_EXPIRED`; a third renewal is
`DEFERRAL_RENEWED_REPEATEDLY` — a warning, not a refusal, since at that
point the debt is accepted, not deferred, and belongs in `BASELINE.md` or
`BACKLOG.md` instead. A deferred finding is marked, never removed:
`evaluateGates()` excludes it from both the error and the warning tally
per gate, but every renderer still prints the active count next to green
and red — hidden debt is the only kind that grows unseen. `--ci` still
honors a valid deferral (the whole point is a pipeline that can stay
green on purpose); `adp audit --strict` ignores `DEFERRALS.md` entirely,
the monthly run that shows the real state regardless.

---
