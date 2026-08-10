# TDD: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: TDD — HOW to build it, in detail
> owns: T-xxx (tasks, each with `Refs:` and `Files:`)
> status: draft
> gate: G3 — this document is approved when every acceptance criterion in `PRD.md`
> is referenced by at least one task, every reference resolves, and every task
> that is meant to run in parallel declares its file list.

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

## T-001 — Configuration and shared utilities [done]

- Refs: AC-011, AC-030
- Files: src/config.js, src/util/text.js, src/util/glob.js
- Notes: `DEFAULT_CONFIG` covers everything so the tool runs with no config file. Port the glob-to-regexp and static-prefix walk logic from the reference engine — it is what lets a glob reach outside the root without doing I/O of its own.

## T-002 — PRD parser [done]

- Refs: AC-005, AC-006
- Files: src/parsers/prd.js
- Notes: Extract stories and criteria with file and line for every element. Accept both English and Portuguese clause keywords, since `Projeto_Agent` documents already use both.

## T-003 — RFC parser [done]

- Refs: AC-007, AC-008
- Files: src/parsers/rfc.js
- Notes: Extract decisions with their counted alternatives, plus assumptions and questions with status. A question tagged blocking is a distinct field, not a text convention.

## T-004 — TDD parser [done]

- Refs: AC-011, AC-012
- Files: src/parsers/tdd.js
- Notes: Tasks with references, file lists and status, including the new `[in-test]`. File lists are comma-separated and paths may contain spaces. An unrecognized status token is an error, never silently coerced.

## T-005 — Constitution parser [done]

- Refs: AC-029
- Files: src/parsers/constitution.js
- Notes: Principles with level and declared verifications in all four forms — gate, test, forbidden, required. A level outside MUST/SHOULD/MAY is treated as MUST and reported, never ignored.

## T-006 — Annotation scanner and sandboxed pattern search [done]

- Refs: AC-016, AC-028, AC-030
- Files: src/parsers/annotations.js
- Notes: Scan configured globs for `@spec:` and `@principle:` with file and line. The pattern search runs project-supplied regexes in a **disposable subprocess with a hard timeout**, so catastrophic backtracking becomes a `VERIFICATION_MALFORMED` finding instead of a hung gate. This is a security boundary, not an optimization.

## T-007 — Project loader and audit engine [done]

- Refs: AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-014, AC-027, AC-028
- Files: src/core/project.js, src/core/audit.js
- Notes: Emit findings as `{code, severity, message, file, line, feature}`. Codes are stable and never localised. Severity escalates in CI mode for the codes listed in `gates.js`. Reference resolution is project-global. AC-014 lands here rather than anywhere else: `TASK_DONE_WITHOUT_PROOF` is the rule that a status word cannot outrun its proof, and the audit engine is where that rule is enforced.

## T-008 — Gate mapping and evaluation [done]

- Refs: AC-004
- Files: src/core/gates.js
- Notes: The table in section 4 as data, plus ordering and the blocked state. Includes the completeness test asserting every emittable code is assigned to exactly one gate.

## T-009 — CLI dispatcher and terminal rendering [done]

- Refs: AC-024
- Files: bin/adp.js, src/cli.js, src/core/report.js, src/index.js
- Notes: Three cost rings — commands needing no config, commands needing only config, commands needing the loaded project. Entry point sets `process.exitCode` rather than calling `process.exit()`, so large piped JSON output is not truncated. Findings render as human-readable name first, stable code in parentheses.

### Milestone M2 — Real proof

## T-010 — Verification runner and reporter adapters [done]

- Refs: AC-016, AC-017, AC-027
- Files: src/core/verify.js, src/core/reporters/index.js, src/core/reporters/tap.js, src/core/reporters/vitest.js, src/core/reporters/junit.js, test/verify.test.js
- Notes: Execute the configured test command, extract per-test results, match titles to criteria. Skipped, pending and todo all resolve to `skip` and are never proof. Across tests for one criterion, `fail` beats `pass`, `pass` beats `skip`. Record the git revision so a later change can be detected as `PROOF_STALE`. The `junit` adapter is what makes `pytest` work — resolves ASM-002. The `exitcode` reporter needs no adapter file: it parses nothing, and lives as a two-line entry in `reporters/index.js` marked `perTest: false` so the audit reports `PROOF_WEAK` for anything proven that way. A results file takes precedence over stdout when `reporterOutputFile` is set — stdout is a shared channel and one `console.log` inside a test corrupts it.

