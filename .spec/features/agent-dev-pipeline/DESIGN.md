# DESIGN: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: DESIGN — HOW to build it, in detail (the technical design a
> human reads — formerly called TDD in earlier versions of this tool)
> status: draft

## 1. Shape of the system

Three rings, each depending only on the ring beneath it. Nothing in an inner ring
knows an outer ring exists.

```
        the caller: a terminal, a CI job, or an AI agent
              │  argv in · stdout + exit code out
   ┌──────────▼───────────────────────────────────────────────┐
   │  bin/adp.js · src/cli.js   dispatch, rendering, --json   │
   └──────────────────────┬───────────────────────────────────┘
                          │  pure function calls
   ┌──────────────────────▼───────────────────────────────────┐
   │  src/core/  project · audit · gates · verify · init      │
   │             plan · executor · ledger · prompts           │
   └──────────────────────┬───────────────────────────────────┘
                          │
   ┌──────────────────────▼───────────────────────────────────┐
   │  src/parsers/  prd · rfc · tdd · constitution · annotations│
   │  src/util/     text · glob                                │
   └───────────────────────────────────────────────────────────┘

   outside the repository:  <state-dir>/ledger.jsonl · streams/<runId>/*.jsonl
```

**The load-bearing rule:** `src/core/` performs no I/O beyond reading the
documents — it takes a project and returns findings. Rendering and serialisation
sit above it, which is what makes `audit --ci` in a pipeline and `status` in a
terminal literally the same verdict rather than two implementations that agree
today.

## 2. Repository layout

The repository root **is** the package. What the tool *is* lives in `src/`; what
the tool *installs* lives in `payload/`; nothing is both:

```

├── bin/adp.js              entrypoint; sets process.exitCode, never process.exit
├── src/
│   ├── cli.js                  command dispatch, three cost rings
│   ├── config.js               DEFAULT_CONFIG + loader, everything defaulted
│   ├── parsers/
│   │   ├── prd.js              US-xxx / AC-xxx with Given/When/Then
│   │   ├── rfc.js              ASM-xxx / Q-xxx / decisions and alternatives
│   │   ├── tdd.js              T-xxx with Refs, Files, Reads, Depends
│   │   ├── constitution.js     P-xxx, levels, declared verifications
│   │   └── annotations.js      @spec / @principle scanner + sandboxed grep
│   ├── core/
│   │   ├── project.js          load the whole project once
│   │   ├── audit.js            findings with stable codes
│   │   ├── principles.js       execute the constitution's verifications
│   │   ├── gates.js            G0–G5: finding code → gate, ordering, blocking
│   │   ├── verify.js           run the test command, extract per-test results
│   │   ├── reporters/          tap.js · vitest.js · junit.js · exitcode.js
│   │   ├── plan.js             file-conflict graph → lanes and waves
│   │   ├── executor.js         worktrees, headless workers, merges
│   │   ├── ledger.js           append-only events outside the repo
│   │   ├── prompts.js          red gate → paste-ready prompt
│   │   ├── report.js           terminal / json / markdown rendering
│   │   └── init.js             scaffold, idempotent
│   └── util/{text.js,glob.js}
├── server/                     read-only http + state projection
├── ui/                         index.html · app.css · app.js
├── server/                     read-only http + state projection
├── ui/                         index.html · app.css · app.js
├── payload/                    what init copies into a project
│   ├── templates/              SCOPE · PRD · RFC · TDD · CONSTITUTION
│   ├── claude/skills/adp/      the agent contract
│   └── claude/{agents,hooks}/  role agents and hooks
└── test/*.test.js              node:test, no framework
```

<!-- A note here explained how the page's source would be split across six files
     and inlined at request time, refining D-005. It went with the monitor
     (D-011). -->

## 3. Document grammar

Deliberately compatible with what `Projeto_Agent/.spec/scripts/audit.js` already
accepts, so the existing scripts keep passing during the migration.

