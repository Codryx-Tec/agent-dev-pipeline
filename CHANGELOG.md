# Changelog

Notable changes per release. Dates are the release date, newest first.

This file starts at 0.5.0. Earlier releases are described from their commits and
are summarised here for completeness rather than reconstructed in detail — the
git history is the authority for anything before this file existed.

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
