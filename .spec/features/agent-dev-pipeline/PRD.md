# PRD: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: PRD — WHAT, for WHOM, WHY
> owns: US-xxx (user stories) · AC-xxx (acceptance criteria)
> status: draft
> gate: G1 — this document is approved when every US has at least one AC with a
> complete Given/When/Then block and no blocking question remains open in `RFC.md`.

## Context

`Projeto_Agent` already carries the skeleton of a spec-anchored workflow: a
constitution with ten principles, eight role agents, twelve skills, and a pair of
scripts under `.spec/scripts/`. Two gaps make that skeleton unable to hold weight.
`verify.js` scans for `@ref:` annotations instead of running tests, so "proof"
today means *an annotation exists*, not *a test passed*. And `audit.js` never
executes the `verification(forbidden|required)` regexes the constitution
declares — the file itself admits this under P-007.

Agent Dev Pipeline closes both, and adds the discipline that makes them usable:
documents written in the order that makes sense (what → which path → how), gates
that refuse to advance until each one holds, and a single rule underneath — the
only way work is done is by the engine agreeing that it is.

The measurable outcome we want: **at any moment, one command answers "does the
code still do what the documents say?" — and the answer is an exit code.**

## Vocabulary

| Code | Name used with the user |
|---|---|
| US-xxx | user story — who needs it, what, and why |
| AC-xxx | acceptance criterion — an observable result a test can check |
| ASM-xxx | assumption — a gap filled with a guess, not yet confirmed |
| Q-xxx | open question — a decision the product owner still owes |
| T-xxx | task — a step of implementation (lives in `TDD.md`) |
| P-xxx | principle — a non-negotiable constraint (lives in `CONSTITUTION.md`) |
| G0–G5 | gate — a mechanical checkpoint between phases |

---

## Stories

### US-001 — The captain starts the pipeline in a project

As a developer, I want one command to turn any folder into a pipeline-driven
project, so that I can start working without learning a configuration format
first.

#### AC-001 — Init scaffolds and starts

- **Given** an empty folder with `git` initialized and no `.spec/` directory
- **When** the captain runs the init command in that folder
- **Then** `.spec/` is created with the constitution, the config file and the
  document templates, the agent skill is installed into the agent's skill
  directory, and the report names every path created and every path kept

#### AC-002 — Init is idempotent and never destroys

- **Given** a folder where init has already run and whose `.spec/` files were
  edited by the captain
- **When** the captain runs init again
- **Then** the process exits 0, every pre-existing file keeps its content byte
  for byte, only genuinely missing files are created, and the output lists what
  was created versus what was kept

<!-- AC-003 retired with the monitor — see RFC D-011. It described a port
     conflict on the page server, and there is no server. The code is NOT
     reused: a criterion code names one thing for the life of the project, and
     recycling it would make every reference written before today point at
     something else. -->

### US-002 — The captain writes the PRD before anything else

As a product owner, I want the pipeline to demand a PRD before design work
starts, so that we never build the wrong thing efficiently.

#### AC-004 — Scope gate blocks the chain

- **Given** a project whose `SCOPE.md` status is not `Approved`
- **When** the gate check runs
- **Then** gate G0 reports red, the reason names the missing approval, and gates
  G1 through G5 are reported as blocked rather than evaluated

#### AC-005 — A story without a criterion is a finding

- **Given** a `PRD.md` containing a user story with no acceptance criterion under it
- **When** the audit runs
- **Then** the finding `US_WITHOUT_AC` is reported with the story code, the file and
  the line number, and gate G1 reports red

#### AC-006 — An incomplete criterion is a finding

- **Given** a `PRD.md` containing an acceptance criterion missing any one of its
  Given, When or Then clauses
- **When** the audit runs
- **Then** the finding `AC_INCOMPLETE` is reported naming which clause is
  missing, and gate G1 reports red

### US-003 — The captain records which path was chosen, and why

As a tech lead, I want the alternatives we rejected written down next to the one
we picked, so that six months from now nobody re-litigates a settled decision
from memory.

#### AC-007 — A decision without alternatives is a finding

- **Given** an `RFC.md` containing a decision section that records fewer than two
  alternatives considered
- **When** the audit runs
- **Then** the finding `DECISION_WITHOUT_ALTERNATIVE` is reported with the decision
  heading and the file location, and gate G2 reports red

#### AC-008 — Assumptions and questions are mandatory sections

- **Given** an `RFC.md` with no assumptions section or no open-questions section
- **When** the audit runs
- **Then** the finding `SECTION_MISSING` is reported naming the missing section,
  and gate G2 reports red