| Element | Form |
|---|---|
| story | `### US-001 — Title` |
| criterion | `#### AC-001 — Title` then `- **Given**` / `- **When**` / `- **Then**` bullets |
| assumption | `- **ASM-001** — text *(status: open\|confirmed\|invalidated)*` |
| question | `- **Q-001** — text *(status: open\|answered)*` |
| decision | `### D-001 — Title` with an **Alternatives considered** list of ≥2 and a **Decision:** line |
| task | `## T-001 — Title [pending\|in-progress\|in-test\|done]` then `- Refs:` and `- Files:` |
| principle | `## P-001 [MUST\|SHOULD\|MAY] Title` then `- verification(...)` |
| test annotation | `@spec:AC-001` or `@principle:P-001` in the test **title** |

Two grammar notes carried over from the reference engine, both deliberate. The
annotation goes in the test *title*, not a comment, because a title survives into
every reporter's output — which is what lets one scanner work across `pytest` and
`vitest` without knowing either. And codes are unique **project-wide**, not
per-document, so a task in `TDD.md` may legally reference a criterion defined in
any `PRD.md` in the project; reference resolution is global.

Statuses are engine tokens: English, and never localised at render time (D-016).
Note the new status `[in-test]`, which the TEST column needs and the current scripts do
not know — handled in T-004.

## 4. The gates

Each gate owns a subset of finding codes. A gate is green when none of its codes
fired at error severity, red when at least one did, and **blocked** when any
earlier gate is red — blocked is a third state, rendered distinctly from red,
because "we have not got there yet" is not the same as "this is wrong".

| Gate | Question it answers | Owns |
|---|---|---|
| G0 | Is the scope approved? | `SCOPE_MISSING`, `SCOPE_NOT_APPROVED`, `SCOPE_FIELD_EMPTY` |
| G1 | Is the PRD complete? | `PRD_MISSING`, `SPEC_WITHOUT_US`, `US_WITHOUT_AC`, `AC_INCOMPLETE`, `AC_OUTSIDE_US`, `ID_DUPLICATE`, `ID_TOO_SHORT` |
| G2 | Is the path decided? | `RFC_MISSING`, `DECISION_WITHOUT_ALTERNATIVE`, `DECISION_WITHOUT_CHOICE`, `SECTION_MISSING`, `Q_BLOCKING_OPEN`, `STATUS_INVALID`, `ASM_WITHOUT_CODE` |
| G3 | Is the breakdown implementable? | `TDD_MISSING`, `AC_WITHOUT_TASK`, `REF_BROKEN`, `REF_WITHOUT_AC`, `TASK_WITHOUT_FILES`, `TASK_STATUS_INVALID`, `FILE_MISSING` |
| G4 | Is it proven? | `AC_WITHOUT_TEST`, `AC_WITHOUT_PROOF`, `PROOF_STALE`, `PROOF_WEAK` |
| G5 | Is everything aligned? | `TEST_ORPHAN`, `TASK_DONE_WITHOUT_PROOF`, `ASM_OPEN`, `Q_OPEN`, `PRINCIPLE_WITHOUT_VERIFICATION`, `PRINCIPLE_VIOLATED`, `LEVEL_INVALID`, `VERIFICATION_MALFORMED`, `GLOB_WITHOUT_FILES`, `FILE_ORPHAN`, `FEATURE_MISMATCH`, `PROJECT_INVALID` |

`gates.js` holds this map as data, and a test asserts that **every code the audit
can emit is assigned to exactly one gate**. Without that test, a new code silently
belongs to no gate and becomes invisible — the failure mode D-009 warned about.
That test reads the emittable codes out of the engine's own source rather than
from a hand-kept list, because a hand-kept list would drift, and drift is the one
thing this tool exists to catch.

> **Synced with the implementation (M1).** Eight codes above were added while
> building: the four `*_MISSING` codes, because a missing document must be
> reported by the gate that owns it rather than crashing the loader;
> `DECISION_WITHOUT_CHOICE`, because a decision can record its alternatives and still
> never pick one; `Q_OPEN`, because a non-blocking open question is worth a
> warning; `FEATURE_MISMATCH`; and `PROJECT_INVALID`. The exit code also
> carries information the original design did not specify: it is the **number of
> the first failing gate** (1–6 for G0–G5), so a pipeline learns *where* it broke
> from the status alone.

