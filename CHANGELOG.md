# Changelog

Notable changes per release. Dates are the release date, newest first.

This file starts at 0.5.0. Earlier releases are described from their commits and
are summarised here for completeness rather than reconstructed in detail — the
git history is the authority for anything before this file existed.

## [Unreleased]

Work toward 0.6.0, per `.spec/SCOPE-0.6.0.md`.

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