#### AC-009 — An open assumption blocks completion, not progress

- **Given** a feature whose `RFC.md` holds an assumption with status `open`
- **When** the audit runs while the feature status is below `implemented`
- **Then** the assumption is reported at warning severity and gate G2 may still
  pass; **and when** the same audit runs with the feature status at
  `implemented` or above, the finding `ASM_OPEN` is reported as an error and
  gate G5 reports red

### US-004 — The captain gets a technical breakdown that a machine can plan

As a tech lead, I want the TDD to state which files each task touches, so that
the planner can compute what is safe to run in parallel instead of guessing.

#### AC-010 — Every criterion must be covered by a task

- **Given** a `PRD.md` acceptance criterion that no task in `TDD.md` references
- **When** the audit runs
- **Then** the finding `AC_WITHOUT_TASK` is reported with the criterion code, and
  gate G3 reports red

#### AC-011 — A task referencing a code that does not exist is a finding

- **Given** a task in `TDD.md` whose references name a story or criterion absent
  from every document in the project
- **When** the audit runs
- **Then** the finding `REF_BROKEN` is reported naming the task and the dangling
  reference, and gate G3 reports red

#### AC-012 — A task without declared files is never parallelized

- **Given** a task in `TDD.md` that declares no file list
- **When** the execution plan is built
- **Then** that task is placed in the sequential remainder rather than any
  parallel lane, and the plan states the reason as unknown file footprint

### US-005 — The captain cannot declare a task done

As a captain, I want "done" to be a verdict the engine reaches rather than a word
I type, so that a status in a document can never outrun the proof behind it.

<!-- AC-013 and AC-015 retired with the monitor — see RFC D-011. Both described
     board mechanics (derived columns, a refused drag), and there is no board.
     AC-014 stays: the rule it carries is the product, and it was only ever
     phrased as a projection. It is restated below against the audit, which is
     where the rule now lives. -->

#### AC-014 — Done requires proof, not a status word

- **Given** a task marked with the completed status whose referenced acceptance
  criteria have no PASS proof recorded
- **When** the audit runs
- **Then** the finding `TASK_DONE_WITHOUT_PROOF` is reported naming the task and
  the unproven criteria, and gate G5 reports red

#### AC-049 — A task no criterion can prove is named, not silently skipped

- **Given** a task whose `Refs:` resolve but reach no acceptance criterion — a
  story reference, for example
- **When** the audit runs
- **Then** the finding `REF_WITHOUT_AC` is reported naming the task and the
  references it does carry, because proof is granted per criterion and a task
  with none can never reach the completed status

### US-006 — The captain gets proof from real tests, with no GitHub

As a developer working on an on-premise machine, I want the whole loop to close
locally, so that a network outage or a service usage limit never blocks proving
that the work is done.

#### AC-016 — Proof comes from executing the test command

- **Given** a project whose configuration declares a test command and a reporter
- **When** verification runs for a feature
- **Then** the test command is executed as a child process, per-test results are
  extracted from its output, each acceptance criterion is matched to tests
  carrying its annotation, and the results are written to the verification
  directory stamped with a timestamp and the current git revision

#### AC-017 — A skipped test is never proof

- **Given** a test annotated with an acceptance criterion that the runner reports
  as skipped, pending or todo
- **When** verification runs
- **Then** that criterion is recorded with the verdict `skip`, it is not counted
  as proven, and a subsequent audit reports `AC_WITHOUT_PROOF` for it

#### AC-018 — The loop closes with no remote configured

- **Given** a repository with no git remote, no GitHub CLI installed and no
  network access
- **When** the captain runs the full chain from specification through
  verification to audit
- **Then** every gate is evaluated, the audit produces its verdict as an exit
  code, and no step attempts a network call

### US-007 — The captain runs work in the background without burning context

As a captain driving several tasks, I want each task to run in its own isolated
window and report back a summary, so that the orchestrating session never has to
hold the details of work it is not doing.

#### AC-019 — Disjoint tasks become parallel lanes

- **Given** a `TDD.md` with three pending tasks where two declare non-overlapping
  file lists and the third overlaps one of them
- **When** the execution plan is built
- **Then** the plan contains exactly two lanes, the two overlapping tasks land in
  the same lane in document order, and each lane is assigned its own branch name
  and worktree path

#### AC-020 — Each lane runs in an isolated worktree