### Milestone M3 — Executable constitution

## T-011 — Principle verification execution [done]

- Refs: AC-029, AC-030
- Files: src/core/principles.js
- Notes: Execute each declared verification. A `[MUST]` with no executable verification is `PRINCIPLE_WITHOUT_VERIFICATION`. A glob matching no file is `GLOB_WITHOUT_FILES` — an inert check that looks like a passing one is worse than no check. This is the gap `Projeto_Agent`'s current `audit.js` leaves open, named explicitly in its own P-007.

<!-- Milestones M4 and M5 (the monitor) were removed — see RFC D-011. They held
     T-012 through T-019: HTTP server, SSE stream, board projection, page shell,
     gates panel, board view, write endpoints and document editor.

     The task codes are NOT reused. T-020 below stays T-020. A code names one
     piece of work for the life of the project; renumbering to close the gap
     would silently repoint every reference, commit message and test annotation
     written before today — which is the exact drift this tool exists to catch. -->

### Milestone M6 — Background execution

## T-020 — Execution planner [done]

- Refs: AC-012, AC-019
- Files: src/core/plan.js, test/plan.test.js
- Notes: File-conflict graph, connected components as lanes, waves of at most `maxParallel`. Lane order and task order within a lane are stable and follow document order, so the same document always plans the same way. Overlap is TRANSITIVE — A–B and B–C put A and C in one lane even though they share nothing directly, which a pairwise check gets wrong in a way that looks correct.

## T-021 — Event ledger [done]

- Refs: AC-021
- Files: src/core/ledger.js
- Notes: Append-only JSONL under the configurable state root, outside the repository. A corrupt trailing line is skipped, never fatal. Prunes to a retention bound — the policy Q-005 must answer; default thirty runs until it does.

## T-022 — Worker executor [done]

- Refs: AC-020
- Files: src/core/executor.js, src/core/agent.js
- Notes: Worktree per lane, headless agent invocation per task, one commit per task naming the task code, `--no-ff` merge back. Pure Node with no shell script and no terminal multiplexer, per D-002 — this is what keeps the container small and the tool portable. A merge conflict stops that lane and asks for a human; it never resolves silently. The agent invocation is INJECTED rather than hard-called: ASM-001 is still open, so pinning the call site would bake in an unverified assumption, and the logic worth testing — worktree lifecycle, one-commit rule, undeclared-file detection — must be testable without a model call. Worktrees live in the STATE directory, never inside the repository: one created in the project shows up as untracked debris in the user's own `git status`.

## T-023 — Lane and task re-run [done]

- Refs: AC-022
- Files: src/core/rerun.js
- Notes: Addressable targets — one lane, one sequential task, or the gate alone. Re-running a lane cleans its previous worktree and branch first. Work merged from other lanes is never touched.

## T-024 — Prompt builder for red gates [done]

- Refs: AC-023
- Files: src/core/prompts.js
- Notes: Turn a red gate plus its findings into a paste-ready prompt naming the gate, the codes and the affected files. Lives in core, so the CLI and `--json` emit the same text.

<!-- Milestone M7 (Docker) and T-025 (container packaging) were removed — see
     RFC D-013. The container existed to isolate the page from the project; the
     page is now read-only and the tool has zero dependencies, so the isolation
     it bought is structural. T-025 is not reused. -->

### Milestone M8 — Skill, templates and adoption

## T-026 — Init command and templates [done]

- Refs: AC-001, AC-002
- Files: src/core/init.js, payload/templates/SCOPE.md, payload/templates/PRD.md, payload/templates/RFC.md, payload/templates/TDD.md, payload/templates/CONSTITUTION.md, payload/AGENTS.md
- Notes: Idempotent by construction — create only what is missing, never overwrite, and report created versus kept. The constitution template starts from `Projeto_Agent`'s existing P-001 and P-002.

## T-027 — Agent skill [done]