## 5. Task status and proof

Status lives in the `TDD.md` heading and nowhere else. The engine reads it, and
pairs it with the proof recorded per acceptance criterion.

| Status | Meaning | The engine's view |
|---|---|---|
| `[pending]` | not started | nothing to check |
| `[in-progress]` | being worked on | nothing to check |
| `[in-test]` | implemented, proof not yet granted | legitimate resting state |
| `[done]` | claimed finished | **every referenced criterion must have PASS proof** |

That last row is the whole point: `[done]` is a claim, and the audit either
grants it or reports `TASK_DONE_WITHOUT_PROOF` (AC-014). A task cannot leave
`[in-test]` by declaring itself finished — the test runner decides, and a skipped
test is never proof.

<!-- This section previously specified a kanban projection into five columns.
     The columns went with the monitor (RFC D-011); the rule underneath them did
     not, and is what is written above. -->

## 6. Execution model

`plan.js` builds the file-conflict graph — tasks whose `Files:` sets intersect
are fused into one lane, and each connected component becomes a lane with its own
branch and worktree. A task with no declared files is never placed in a lane; it
goes to the sequential remainder with its reason recorded (AC-012). Lanes are cut
into waves of at most `maxParallel`.

`executor.js` runs a lane by creating the worktree, invoking the configured agent
CLI once per task in headless mode with the task brief as its prompt, expecting
exactly one commit per task, then merging the lane back with `--no-ff`. It is a
**dispatcher, not a script**: every lane and every sequential task is an
addressable target, so re-running one lane cleans that lane's previous worktree
and branch and leaves merged work alone (AC-022).

Token economy is enforced structurally rather than by good intentions. The worker
writes its raw output to `<state-dir>/streams/<runId>/<lane>--<task>.jsonl`, which
lives outside the repository and is read only on explicit request. The orchestrator
composes its progress reports from task status, the ledger and each worker's short
final summary — never from a transcript (AC-021). One task, one worktree, one fresh
context, one commit, one summary.

**Two honest limits, both consequences recorded in `RFC.md`.** ASM-005 assumes
declared file lists are accurate; a worker touching an undeclared file breaks lane
disjointness, so T-018 detects the violation after the fact and reports it rather
than trusting the declaration. And per D-002 a worker cannot be asked a follow-up:
it succeeds, fails, or times out.

---

## Tasks

### Milestone M1 — Engine core

## Expected parallelism

Given the file lists above, the planner should produce roughly this shape.
Milestone M1 is the widest: T-002 through T-006 touch five disjoint parser files
and can run as five concurrent lanes, with T-007 waiting because it depends on all
of them. Core tasks T-020 through T-024 are five disjoint files, so five lanes.

The genuine serializations are honest ones: T-007 needs every parser, T-008 needs
the audit's code list, T-014 needs the audit and verification state, and T-023
needs the executor. Nothing is serialized by accident — and any task that looks
parallel but is not will say so, because a task with no declared file list is
routed to the sequential remainder with its reason printed.

## Migration from the current scripts

`Projeto_Agent/.spec/scripts/audit.js` and `verify.js` keep working untouched
until M2 lands, because the grammar in section 3 is a superset of what they parse.
When the new engine passes on the same repository, the old scripts become a
compatibility shim that prints a pointer to the new command, and `AGENTS.md`
rule 10 — read config from `.spec/spec.config.json`, never hardcode paths —
carries over unchanged.

Two behaviours change on purpose and must be announced, because both make the
gate stricter than it is today. Proof stops meaning *an annotation exists* and
starts meaning *a test passed*, so tasks currently marked `[done]` may
legitimately fall back to TEST until real tests exist. And the constitution's
`verification(forbidden|required)` declarations begin to execute, so principles
that have been decorative since they were written will start producing findings —
P-003 through P-009 in the current constitution have never been run.