- **Given** an execution plan with two lanes and a clean working tree
- **When** execution starts
- **Then** each lane runs in its own git worktree on its own branch, each task
  produces exactly one commit whose message names the task code, and the
  captain's main working tree is untouched while lanes run

#### AC-021 — The orchestrator never reads worker transcripts

- **Given** a running execution with worker output being captured
- **When** the orchestrator reports progress
- **Then** the report is built from task status, the event ledger and each
  worker's short final summary, and the raw worker output stream is written to
  the state directory outside the repository and read only when explicitly
  requested

#### AC-022 — A failed lane is re-runnable alone

- **Given** an execution where one lane failed and the others completed and merged
- **When** the captain re-runs only the failed lane
- **Then** that lane's previous worktree and branch are cleaned before being
  recreated, only that lane's tasks execute, and the work already merged from
  other lanes remains untouched

### US-008 — The captain always knows what to ask the AI next

As a captain, I want every red light to come with the exact sentence to send
back to the AI, so that I never have to translate a machine finding into a
request myself.

#### AC-023 — Every red gate produces a ready prompt

- **Given** any gate reporting red with at least one finding
- **When** the captain asks the tool for that gate's prompt
- **Then** the output is a copy-ready block naming the gate, the finding codes in
  plain language and the affected files, requiring no further editing before it
  is sent to an AI

#### AC-024 — Findings are readable without knowing the codes

- **Given** an audit producing findings
- **When** the findings are rendered in the terminal
- **Then** each one shows a human-readable name first with the stable code in
  parentheses, and the code is identical in every locale

#### AC-050 — The agent contract carries what an agent needs to obey it

- **Given** the `adp` skill as it ships, which `init` copies into a project
- **When** its content is read
- **Then** it carries the vocabulary table mapping every traceability code to the
  plain name used with a person, the finding catalogue, the rule that proof comes
  only from `verify`, an explicit cap on how many times a red gate may be retried
  before the human is brought in, and the requirement that a manual audit be
  labelled as weak proof

<!-- US-009, AC-025 and AC-026 retired with the monitor — see RFC D-011. Both
     criteria were about a browser page keeping itself current; with no page
     there is nothing to go stale. The concern they protected — never presenting
     old state as current — survives structurally instead: every command re-reads
     the documents from disk, so there is no cached state that could lie. -->

### US-010 — The captain is told when the documentation has gone stale

As a maintainer, I want the tool to notice that code moved after the last proof,
so that stale documentation is reported instead of quietly assumed current.

#### AC-027 — Code changed after proof is reported

- **Given** a feature whose acceptance criteria were all proven, followed by a
  modification to a source or test file covered by the configured globs
- **When** the audit runs
- **Then** the finding `PROOF_STALE` is reported for that feature and gate G4
  reports red until verification runs again

#### AC-028 — A test pointing at a removed criterion is reported

- **Given** a test annotated with an acceptance criterion code that no longer
  exists in any document
- **When** the audit runs
- **Then** the finding `TEST_ORPHAN` is reported with the test file and line, and
  gate G5 reports red

#### AC-029 — A declared principle without executable verification is a finding

- **Given** a constitution principle at the `[MUST]` level declaring no executable
  verification
- **When** the audit runs
- **Then** the finding `PRINCIPLE_WITHOUT_VERIFICATION` is reported naming the
  principle, and gate G5 reports red

#### AC-030 — A declared verification is executed, not merely declared

- **Given** a constitution principle declaring a forbidden pattern over a file glob,
  and a file matching that glob containing that pattern
- **When** the audit runs
- **Then** the finding `PRINCIPLE_VIOLATED` is reported with the offending file and
  line number, and gate G5 reports red

### US-011 — The captain is not made to run a stranger's code

As anyone who clones a repository to look at it, I want the tool to refuse to
execute commands the repository supplies until I have seen them, so that reading
someone's project cannot become running their code.

#### AC-031 — An unapproved test command is refused, showing the command

- **Given** a project whose configuration declares a test command that has never
  been approved on this machine
- **When** verification is attempted
- **Then** nothing is executed, the exact command is displayed, and the message
  names both how to approve it and the environment variable that approves it in CI

#### AC-032 — Approval binds to the command, not to the project

- **Given** a project whose test command was approved, and whose configuration is
  then edited to declare a different command
- **When** verification is attempted
- **Then** the new command is refused, the refusal shows both the previously
  approved command and the current one, and approval is required again

#### AC-033 — The consent record cannot be supplied by the repository

- **Given** any project, however its files are arranged
- **When** approval is granted and then looked up
- **Then** the record is stored outside the project directory, so no file inside
  the repository can grant that repository permission to execute

