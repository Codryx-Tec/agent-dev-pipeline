# Changelog

Notable changes per release. Dates are the release date, newest first.

This file starts at 0.5.0. Earlier releases are described from their commits and
are summarised here for completeness rather than reconstructed in detail — the
git history is the authority for anything before this file existed.

## [0.6.0] — 2026-08-14

Per `.spec/SCOPE-0.6.0.md`. This repository's own `adp audit --ci` is green
under this grammar, self-audited in CI on every push (AC-P7) — the readiness
criterion the scope document set for this release.

### ⚠️ Breaking

**The document chain splits: PRD/RFC/TDD becomes PRD/RFC/DESIGN/SPEC.**
`PRD.md` is prose only now — `US-xxx`/`AC-xxx`/`ASM-xxx`/`Q-xxx`/`T-xxx` all
moved to a new `SPEC.md`, "the layer the machine confers." `TDD.md` is
renamed `DESIGN.md` and keeps only the prose a human reads. Six gates became
seven: G3 (DESIGN) is presence-only, and the codes that used to live in G1
and G3 mostly relocated to a new G4 (SPEC). A `0.5→0.6.0` migration codemod
ships with `adp upgrade`.

**RFCs are un-nested: one flat, global family.** `RFC.md` is no longer a
fixed sibling of each feature's PRD — decision records live at
`.spec/rfc/RFC-<NNN>-<slug>.md`, created with `adp new --rfc <slug>` and
linked from any PRD's `> rfcs:` line. One RFC can now serve several PRDs;
one PRD often needs several, one per one-way door.

**Exit codes and paths, old → new:**

| | 0.5.x | 0.6.0 |
|---|---|---|
| Gates | six (G0–G5) | seven (G0–G6) |
| Exit code | `0`–`6` | `0`–`7` — the number is still the first gate that failed |
| Per-feature docs | `PRD.md`, `RFC.md`, `TDD.md` | `PRD.md`, `SPEC.md` (new), `DESIGN.md` (renamed from `TDD.md`) |
| RFC location | `.spec/features/<name>/RFC.md` | `.spec/rfc/RFC-<NNN>-<slug>.md`, flat and global |
| `US-xxx`/`AC-xxx` owner | `PRD.md` | `SPEC.md` |
| `ASM-xxx`/`Q-xxx` owner | `RFC.md` | `SPEC.md` |
| `T-xxx` owner | `TDD.md` | `SPEC.md` |

Any pipeline parsing the exit code as 0–6, or reading a file at the old
paths, breaks. `adp upgrade --apply` runs the codemod; `--json` output now
also carries a textual `gate` (`"G4"`) per finding so a consumer never has
to depend on the bare integer alone. The migration never discards a line of
user content — what it cannot place automatically becomes a finding
(`PRD_MISSING`, etc.), never silence.

### Added

- **An install lockfile and `adp upgrade`.** `.spec/.adp-install.json`
  records what was installed and its hashes; `adp upgrade` compares it
  against the current payload and applies pending file changes and document
  migrations. `adp doctor` warns on version drift.
- **The ceremony matrix.** A PRD's `> signals:` line (`multiple-teams`,
  `hard-to-reverse`, `money-or-pii`, `new-tech`, `large-estimate`) computes
  a ceremony level — light, medium, rfc-first or full — that decides
  whether G2 (RFC) and G3 (DESIGN) are due at all for that feature. Not due
  reads as a new gate state, `n/a`, distinct from red/green/blocked and
  never affecting the exit code. `adp new --signals <list>` scaffolds only
  what the computed level requires; `adp status` reports the level and
  signals per feature.
- **The MVP boundary, and `BACKLOG.md`.** `SCOPE.md`'s "MVP (prioritized)"
  checklist now names features by slug (`- [ ] <feature-slug> —
  description`); a PRD whose slug is missing there is `PRD_UNPLACED` (G1)
  — every PRD is declared in or nowhere at all, never in limbo. What
  hasn't started yet goes in the new, optional `BACKLOG.md` instead: plain
  prose, no tracking codes — an item that already looks like a real one
  (`AC-002`, `T-003`, ...) is `BACKLOG_ITEM_WITH_CODE`, a warning. No new
  command for promotion: remove the backlog line, run `adp new`, add the
  slug to the checklist. Deferred: `MVP_WIDENED` (detecting the boundary
  growing silently after approval), which needs a before/after snapshot
  this pass found no clean write-trigger for yet.
- **Function Point estimation (`adp profile` / `adp estimate`).** Hours are
  a PF count times the matching row of a hand-editable, seeded
  `.spec/metrics/hours-per-fp.json` table, cold-start by construction. The
  PF count itself is declared directly (`--pf <n>`) or produced by an
  automated counting loop the AI proposes and only a human confirms
  (`.spec/metrics/count-draft.json` → `adp estimate --review` →
  `--confirm`). Never proof either way.