- Refs: AC-050
- Files: payload/claude/skills/adp/SKILL.md
- Notes: The agent contract. Must carry a vocabulary table mapping codes to the plain names used with the user, the non-negotiable rules, a translated finding catalogue, an explicit iteration cap so a failing gate escalates to the human instead of looping, and a graceful-degradation clause requiring any manual audit to be labelled as weak proof.

## T-028 — Rewrite AGENTS.md for delivery modes and proof [done]

- Refs: AC-018
- Files: payload/AGENTS.md, .exemplo/AGENTS.md
- Notes: The delivery-mode half was already done — `local-only` is the default and the GitHub flow is mode-conditional per D-008. What was missing was larger: the document never mentioned `verify`, so an agent reading it would see `AC_WITHOUT_PROOF` on every criterion with no command that resolves it, and the natural way out is marking `[done]` by hand — the exact lie the tool exists to stop. Adds the proof section, the consent rule (never approve the test command for the human, `--yes` is not the agent's to use), and the parallel-execution commands. `.exemplo/AGENTS.md` is kept in step because the example must show what `init` writes today.

## T-034 — Payload integrity and the write guard [done]

- Refs: AC-039, AC-040
- Files: src/core/integrity.js, scripts/build-manifest.js, test/supply-chain.test.js
- Notes: SHA-256 per payload file into `payload/MANIFEST.json`; `init` verifies BEFORE writing, and a mismatch is fatal with no override flag. An extra file counts as a problem, not just an altered one — an undeclared hook has exactly the shape of an injected file. `assertInside` refuses any destination resolving outside the project rather than clamping it. The honest boundary is written into the module: this catches tampering after publication, never a malicious publish, which is what provenance is for.

## T-030 — Consent gate for the project's test command [done]

- Refs: AC-031, AC-032, AC-033
- Files: src/core/trust.js, test/trust.test.js
- Notes: Trust on first use bound to a SHA-256 of the normalised command (D-012). The store lives in the state directory outside the repository — that is the load-bearing property, and a test asserts it rather than trusting the constant. Fails closed everywhere: corrupt store, changed command, non-TTY without `--yes`, and `ADP_TRUST_TEST_COMMAND` matched exactly against `1` rather than coerced. Built before `verify` (T-010) on purpose, so the gate exists before the thing it gates.

### Milestone M4 — Read-only monitor

## T-031 — State projection for the page [done]

- Refs: AC-034, AC-037
- Files: src/server/state.js
- Notes: project → plain object, plus a cheap mtime/size fingerprint so an unchanged project is reported without reparsing (ASM-006). The fingerprint is deliberately over-sensitive: a false "changed" costs one reparse, a false "unchanged" shows stale state and calls it current.

## T-032 — Read-only HTTP server [done]

- Refs: AC-035, AC-036, AC-038
- Files: src/server/server.js
- Notes: `node:http`, no dependency. Any method other than GET/HEAD is refused **before** the path is examined, so adding a route later cannot open a write path by accident. Non-loopback Host refused (DNS rebinding). EADDRINUSE fails loudly and starts nothing. A structural test asserts the file contains no write call and never reads a request body.

## T-033 — The page [done]

- Refs: AC-034
- Files: src/ui/index.html, src/ui/app.css, src/ui/app.js
- Notes: Three readable source files inlined into one self-contained document at request time — self-contained as delivered, editable as source, no bundler. Rendered with `textContent` throughout: the documents are the user's own, but a PRD title is still untrusted input. Polls with the fingerprint and shows an explicit stale indicator after repeated failures rather than presenting old numbers under a green light.

## T-035 — Worktree cleanup [done]

- Refs: AC-043
- Files: src/core/executor.js
- Notes: A lane is cleaned as soon as its work is merged — the worktree and branch are then duplicates. An UNMERGED lane is never cleaned without `--force`: its branch is the only place that work exists, and tidiness does not outrank not losing work. Worktrees are enumerated from `git worktree list`, not from a directory scan, because git is the authority and a hand-deleted directory leaves a registration only git knows about. Only worktrees under the state directory or on an `adp/` branch are touched — a worktree the human created is none of this tool's business.

## T-036 — Session resume and checkpoint [done]

- Refs: AC-041, AC-042
- Files: src/core/resume.js
- Notes: Follows D-001 rather than inventing a store. Gate states, the first red gate, unproven counts, proof staleness and the next action are all DERIVED, so they cannot go stale or disagree with the repository. The single exception is intent — what the last session was in the middle of — which leaves no trace in any document; that note is stored in the state directory and rendered separately, labelled as the only part that can be wrong. Only `in-progress` counts as in flight: `in-test` is a resting state and on a mature project is most of the board, so listing it would cost a fresh session the very tokens this briefing exists to save.

## T-037 — Declared ordering and read-only file declarations [done]

- Refs: AC-044, AC-045, AC-046
- Files: src/parsers/tdd.js, src/core/plan.js
- Notes: Implements D-014. The parser gains `Reads:` and `Depends on:`; the planner stops treating one declaration as the answer to two questions. Lanes are still union-find over WRITTEN files, so safety is unchanged; ordering is a separate directed graph laid over the result. Three refusals rather than a guess: a cycle among tasks, a dependency on an unknown id, and a dependency on a task already excluded — the last one propagated to a fixpoint, because the sequential remainder is printed and not executed, so anything waiting on it waits forever. Mutually dependent LANES are a different case and are merged rather than refused: two lanes can each need to follow the other without any single task being circular, and there is no contradiction to report, only no parallelism to have. Strongly connected components do both jobs — reporting the first, contracting the second.

## T-038 — In-lane verification of each task [done]

- Refs: AC-047, AC-048
- Files: src/core/verify.js, src/core/executor.js, src/core/rerun.js, src/cli.js
- Reads: src/core/trust.js
- Depends on: T-037
- Notes: Implements D-015. `makeLaneTestRunner` reuses the `adp trust` consent rather than asking for a new one, and returns a null runner with a reason instead of throwing — a lane that cannot run tests is still worth running. The executor runs it AFTER the commit so a failing task's work survives on its branch. The CLI change is the one that makes D-014 real at runtime: the run loop iterates stages and merges each before branching the next, since a lane sees the work it depends on only because that work already landed. `linkIntoWorktree` exists because a fresh worktree has no installed dependencies, and it links only what git confirms is ignored.

## T-039 — Report references that can never grant proof [done]

- Refs: AC-049
- Files: src/core/audit.js, src/core/gates.js
- Notes: Found while promoting the proven tasks to `[done]`. The proof check computes `task.refs.filter(r => knownAc.has(r))` and every discarded reference vanishes — so T-001 and T-027, which reference only a story, looked healthy in the audit while being permanently unprovable. `REF_BROKEN` stays quiet because the references resolve; nothing else was watching. Fires only when a task carries NO criterion at all, because referencing a story alongside a criterion is normal and costs nothing. A warning rather than an error, in G3: the breakdown is still implementable, but the task can never legitimately reach `[done]` and the person reading the audit should not have to run a script to find that out.

## T-040 — Shared payload/project install map [done]

- Refs: AC-051
- Files: src/core/paths.js, src/core/install-map.js
- Notes: `initProject()` used to decide where each payload file lands with several near-duplicate conditionals, one per subtree (skills directory depends on agent, `minimal` narrows to just the `adp` skill, and so on). `adp upgrade` needs to recompute the exact same mapping to classify a file correctly, and a second implementation that could silently drift from the first is worse than the shortcut it would save. `buildInstallPlan()` is the one place that knows the answer; both `init.js` and `upgrade.js` call it. `templates/SCOPE.md` and the three per-feature scaffolds are excluded permanently — SCOPE.md is filled in per project, and PRD.md/RFC.md/TDD.md belong to `newFeature()`, never to `initProject()`.

## T-041 — Install lockfile [done]

- Refs: AC-051
- Files: src/core/init.js, src/core/integrity.js
- Depends on: T-040
- Reads: src/core/install-map.js
- Notes: `initProject()` now drives every payload write off one loop over `buildInstallPlan()`'s output instead of several separate `copyTreeIfMissing` calls, collapsing near-duplicate code as a side effect. Each real write is recorded into `report.installed` with its SHA-256 (via `integrity.js`'s now-exported `sha256`), and `.spec/.adp-install.json` is written last, through the same `writeIfMissing()` every other file goes through — so re-running `init` never touches an existing lockfile, the same guarantee every other file in this installer already has. Written only when the payload was manifest-verified; an unverified payload produces no lockfile rather than one built on hashes nothing checked.