### US-012 — The captain sees the specification without touching the project

As a captain, I want a page that shows the gates and the progress of every
feature, so that I can see where the work stands without reading six documents —
and I want it to be incapable of changing anything in the project it is watching.

#### AC-034 — The page reports the engine's state, self-contained

- **Given** a project with at least one feature
- **When** the page is requested
- **Then** one document is returned with its styles and behaviour inlined and no
  external reference of any kind, showing the six gates with their states, the
  findings of the first red gate, and per-feature counts in which no criterion is
  shown as proven unless a verification record says a test passed

#### AC-035 — The page cannot change the project

- **Given** the monitor running against any project
- **When** a request arrives with any method other than GET or HEAD, at any path,
  existing or not
- **Then** the request is refused with 405 before the path is examined, no request
  body is ever read, and nothing on disk is modified

#### AC-036 — Access is confined to the machine it runs on

- **Given** the monitor bound to loopback
- **When** a request arrives whose Host header is not a loopback name
- **Then** the request is refused, and every response forbids caching, embedding
  and content-type sniffing

#### AC-037 — An unchanged project costs nothing to report

- **Given** a page holding the fingerprint from its previous read
- **When** it asks again and no watched document has been modified
- **Then** the answer says so without the documents being parsed again

#### AC-038 — A port already in use fails loudly

- **Given** the configured port is already bound by another process
- **When** the monitor is started
- **Then** it exits non-zero naming the port and the flag that overrides it, no
  listener is left behind, and no other port is chosen silently

### US-013 — The captain is not made to install a tampered payload

As anyone installing the tool, I want it to check what it is about to write into
my repository before it writes it, so that a corrupted or altered download cannot
plant an executable hook in my project.

#### AC-039 — A payload that does not match its manifest is refused before any write

- **Given** a copy of the tool whose payload has been altered, or which carries a
  file the manifest does not declare
- **When** init is run against any project
- **Then** nothing is written, the offending file is named, and the process exits
  non-zero; **and given** a copy carrying no manifest at all, init proceeds but
  reports the payload as unverified rather than silently claiming it is fine

#### AC-040 — A write resolving outside the project is refused

- **Given** any destination that resolves outside the target project directory
- **When** init attempts to write it
- **Then** the write is refused naming both paths, rather than being clamped back
  inside the project

### US-014 — The captain does not pay twice to learn where the work stands

As a captain whose session was cleared, I want one command that tells me where
the project stands, so that a new session does not re-read six documents to
reconstruct an answer the engine already holds.

#### AC-041 — The briefing is derived, and says which part is not

- **Given** a project with gates evaluated, tasks at various statuses and a
  proof record
- **When** the resume briefing is requested
- **Then** the gate states, the first red gate, the unproven count, the staleness
  of the last proof and the next action are all computed from the repository, and
  any stored note is shown separately and labelled as the only part that can be
  out of date

#### AC-042 — A stored note belongs to one project only

- **Given** a note recorded for one project
- **When** the briefing is built for a different project
- **Then** that note is absent, and the briefing is still complete from what it
  can derive

#### AC-043 — A merged lane is cleaned up; an unmerged one is kept

- **Given** two lanes, one whose work has been merged and one whose has not
- **When** cleanup runs
- **Then** the merged lane's worktree and branch are removed, the unmerged lane's
  are kept with the reason given, and a worktree this tool did not create is
  never touched

### US-015 — The captain orders the work without spending the parallelism

As a captain breaking a feature into tasks, I want to say that one task runs
after another, and to name the files a task only reads, so that expressing an
order does not cost me the concurrency that made background execution worth
having.

#### AC-044 — A declared order is honoured without collapsing lanes

- **Given** pending tasks writing disjoint files, one of which declares
  `Depends on:` on another
- **When** the execution plan is built
- **Then** they remain separate lanes, the dependent lane is scheduled in a later
  stage than the one it follows, and tasks sharing a lane are ordered so that a
  dependency always runs before its dependent

#### AC-045 — A file a task only reads costs no parallelism, and says so

- **Given** two tasks writing disjoint files, one of which declares the other's
  file under `Reads:`
- **When** the execution plan is built
- **Then** they are placed in separate lanes, and the plan reports that the
  reader will see the version from before the run unless it also declares
  `Depends on:` on the writer

#### AC-046 — An order that cannot be satisfied is refused, not invented

- **Given** tasks forming a dependency cycle, or depending on an id no task
  declares, or depending on a task that will not run in this plan