- **Closing the estimation loop (`adp close --hours <n>`).** Records what a
  feature actually took and recalibrates the profile's table row from
  `hours-history.jsonl`, shared across every project on the machine (or a
  team path), never from one project's closures alone. The shared record
  carries no project, feature or person name by construction.
  `adp metrics import`/`export [--csv]` move history between machines;
  imported records are always marked as such. `adp estimate --history`
  reports cold-start vs. calibrated error.
- **Antipatterns as findings.** Eight checks from the source document:
  `PRD_WITH_SOLUTION`, `CONTEXT_WITHOUT_NUMBERS`, `STRAW_OPTION`,
  `OPTION_DO_NOTHING_MISSING`, `AC_NOT_OBSERVABLE`, `DOC_TOO_LONG`,
  `DOC_FOSSIL`, `DUPLICATE_PROSE`.
- **Brownfield adoption (`adp init --brownfield`).** Read-only recognition
  of an existing codebase's documentation, plus `.spec/BASELINE.md`: the
  pre-existing source files at adoption time, whose findings stay warnings
  — exempt from `--ci` escalation — until touched again. The new
  `archaeologist` role proposes a `Draft` `SCOPE.md` from the inventory.
  Deferred: the archiving step (`git mv` old docs into
  `project_old_artifacts/`), `BASELINE_WIDENED`, and a no-git mtime
  fallback for the ratchet.
- **The monitor returns, read-only (D-013).** Live lanes and tasks for the
  current run, the same paste-ready prompt `adp prompt` prints, and a debt
  panel (baseline file count, backlog count, last closure's declared
  hours). No write endpoint exists; a test asserts it rather than trusting
  the comment.
- **Declared deferral (`.spec/DEFERRALS.md`, `adp audit --strict`).** A
  dated, owned decision to live with a real finding for a while, instead
  of either blocking on it or disabling the gate: `DEFERRAL_TOO_BROAD`,
  `DEFERRAL_WITHOUT_OWNER`, `DEFERRAL_WITHOUT_DEADLINE`,
  `DEFERRAL_TOO_LONG`, `DEFERRAL_NOT_ELIGIBLE`, `DEFERRAL_EXPIRED`,
  `DEFERRAL_RENEWED_REPEATEDLY`. Only G5/G6 findings are eligible, and ten
  of those never are. `--strict` ignores every deferral and shows the real
  state.
- **The `./adp` wrapper and model per phase.** `init` writes an executable
  `./adp`/`adp.cmd`, pinned to the installing version, so CI is pinned and
  nobody hand-writes a shell alias; `--shell-alias` still offers one,
  opt-in, with confirmation. `agent.models.implementation` (generalizing
  `parallel.model`) lets a headless run request a specific model; a
  harness with no known model flag refuses rather than silently running
  its own default.
- **README/README.pt-BR/ARCHITECTURE/INSTALL/`payload/AGENTS.md`/the `adp`
  skill, rewritten** against what actually shipped, not what was assumed
  current. Two worked examples: `.exemplo/` gained `BACKLOG.md`, a real
  Function Point estimate and `adp close`, and a "do nothing" RFC
  alternative; `.exemplo-legado/` is new — a small, real pre-existing
  project adopted with `--brownfield`, demonstrating recognition, the
  archaeologist, `BASELINE.md`, and the ratchet.
- **CI now audits this repository's own `.spec/` on every push**, in the
  grammar it reads — `adp verify` then `adp audit --ci`, mirroring the
  existing check against `.exemplo/`. This is AC-P7's readiness criterion,
  wired in rather than checked by hand.
- **The conditional RFC (`Door:` on `Q-xxx`).** Every open question, answered
  or not, declares `Door: one-way` or `Door: two-way`. An undeclared door is
  `DOOR_UNDECLARED`; a still-open one-way door is `RFC_REQUIRED` — an
  irreversible or expensive-to-undo decision left open needs a real RFC, not
  a guess.