## T-042 — The 0.5.0 migration and the registry [done]

- Refs: AC-056
- Files: src/migrations/0.5.0.js, src/migrations/index.js
- Notes: 0.5.0 renamed every Portuguese engine token to English and shipped with no migration — CHANGELOG.md's documented fix was "find-and-replace by hand." This is that migration, written after the fact. Scope is `.spec/**/*.md` only; a finding code inside a `.mjs` script is the user's code, not a document, and this repository's own `check-preflight.mjs` is the concrete case that rules it out. Idempotent by construction rather than by a separate flag: every regex matches only the OLD spelling, so a document already in English matches nothing and a second run is a byte-for-byte no-op — `check()` and `apply()` both rely on exactly that. The registry (`pendingMigrations`) does a plain numeric per-segment version compare, no semver dependency, consistent with this being a zero-dependency package.

## T-043 — `adp upgrade` [done]

- Refs: AC-052, AC-053, AC-054, AC-055
- Files: src/core/upgrade.js
- Depends on: T-040, T-041, T-042
- Notes: Classifies every payload-tracked file into intact/edited/new/removed/deleted by comparing the lockfile against the current manifest. A fifth bucket beyond the PRD's four was necessary: a file the lockfile knows about that is simply absent from disk fits neither "intact" (nothing to hash) nor "edited" (nothing to sidecar), so `deleted` is its own reported, never-recreated bucket. A project with no lockfile at all (bootstrap mode — the actual shape of a 0.4.x install, which predates this feature) cannot tell "untouched" from "edited" per file, so every existing file is treated as edited rather than guessed at; nothing already on disk is ever overwritten by `--apply` as a result. Migrations run before the file classification is written. `--only-migrations` (Q-008 in the 0.6.0 scope: no separate `adp migrate` command) skips the payload-file half entirely, including the lockfile rewrite, because a migrations-only run must not claim the whole upgrade happened.