- **When** the execution plan is built
- **Then** none of them is placed in a lane, each appears in the sequential
  remainder with the reason named, and no partial order is chosen on their behalf

### US-016 — The captain learns which task broke the tests, in the run that broke them

As a captain running tasks in the background, I want the suite run inside each
lane and its result attached to the task that just committed, so that a failure
belongs to something instead of surfacing after the merge belonging to nobody.

#### AC-047 — The approved test command runs in the lane and names the culprit

- **Given** a lane whose task has committed, in a project whose test command has
  been approved
- **When** the lane runs
- **Then** that command is executed inside the lane's worktree, a non-zero exit
  fails that task by name and stops the lane, the commit it produced is kept, and
  the failure is recorded against the task in the event ledger

#### AC-048 — In-lane verification needs no grant beyond the one already given

- **Given** a project that declares no test command, or one whose command has not
  been approved on this machine
- **When** a lane runs
- **Then** nothing from the repository is executed, the run proceeds and reports
  why the tests were not run, and no permission is requested from or granted to
  the agent

### US-017 — The captain upgrades a project across tool versions without losing edits

As a captain who installed this tool on an older version, I want `init` to
record what it wrote and `upgrade` to compare that record against the current
release, so that I can move to a new version in one command without a
hand-edited file being silently overwritten or a rename shipped as a table
someone has to apply by hand.

#### AC-051 — Init records what it installed, with a hash per file

- **Given** a project where `init` has just run
- **When** the install lockfile is inspected
- **Then** it contains the tool version and a SHA-256 hash for every
  payload-mapped file it wrote, excluding `SCOPE.md`, whose content is
  personalised per project and matches no single payload hash

#### AC-052 — An untouched or newly-shipped file is installed without asking

- **Given** a file recorded in the lockfile whose content on disk still
  matches the hash recorded at install, and separately a file the current
  payload ships that the lockfile does not yet know about
- **When** `adp upgrade --apply` runs
- **Then** the first is refreshed silently and the second is created, and
  both are recorded in the lockfile afterward

#### AC-053 — An edited file is never overwritten by upgrade

- **Given** a file recorded in the lockfile whose content on disk no longer
  matches the hash recorded at install
- **When** `adp upgrade --apply` runs
- **Then** the file on disk is left untouched, a `<file>.new` sidecar
  carrying the current payload's version is written beside it, and nothing
  is written at all when `--apply` is omitted

#### AC-054 — A project with no lockfile still upgrades without loss

- **Given** a project with payload-mapped files already on disk but no
  install lockfile — the state of every project installed before this
  feature existed
- **When** `adp upgrade` runs
- **Then** every existing file is classified as edited rather than intact, so
  `--apply` overwrites nothing that was already there, and a fresh lockfile
  marked as bootstrapped is written once it does run

#### AC-055 — A missing or discontinued file is reported, never silently recreated or deleted

- **Given** a file the lockfile records that is absent from disk, and
  separately a file the lockfile records that the current payload no longer
  ships
- **When** `adp upgrade` runs
- **Then** the first is reported as deleted and the second as removed, and
  `--apply` neither recreates the first nor deletes the second

#### AC-056 — A grammar rename ships as a migration, not a manual instruction

- **Given** a `.spec/**` document written in a grammar an earlier release
  replaced, and a registry entry for that rename
- **When** `adp upgrade` runs the pending migration
- **Then** every renamed status word, field label and finding code in that
  document is rewritten to its current form, a second run changes nothing
  further, and no file outside `.spec/**/*.md` is touched

#### AC-057 — doctor names the exact command when a project has fallen behind

- **Given** a project whose lockfile records an older tool version than the
  one currently running
- **When** `adp doctor` runs
- **Then** it prints a warning naming both versions and the exact `adp
  upgrade` command to resolve it, and prints nothing when there is no
  lockfile at all or when the versions already match

## Out of scope for this PRD

- The GitHub delivery mode, its issue and pull-request mapping, and any rate-limit
  handling. Deferred to post-MVP and recorded as a decision in `RFC.md`.
- The lessons-learned layer with mechanical backing, present in the reference
  project. Valuable, but it depends on a signal history that only becomes
  meaningful after several features have run through the chain.
- Any authentication, multi-user or remote-hosting concern.

## Assumptions

Assumptions are owned by `RFC.md`. This document records none of its own; where a
gap was filled while writing these stories, it is registered there as an ASM-xxx.

## Open questions

Open questions are owned by `RFC.md`. Q-001 through Q-003 raised in `SCOPE.md`
are tracked there.