- **The RFC's executable structure.** A decision can opt into weighted
  criteria (`SCOPE.md`'s new `## 11. Decision criteria`, `W-xxx`) and a
  scoring matrix, by declaring `**Decision criteria:**` or `**Options
  considered**` itself — every decision written before this stays
  untouched. Opting in reaches four new checks: `CRITERIA_AFTER_OPTIONS`
  (order, completeness, at least 3 options including `OPT-000`, no gaps in
  the matrix), `RECOMMENDATION_AGAINST_SCORE` (a recommendation off the top
  score needs real justification), `CONTEXT_NUMBER_WITHOUT_SOURCE` (a
  number in an option's own prose with nothing backing it), and
  `OPTION_BEYOND_TEAM` (an option's `Requires:` tag naming a capability
  `adp profile --capabilities <list>` never declared — also auto-lights the
  `new-tech` ceremony signal for that feature).

### Fixed

- `.spec/verification/agent-dev-pipeline.json` was committed. Proof taken
  before a commit is proof of the parent commit, not that one, so a
  tracked copy read `PROOF_STALE` on the very next checkout — gitignored,
  same reasoning `.exemplo/`'s own copy already had.
- A test asserting that an unapproved test command is refused
  (`test/plan.test.js`, `lane tests need no grant beyond the one already
  given`) read `ADP_TRUST_TEST_COMMAND` from the ambient environment by
  default, so it passed for the wrong reason whenever that CI escape
  hatch was set around it — found by actually running the self-audit
  above end to end. Now isolates its own consent environment explicitly.

## [0.5.0] — 2026-08-04

### ⚠️ Breaking

**Every engine token is renamed to English.** A project carrying `.spec/`
documents written for 0.4.x stops parsing until they are rewritten. There is no
migration command; the rewrite is a find-and-replace.

| Family | Before → after |
|---|---|
| Task statuses | `pendente` → `pending`, `em-andamento` → `in-progress`, `em-teste` → `in-test`, `concluida` → `done` |
| Document statuses | `rascunho` → `draft`, `pronta` → `ready`, `em-implementacao` → `in-implementation`, `implementada` → `implemented`, `auditada` → `audited` |
| Assumption statuses | `aberta` → `open`, `confirmada` → `confirmed`, `invalidada` → `invalidated` |
| Question statuses | `aberta` → `open`, `respondida` → `answered` |
| Field labels | `Arquivos:` → `Files:`, `Lê:` → `Reads:`, `Depende:` → `Depends on:`, `Notas:` → `Notes:` |
| Finding codes | all 40, e.g. `AC_SEM_PROVA` → `AC_WITHOUT_PROOF`, `REF_QUEBRADA` → `REF_BROKEN`, `PRINCIPIO_VIOLADO` → `PRINCIPLE_VIOLATED` |

`Files:`, `Reads:` and `Depends on:` were already accepted as aliases in 0.4.x, so
documents using them keep working. The Portuguese spellings no longer parse.

Anything consuming `audit --json` or grepping finding codes in a pipeline needs
updating. What did **not** change: a finding code still never varies with the
reader's language — the guarantee was always about runtime, and the old wording
("never translated") made that hard to see.

Recorded as D-016 in the RFC, with the alternative that was rejected: accepting
both spellings with English canonical, which protects an installed base at the
cost of carrying two grammars for the life of the project.

### Added

- **`Depends on:` and `Reads:` on tasks.** Ordering is now declared rather than
  inferred. `Depends on: T-001` says this task runs after that one; `Reads:`
  names files a task reads without writing, which costs no parallelism because
  every lane has its own worktree. Before this, the only way to run last was to
  declare somebody else's files, which put you in their lane — ordering and
  parallelism were the same mechanism, so buying either spent the other. (D-014)
- **In-lane verification.** After each task commits, the executor runs the
  project's already-approved `testCommand` inside that lane's worktree and
  attributes the result to that task, so a failing test stops the lane and names
  the culprit instead of surfacing at `adp verify` after the merge. This uses the
  consent `adp trust` already holds and grants the agent nothing. Disable with
  `--no-lane-tests`. (D-015)
- **`parallel.linkIntoWorktree`** (default `["node_modules"]`) — symlinks
  gitignored build artefacts into a fresh worktree, without which `npm test` in a
  lane fails on a missing module rather than on the code. Only links paths that
  already exist and that git confirms are ignored.
- **`REF_WITHOUT_AC`** — reports a task whose references reach no acceptance
  criterion. Such a task can never be proven and can never legitimately reach
  `done`, but its story references resolve, so nothing was watching. Warning, in
  G3.

### Changed

- **The run loop iterates stages, merging each before branching the next.** This
  is what makes `Depends on:` mean anything at runtime — a lane sees its
  dependency's work only because that work already landed.
- **`--no-merge` refuses a plan with more than one stage**, rather than
  announcing an order it cannot deliver.
- A dependency cycle, a dependency on an unknown id, and a dependency on a task
  excluded from the plan all keep a task out of every lane with the reason
  stated. Mutually dependent *lanes* are merged into one instead, since that is
  not a contradiction — only an absence of parallelism.

### Fixed

- The gate table in `TDD.md` was missing `ASM_WITHOUT_CODE` and `REF_WITHOUT_AC`,
  which `gates.js` has carried for a while. The table is prose and drifts; the
  map is executed and cannot.

## [0.4.1] — 2026-08-03

First release published through the CI trusted-publishing path, carrying a
provenance attestation. Also shipped `LICENSE` and `THIRD-PARTY-NOTICES.md`,
added `adp run --allow-edits`, and fixed the parser reading a document's own
instructional comments as real elements — which made every project scaffolded by
`adp new` fail G2 on a question that existed only in the text explaining how to
write one.

## [0.4.0]

Bootstrapped from a laptop, because npm requires a package to exist before a
trusted publisher can be configured for it. Carries no provenance attestation;
that is the only difference from 0.4.1.