## T-044 — CLI wiring: `upgrade` command and doctor drift warning [done]

- Refs: AC-057
- Files: src/cli.js, src/version.js
- Depends on: T-043
- Notes: `doctor` moves from ring 1 to ring 2 — it now needs `config.specDir` to find the project's own lockfile, still far short of a full project load — and prints a version-drift warning naming the exact `adp upgrade` command when the project's lockfile is behind the running tool. Silent when there is no lockfile at all: a pre-lockfile project is not "drifted," it is unmeasured, and `adp upgrade` itself already handles that case. `src/version.js` replaces the version-reading block that was inline in this file, so the tool holds its own version exactly once.

## T-029 — Test suite [done]

- Refs: AC-018
- Files: test/parsers.test.js, test/audit.test.js, test/gates.test.js, test/plan.test.js, test/offline.e2e.test.js
- Notes: `node:test`, no framework. `offline.e2e.test.js` is the one that matters most: `.exemplo/` is copied into a temporary git repository with no remote, its proof record deleted, and the full chain — parse, verify, audit — runs to a clean `--ci` verdict.

"No network" is asserted rather than hoped for: `net.Socket.connect`, `dns.lookup`, `dns.resolve`, `http.request`, `https.request` and `fetch` are each replaced with a tripwire that records and throws, so any reach for the network fails the test naming the call. A test that merely ran with the wifi off would pass on a laptop and prove nothing in CI.

"No GitHub CLI" is asserted by planting a DECOY `gh` and `hub` on the PATH that log being called. Stripping them from the PATH instead is not portable — on some machines `git` and `gh` share a directory — and "works when gh is absent" is the weaker claim. Given every opportunity to call it, the chain does not.

Using the shipped example as the fixture means this test also fails the day `.exemplo/` stops being a valid project, which is otherwise discovered months later by a user. Every test carries its `@spec:AC-xxx` annotation — the tool proves itself with its own mechanism.

---

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
