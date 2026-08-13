# SPEC: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: SPEC — the layer the machine confers
> owns: US-xxx (stories) · AC-xxx (criteria) · ASM-xxx (assumptions) ·
> Q-xxx (open questions) · T-xxx (tasks)
> status: draft

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

### US-018 — The captain does not write a document nobody needs

As a captain building something small, I want the document chain to scale
to the size of the decision, so that a one-line config tweak does not owe
the same paperwork as a payment-flow redesign.

#### AC-058 — The ceremony level is computed from declared signals, and decides what G2/G3 owe

- **Given** a PRD's `> signals:` line naming zero or more of
  `multiple-teams`, `hard-to-reverse`, `money-or-pii`, `new-tech`,
  `large-estimate`
- **When** the level is computed
- **Then** `money-or-pii` alone reaches `full` regardless of anything else;
  `multiple-teams` without it reaches `rfc-first`; any one of the three
  softer signals alone reaches `medium`; no signal at all reaches `light` —
  and G2 (RFC) is due only at `rfc-first`/`full`, G3 (DESIGN) at every
  level but `light`. A gate not due for **any** feature project-wide reads
  the new fourth gate state, `n/a`, with a printed reason — never `red`,
  never silently `green`, and never allowed to set `blockedFrom`: a gate
  reading `n/a` never blocks G4/G5/G6 from being evaluated, and — the
  distinction a review caught after this criterion was first written — a
  gate is never `n/a` if it already carries a real finding of its own; an
  RFC that exists and is genuinely incomplete stays `red` regardless of
  whether the current feature set happens to need one right now.

#### AC-059 — Ceremony is per-feature, computed the same way for every caller

- **Given** a feature's `PRD.md`
- **When** its ceremony is described
- **Then** the level, its signals, and whether it requires an RFC or a
  DESIGN document are all derived from the same `computeLevel()`, so `adp
  new`, `adp audit`, `adp status` and `adp report` can never disagree about
  what one feature owes

#### AC-060 — Applicability aggregates project-wide, worst case wins

- **Given** several features at different ceremony levels in the same
  project
- **When** the project's gate applicability is computed
- **Then** G2/G3 are due project-wide the moment **any** feature needs
  them — one `rfc-first` feature among several `light` ones keeps G2
  evaluated, and only the features that actually need it are checked; a
  project where no feature needs a gate is the only case where it reads
  `n/a`

### US-019 — Nothing exists in limbo: every PRD is declared, or deferred without losing the reasoning

As a captain, I want every feature that has a PRD to be named as in-scope,
and everything else to have a place to live before it earns one, so that
"we'll get to it" never becomes a feature nobody agreed to build.

#### AC-061 — A PRD is in the MVP checklist, in the backlog, or `PRD_UNPLACED`

- **Given** a feature whose `PRD.md` exists
- **When** the audit runs
- **Then** it is an error unless the feature's slug is named in `SCOPE.md`'s
  MVP checklist (`- [ ] <slug>` — checkbox state tracks delivery, not
  membership); separately, `.spec/BACKLOG.md` is optional (its absence
  means nothing has been deferred yet, not an error) and holds only plain
  prose — an item already carrying a real tracking code
  (`US-xxx`/`AC-xxx`/`T-xxx`/`ASM-xxx`/`Q-xxx`/`D-xxx`) is
  `BACKLOG_ITEM_WITH_CODE`, a warning, because a backlog entry that already
  looks proven is a loophole, not a shortcut

### US-020 — The captain gets a portable answer to "is this worth building"

As a captain weighing whether to proceed, I want a snapshot of where the
project stands that I can hand to someone else — or to a different tool
entirely — so that writing the documents first is never wasted work, even
when the answer turns out to be no.

#### AC-062 — The viability decision is recorded, and never enforced

- **Given** `SCOPE.md`'s `**Decision:**` line, one of `pending`/`go`/`no-go`
  (read case-insensitively, and defaulting to `pending` when the line is
  absent or unrecognized)
- **When** it is read
- **Then** nothing in the gate chain changes because of its value — the
  same declare-don't-police posture ceremony signals already take

#### AC-063 — The report carries the decision, the ceremony, and the MVP placement of every feature

- **Given** a project with features at different ceremony levels, some in
  the MVP checklist and some not
- **When** the report's state is built
- **Then** it names the recorded decision, and for every feature its
  ceremony level, its signals, and whether it is in the MVP checklist —
  a feature outside it is reported as such, not silently omitted

#### AC-064 — The report is a portable, honest snapshot — no invented number

- **Given** a project with no Function Point estimate on file
- **When** `adp report` runs, printed or written with `--html <path>`
- **Then** the HTML form is one self-contained file with no external
  reference of any kind (no script src, no external stylesheet, no
  network address), both forms show every gate, and neither ever invents
  an effort or date figure — the "shape of the work" section says plainly
  why one isn't there instead of estimating anyway

### US-021 — The captain gets a real hours range from a Function Point count they already know

As a captain who already knows roughly how big a feature is, I want an
hours range grounded in a declared profile and an editable table, so that
"how long will this take" has an answer better than a guess, without
pretending the machine counted anything.

#### AC-065 — Hours are declared PF times the matching profile row, never machine-counted

- **Given** a declared or default stack/team profile (`appType` ×
  `familiarity`) and a human-declared, positive, plausible Function Point
  count
- **When** `adp estimate --pf <n>` runs
- **Then** the hours are that count times the exact matching row in
  `.spec/metrics/hours-per-fp.json`, or the `business-crud/delivered`
  fallback row with that substitution named out loud when no exact row
  exists; an implausibly large count (large enough that the product could
  overflow `Number` precision) is refused before the arithmetic runs, not
  silently turned into `null` by `JSON.stringify(Infinity)`

#### AC-066 — The applicability warning is not optional

- **Given** a profile whose `appType` is `real-time`, `infra` or
  `mathematical`
- **When** the estimate is rendered, in Markdown or CSV
- **Then** the Markdown form states plainly that Function Point analysis
  measures that app type poorly and the range is weaker evidence than
  usual; `business-crud` never carries that caveat

### US-022 — The audit catches document quality, not just structure

As a captain, I want the audit to notice when a document is technically
present but substantively hollow — a PRD that names the database instead
of the problem, a decision made with no evidence, a criterion nobody could
test — so that passing every gate is closer to meaning the decision was
actually good.

#### AC-067 — A PRD naming a technical solution is flagged

- **Given** a PRD whose prose names a term from the project's forbidden
  vocabulary (`.spec/PRD_VOCABULARY.json`, seeded editable, checked
  case-insensitively)
- **When** the audit runs
- **Then** it is an error naming the exact term and line — a PRD describes
  the problem, never the technology; clean, technology-free prose is left
  alone

#### AC-068 — An RFC's context must be grounded in a number

- **Given** an RFC's prose before its first decision heading
- **When** the audit runs
- **Then** it is an error unless that prose contains at least one
  measurable figure (a count, a duration, a currency, a percentage) —
  "our process has some problems" fails, "support tickets take 20 minutes"
  passes

#### AC-069 — A document over its configured length ceiling is flagged, as a warning

- **Given** `PRD.md` or `DESIGN.md` longer than `docLengthLimits` in
  config (`SPEC.md` is deliberately exempt — its length scales with real
  content, not padding)
- **When** the audit runs
- **Then** it is a warning naming the line count and the ceiling; a
  document under the ceiling is left alone

#### AC-070 — A DESIGN document older than the code it maps is flagged, past a tolerance window

- **Given** `DESIGN.md`'s modification time and the modification times of
  the files its feature's tasks map
- **When** the audit runs
- **Then** it is a warning (an error under `--ci`) if the newest mapped
  file is more than five minutes newer than the document — the tolerance
  exists because copying or checking out a whole tree does not write every
  file in the same instant, and real drift happens over hours or days, not
  milliseconds of copy jitter; a gap inside the window is not flagged

#### AC-071 — A criterion that reads like a feeling, not a measurement, is flagged

- **Given** an acceptance criterion whose Given/When/Then text carries a
  vague adjective (`fast`, `simple`, `robust`, and similar, in either
  language) with no number anywhere in it
- **When** the audit runs
- **Then** it is an error; a criterion carrying a number is never flagged,
  even next to the same adjective, and a criterion with neither is left
  alone

### US-023 — The captain closes the estimation loop with what actually happened

As a captain who has just finished a feature, I want to record the real
hours it took, so that the next estimate for the same kind of work is
grounded in this team's own outcomes instead of a market figure nobody
here has confirmed.

#### AC-072 — Declared hours are recorded against the last estimate, deviation included

- **Given** the last `.spec/metrics/estimate.json` on file (or none at
  all) and a declared, positive hours figure
- **When** `adp close --hours <n>` runs
- **Then** the closure records the observed hours-per-Function-Point and
  the deviation percentage against the estimate's `likely` figure when an
  estimate exists, and records the hours alone, with no deviation to
  report, when it does not

#### AC-073 — The matching table row recalibrates toward what was observed, and never contradicts itself

- **Given** zero or more prior closures against one profile row
- **When** a new one is recorded
- **Then** zero observations leaves the row untouched; one nudges `likely`
  30% toward the observation; two blend `likely` 50/50 with their mean;
  three to five set `likely` to the observed mean and widen `low`/`high`
  to include the observed range; six or more replace `low`/`likely`/`high`
  with the observed set's own min/mean/max — and at every count, the
  final `low <= likely <= high` always holds, even when a single
  observation would otherwise have pushed `likely` outside the row's
  existing bounds; `calibrationLabel()` names the regime ("no calibration"
  through "calibrated") for every observation count

#### AC-074 — Closures persist locally, tolerant of a torn write, and never overwrite table metadata

- **Given** `.spec/metrics/closures.jsonl` (possibly absent, possibly
  carrying a torn trailing line from an interrupted write) and
  `.spec/metrics/hours-per-fp.json`
- **When** closures are read back, or the table is saved after
  recalibration
- **Then** an absent closures file reads as empty, a torn trailing line is
  skipped rather than failing the read (the same tolerance the event
  ledger already has for its own append-only log), and saving the table
  changes only the `rows` field — any other top-level field the file
  carries (`_comment`, seeded from the shipped default) survives untouched

### US-024 — The captain gets a Function Point count the AI proposed, structurally honest before anyone confirms it

As a captain, I want the count the AI proposes to be checked for shape and
evidence before I ever see a total, so that a typo'd type code or a
function with nothing backing it cannot quietly inflate the number I am
about to confirm.

#### AC-075 — Every entry is checked against the five function types and three complexity bands

- **Given** a draft entry with a `type` and a `complexity`
- **When** it is validated
- **Then** `type` must be one of `ALI`/`AIE`/`EE`/`CE`/`SE` and
  `complexity` one of `low`/`medium`/`high`, each named as a specific,
  separate problem when wrong; a `name` is required too, and a valid entry
  reports no problems at all

#### AC-076 — A source citation must be real text, not just a present key

- **Given** an entry's `source` field, absent, empty, or whitespace-only
- **When** it is checked for a citation
- **Then** all three read as having no source; only non-empty, non-whitespace
  text counts as cited

#### AC-077 — Only valid, sourced entries reach the PF total — a sourceless one is excluded and reported, never silently dropped or silently counted

- **Given** a set of draft entries — some valid and sourced, one missing a
  source, one with an unrecognized type
- **When** the set is summarized against the Function Point weight table
- **Then** the total counts only the valid, sourced entries' weights; the
  sourceless entry is named in a separate list, excluded from the total;
  the structurally invalid entry is named in its own list, also excluded;
  an empty entry set totals zero, not an error

#### AC-078 — The review summary names every excluded entry, not just the total

- **Given** a summarized set with both a sourceless entry and a structurally
  invalid one
- **When** it is rendered for a human to read before confirming
- **Then** the total is shown, every counted entry is listed with its
  weight and source, and both the sourceless and the invalid entries are
  named individually — a human reviewing the summary can see exactly what
  was excluded and why, not just a total that quietly changed

### US-025 — The captain's confirmed count becomes the number adp estimate trusts

As a captain who has confirmed a function count, I want that confirmation
to be the thing `adp estimate` actually uses, attributed to me, so that
the PF number behind an estimate is either a plain declaration or a real,
accountable count — never an unconfirmed draft treated as if it were one.

#### AC-079 — The draft and the weight table load tolerantly, never crashing on an absent or malformed file

- **Given** a project where `adp init` seeded `.spec/metrics/fp-weights.json`
  but no one has written `count-draft.json` yet, and later a draft file
  that is valid JSON but not an array
- **When** the draft and the weight table are loaded
- **Then** a missing or non-array draft reads as an empty list rather than
  failing, and a missing weight table reads as `null`, distinctly, so the
  caller can tell "nothing counted yet" from "never initialized"

#### AC-080 — Confirming writes only the valid, sourced entries and their total, attributed and timestamped

- **Given** a validated set of draft entries, some excluded for lacking a
  source
- **When** the count is confirmed
- **Then** `count-confirmed.json` contains only the valid, sourced entries,
  their summed PF total, who confirmed it, and when — reloading the file
  returns exactly what was written, and before any confirmation exists the
  loader reports `null`, not an empty record

#### AC-081 — A confirmed count is named as such everywhere the estimate is shown, distinctly from a bare declaration

- **Given** an estimate computed from a confirmed count versus one computed
  from a bare `--pf`
- **When** the estimate is rendered as Markdown or as CSV
- **Then** the Markdown form names the confirmed count's function total, who
  confirmed it and when, and marks the PF figure `(counted, confirmed)`; a
  bare declaration is marked `(declared)` instead; the CSV form appends one
  row per counted function, only when a confirmed count backs the figure

### US-026 — The captain's calibration data leaves the project it was born in, without carrying anything identifying

As a captain whose team ships several projects, I want a closed feature's
calibration data to be usable by the next project, without that data ever
naming which project, feature or person it came from, so that sharing a
calibration history file never becomes a way client data leaks between
projects.

#### AC-082 — Every project has a stable, non-reversible identity for dedup

- **Given** one project's root directory, asked for its identity twice, and
  a second, different project's root directory
- **When** the project hash is computed
- **Then** the same project always produces the same hash, a different
  project always produces a different one, and the hash never contains or
  reveals the literal path it was computed from

#### AC-083 — A shared history record never carries a project, feature or person name

- **Given** a closure's profile, PF, hours, observed hours-per-Function-Point,
  deviation and project hash
- **When** the shared history record is built from them
- **Then** its fields are exactly the schema version, timestamp, profile,
  PF, hours, observed h/PF, deviation, tool version, project hash, and an
  `imported` flag defaulting to `false` — no field for a project name, a
  feature name, or a person's name exists to be filled in

#### AC-084 — The shared history is append-only and tolerant of a torn write, the same as every other event log in this engine

- **Given** a shared history file, absent, then containing one record, then
  carrying a torn trailing line from an interrupted write
- **When** it is read back after each state
- **Then** absent reads as empty, one appended record round-trips exactly,
  and a torn trailing line is skipped rather than failing the whole read

#### AC-085 — The shared history location is configurable, for a team that wants one path instead of one per machine

- **Given** `config.metrics.historyPath` pointing at a chosen file
- **When** the shared history is written to or read from
- **Then** that path is used instead of the default state-directory
  location, and a record appended through it is the one read back from it

### US-027 — The captain's estimate is calibrated by every project that came before it, on this machine or shared with the team

As a captain starting a new project, I want its very first estimate to
already reflect what past projects measured for the same profile, so that
a team's fourth project does not start from the same cold-start guess its
first one did.

#### AC-086 — Observations for a profile split into what is this project's own and what is not, regardless of source file

- **Given** a set of shared history records across several project hashes
  and profiles, some marked `imported`
- **When** observations are gathered for one specific profile and one
  specific project's hash
- **Then** only records matching that profile are considered; among those,
  the ones matching the asked-for project hash count as the project's own,
  everything else counts as other, and the subset of "other" marked
  `imported` is counted separately; a profile with no matching records
  returns an empty, all-zero result rather than an error

#### AC-087 — The composition line always sums to the total, and never reports a misleading imported count

- **Given** a profile's observation split, with and without any imported
  observations, and with exactly one observation
- **When** the composition is rendered
- **Then** "from this project" plus "other" always equals the total shown;
  the imported count is appended only when it is greater than zero, never
  printed as a bare zero; a single observation uses the singular word, not
  the plural; an empty observation set renders nothing

### US-028 — The captain moves calibration history between machines and teams, without inventing a new provenance loophole

As a captain who received another team's exported calibration data, I want
every imported record to be marked as imported no matter what the file
itself claims, so that "measured by us" and "handed to us by someone else"
can never be confused in the table's own history.

#### AC-088 — An imported record is checked for the fields calibration actually needs, and for a schema version this engine understands

- **Given** a record with every required field present and correctly typed,
  one missing a required field, and one declaring a schema version this
  engine does not recognize
- **When** each is validated
- **Then** the well-formed record reports no problems, the incomplete one
  names exactly which field is missing, and the unrecognized schema
  version is rejected by name rather than accepted on faith

#### AC-089 — Importing forces every kept record's `imported` flag to true, regardless of what the source file claims, and reports what was skipped

- **Given** an import file containing a well-formed record whose own
  `imported` field says `false`, one line that is not valid JSON, and one
  record missing a required field
- **When** the file is imported
- **Then** the well-formed record is kept with `imported` forced to `true`
  — the source file's own claim about its provenance is never trusted —
  and both the malformed line and the incomplete record are reported as
  skipped, with why, rather than silently dropped

#### AC-090 — The shared history exports to CSV, one row per record, with every field a spreadsheet or a proposal would need

- **Given** one or more shared history records
- **When** they are exported as CSV
- **Then** the output is one header row naming every field, followed by
  exactly one row per record in the same order — the same shape every
  other CSV this engine produces already takes

### US-029 — The audit catches a hollow decision, not just a structurally complete one

As a captain, I want the audit to notice when an RFC's options exist only
to lose, or when nothing considers not acting at all, or when a document
quietly copies another instead of pointing at it, so that passing the
gates keeps meaning the decision behind them was real.

#### AC-091 — An option propped up with weak or missing cons is flagged, only when a real favorite exists to compare it against

- **Given** a `create-rfc`-dialect decision with a favorite option (the
  recommended marker) that itself declares real cons, and a second option
  declaring no cons at all, or cons far shorter than the favorite's
- **When** the audit runs
- **Then** the weak option is named as a warning; an option with
  comparably real cons is left alone; when no option is marked the
  favorite, or the favorite itself declares no cons, nothing is flagged —
  there is no trustworthy baseline to compare against; the native dialect
  (no Pros/Cons structure at all) is never checked by this rule

#### AC-092 — A decision that never considers not acting is flagged, in both RFC dialects, as a warning that never escalates

- **Given** a decision — native or `create-rfc` dialect — whose
  alternatives never include one named "do nothing" (or its Portuguese
  equivalent, "não fazer nada" / "status quo" / "manter como está")
- **When** the audit runs
- **Then** it is flagged as a warning, in every mode including `--ci`;
  naming an explicit do-nothing alternative, in either language, clears
  it

#### AC-093 — A substantial passage repeated between a feature's own PRD, RFC and DESIGN is flagged; short or merely related prose is not

- **Given** a feature's `PRD.md`, its linked RFC(s), and its `DESIGN.md`,
  with one pair sharing a near-identical passage of at least 25 words
- **When** the audit runs
- **Then** the shared passage is flagged as a warning naming both
  documents; a passage under the word-count floor, or two passages that
  are merely related rather than substantially the same, are left alone —
  the check is scoped to one feature's own document trio, never
  project-wide

## Assumptions

Status values: `open` · `confirmed` · `invalidated`.

- **ASM-001** — The configured agent CLI supports a non-interactive invocation
  that accepts a prompt, performs file edits and exits with a meaningful status
  code. *(status: confirmed — exercised directly against Claude Code 2.1.221 in
  a scratch directory, all three clauses separately. Prompt accepted and answered:
  `claude -p` returned the requested output and exited 0. File edits performed: a
  run asked for a named file with exact contents produced that file, with those
  contents. Status code meaningful: an invalid flag exited 1 where the successful
  runs exited 0, so the executor can tell the two apart.*

  *One finding came out of confirming it, and it matters more than the assumption
  did. The edit only happened because the invocation carried
  `--permission-mode acceptEdits`. What `resolveAgentCommand` actually configures
  is `claude -p '{{PROMPT}}'`, with no permission flag, and under the default mode
  a non-interactive run has no way to answer the approval it needs. The CLI can do
  what D-002 requires; the invocation this project would send it cannot. See
  Q-008.)*
- **ASM-002** — The host project's test runner can emit per-test results in a
  machine-readable form. Their `spec.config.json` runs `pytest` and `vitest`, both
  of which can, but the exact reporter flags are unconfirmed. *(status: confirmed —
  four adapters shipped: `tap`, `vitest-json`, `junit` and the degraded
  `exitcode`. `junit` is what makes `pytest --junitxml` work. Confirmed against
  this project's own suite, which required `--test-reporter=tap` on the command:
  the reporter is a property of the COMMAND, not of the runner, and a config
  naming a reporter the command does not emit produces a read error rather than
  a silent empty pass.)*
- **ASM-003** — The captain is the only operator, so concurrent writes to the same
  document come only from the captain's editor and an agent, never from two
  humans. *(status: confirmed — SCOPE §2 states single-tenant, single-operator)*
- **ASM-004** — Task granularity in `TDD.md` stays small enough that one task is
  one commit and one worker invocation. If tasks routinely need conversation, the
  worker contract in D-002 is wrong. *(status: confirmed at n=4 — measured, not
  assumed, by running the executor against a throwaway project built for the
  purpose. Four tasks of deliberately uneven size: two as small as a task can
  honestly be, one carrying a real edge case, one written underspecified on
  purpose to be the one that broke. **Four tasks, four invocations, no second
  pass**, and the result was not merely accepted — `adp verify` proved 4/4
  criteria and every gate came back clean. The underspecified task landed too,
  which is the part that surprises.*

  *Three conditions bound that number and must travel with it. The sample is
  four, all written by one author who knew what the criteria meant. The tasks
  were pure functions with obvious contracts — the easiest shape there is. And
  no worker could run anything: `acceptEdits` grants file writes, not execution,
  so all four wrote their tests blind and were right anyway. Confirmation
  therefore covers "small, well-specified tasks succeed in one pass" and says
  nothing yet about tasks needing exploration. What would invalidate it is a
  run where workers routinely come back needing a second attempt; the count is
  the measurement, and it is cheap to repeat.*

  *One thing the run demonstrated incidentally: ASM-005's mitigation works, and
  is needed more than expected. All four workers touched a file they had not
  declared — `.claude/session-log.md` in every case, plus a `pnpm-lock.yaml`
  nobody asked for — and all four were reported. Declared file lists are
  routinely incomplete, and the check that notices is not optional.)*
- **ASM-005** — Declaring a task's file list up front is accurate enough often
  enough to be useful. A worker that touches an undeclared file breaks the
  disjointness guarantee that makes lanes safe. *(status: confirmed — the mitigation is built: `runLane` compares what the commit actually touched against what the task declared and records an `undeclared-files` event. The declaration is trusted for planning and checked afterwards, which is the only honest combination.)*
- **ASM-006** — Reading and parsing the documents on every board request is fast
  enough at the stated volumes, so no caching layer is needed for MVP. *(status:
  confirmed — measured against this project's own `.spec/`, the largest real
  corpus available: 13 stories, 38 criteria, 27 tasks, 9 principles. A full
  `adp audit`, parsing every document from cold, runs in 323–473 ms wall clock
  including Node's own startup. The modification-time cache in the fallback
  would be optimising something that is already an order of magnitude below the
  threshold where a human notices a delay.)*
- **ASM-007** — The eight existing role agents in `.claude/agents/` remain the
  right division of labour and the pipeline maps onto them rather than replacing
  them. *(status: invalidated — the premise no longer holds. Those agents belonged
  to `Projeto_Agent`, and this tool has since been extracted into its own
  repository, which is what SCOPE Q-002 was asking. `.claude/agents/` does not
  exist here and nothing in the package depends on it. What replaced the
  assumption is narrower and already built: the agent is whatever
  `resolveAgentCommand` names — claude, codex, cursor or an explicit
  `agent.command` — and the division of labour is the task graph in `TDD.md`,
  not a fixed roster of roles.)*

## Open questions

Status values: `open` · `answered`. A question marked **blocking** must be
answered before G2 can pass.

- **Q-001** — Which scope does the repository root own: Agent Dev Pipeline or Portal
  Proauto? *(status: answered — the repository root owns **Agent Dev
  Pipeline**, and nothing else. The tool was extracted from `Projeto_Agent` into a
  repository of its own; Portal Proauto stays where it is and becomes one of the
  tool's consumers rather than its host. This is the arrangement the third option
  described, and it is the only one that survives the tool being published: a
  package cannot ship a host product's scope document inside it.)*
- **Q-002** — Does Agent Dev Pipeline get its own repository, or stay a folder inside
  `Projeto_Agent`? *(status: answered — its own: `Codryx-Tec/agent-dev-pipeline`,
  published to npm as `@codryx/agent-dev-pipeline`. Staying a subfolder was
  incompatible with being installed into other projects, which is the entire
  point of the tool.)*
- **Q-003** — Is `agent-dev-pipeline` the final name? It appears in the port number
  documentation, the skill name, the config filename and the container image tag,
  so renaming later is cheap now and expensive after M4. *(status: answered —
  the product is `agent-dev-pipeline`, published as `@codryx/agent-dev-pipeline`;
  the command, the config file and the engine's own skill are `adp`. The package
  name stays descriptive so the registry is searchable, while the binary stays
  short because it is typed dozens of times a day — the same split as
  `@angular/cli`→`ng`. Renamed before any of it was hard to
  change, as this question asked for.)*
- **Q-004** — Retired with Docker (D-013). It asked whether the agent CLI would
  run inside the container with mounted credentials or on the host. There is no
  container, so credentials never leave the machine they were installed on.
  *(status: answered — the question dissolved with the container)*
- **Q-005** — What is the retention policy for run events and worker output
  streams? *(status: answered — the last **ten** runs' streams, pruned
  automatically after every run. The reason is token economy, not disk: worker
  transcripts are the bulk of what this tool produces and the least re-read part
  of it, and ten covers "what went wrong in the last few attempts", which is the
  only question a stream ever actually answers. Events are never pruned — they
  are small and are what a post-mortem reads.)*
- **Q-006** — Retired with the monitor (D-011). It asked whose write wins when the
  captain edits a document on the page while an agent writes the same file. The
  tool no longer writes documents at all — only `init` and `new` create files, and
  neither overwrites — so the conflict it guarded against cannot arise.
  *(status: answered — dissolved with the page in D-011, and kept dissolved by D-013: the page came back with no write path)*
- **Q-007** — Does the tool need to keep working when the host project's test
  suite takes minutes rather than seconds? *(status: answered — yes, and the
  answer is `adp verify --background`: the run is detached, its progress is
  written to the event ledger, and `adp verify --status` reports it. Synchronous
  stays the DEFAULT, because a fast suite finishing in front of you is better
  feedback than a job id; background is opt-in for the case where it is not.
  Nothing about the verdict changes — a background run writes the same proof
  record, so the audit cannot tell the difference and neither can a gate.)*
- **Q-008** — Under which permission mode does the executor invoke the agent?
  *(status: answered — behind an explicit `adp run --allow-edits`, and off by
  default. The other two options were rejected for the same reason: carrying the
  flag in the default args grants an agent silent write access to a repository,
  which is precisely what `adp trust` exists to prevent for a mere test command;
  and pushing it into `agent.args` hides a security decision inside a config
  field where it is written once and never read again.*

  *A flag is the only one of the three where the grant is stated at the moment it
  is used, by the person it affects, and appears in the shell history afterwards.
  The consent screen prints `edits : ALLOWED — the agent may write without asking`
  when it is on, and when it is off it says plainly that every task will finish
  having changed nothing — because the failure this replaces looked like a broken
  agent rather than a missing permission. Harnesses whose write flags nobody has
  verified refuse the flag instead of guessing at it: a wrong guess is silent and
  surfaces hours later as work that was never done.)*

  *Original finding, kept because it is the evidence: surfaced while confirming
  ASM-001. The
  invocation in `resolveAgentCommand` is `claude -p '{{PROMPT}}'`. In the default
  permission mode that run cannot edit a file: it needs an approval, and a
  non-interactive process has nobody to ask. The same prompt with
  `--permission-mode acceptEdits` wrote the file and exited 0. So the executor as
  configured cannot perform the work D-002 assigns it, and no test caught this
  because the executor has never run.*

  *What made this a decision rather than a patch: handing an agent blanket edit
  rights inside a worktree is defensible, because the worktree is disposable and
  the diff is reviewed before it merges. Handing it those rights by default, and
  silently, is the same mistake `adp trust` was built to prevent.)*
- **Q-009** — Should a worker be able to run the tests it writes? *(status:
  answered — no, and it does not need to. The question assumed the only way to
  get a test result inside a lane was to let the worker produce it. The
  orchestrator can run the tests itself, in the worktree, using consent it
  already holds, and attribute the result to the task that just committed. See
  D-015.*

  *So the answer splits the question in two. The part that mattered — a failing
  test surfacing in the lane that caused it rather than at `adp verify` after
  the merge, owned by nobody — is delivered. The part that was a genuine grant
  is declined: the worker still cannot execute anything, because letting an agent
  run commands in a worktree is not the same size of decision as letting it edit
  files there, and no evidence yet says the feedback loop is worth it. Reopen it
  if workers start failing in ways only they could have caught.)*

  *Original finding, kept because it is the evidence: surfaced by the first real
  run. `--allow-edits` grants writes and not execution, so all four workers wrote
  tests they could never execute and said so: "tests were not run locally because
  execution required approval". They happened to be correct. The next four might
  not be, and nothing in the lane would notice.)*
- **Q-010** — How does a task declare that it runs after another one? *(status:
  answered — with `Depends on: T-001`, and the companion it turned out to need,
  `Reads:` for files a task reads without writing. See D-014.*

  *The question as asked has a one-line answer, and answering only that would
  have left the hack in place: the fourth task's real problem was that declaring
  a file it merely read cost everyone who wrote that file their parallelism.
  Ordering had to become declarable AND reading had to stop implying collision,
  or the second would keep being used to buy the first.)*

  *Original finding, kept because it is the evidence: surfaced by the same run.
  The experiment's fourth task declared the three files it merely reads, to force
  itself to run last, and the planner collapsed all four tasks into a single lane
  — the connected component swallowed the graph.)*

## Tasks

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

## T-004 — Task parser [done]

- Refs: AC-011, AC-012
- Files: src/parsers/spec.js
- Notes: Tasks with references, file lists and status, including the new `[in-test]`. File lists are comma-separated and paths may contain spaces. An unrecognized status token is an error, never silently coerced. Originally written against `tdd.js`; task parsing moved into `spec.js` when 0.6.0 (M2-core) split `TDD.md` into `DESIGN.md`/`SPEC.md` — this entry now points at where the behavior actually lives.

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
- Files: src/core/init.js, payload/templates/SCOPE.md, payload/templates/PRD.md, payload/templates/RFC.md, payload/templates/DESIGN.md, payload/templates/CONSTITUTION.md, payload/AGENTS.md
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
- Files: src/parsers/spec.js, src/core/plan.js
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

### Milestone M9 — 0.6.0: ceremony, MVP boundary, viability and estimation

## T-045 — Ceremony matrix [done]

- Refs: AC-058, AC-059, AC-060
- Files: src/core/ceremony.js
- Notes: `computeLevel()` reads a PRD's declared signals and returns the level plus which of G2/G3 it owes; `projectCeremony()` aggregates every feature's level project-wide, worst case wins, so one `rfc-first` feature keeps G2 evaluated even when every other feature is `light`. `gates.js` reads the aggregate to decide when a gate reads the new `n/a` state — but only when the gate carries no finding of its own; a gate sitting on a real error is never `n/a`, a distinction added after a review caught `n/a` silently suppressing a genuine `DECISION_WITHOUT_ALTERNATIVE` finding (regression test in `test/gates.test.js`, `@spec:AC-058`).

## T-046 — MVP boundary and BACKLOG.md [done]

- Refs: AC-061
- Files: src/parsers/backlog.js
- Notes: A PRD with no matching MVP-checklist entry in `SCOPE.md` is `PRD_UNPLACED`, an error — every feature that has a PRD is either declared in-scope or explicitly deferred, never left implicit. `parseBacklog()` reads `.spec/BACKLOG.md` as plain prose; a line already carrying a real tracking code is `BACKLOG_ITEM_WITH_CODE`, a warning, because a backlog entry that already looks proven is the loophole this check exists to close.

## T-047 — Viability report and the recorded decision [done]

- Refs: AC-062, AC-063, AC-064
- Files: src/core/report-html.js
- Notes: `SCOPE.md`'s `**Decision:**` field (`pending`/`go`/`no-go`, defaulting to `pending`) is read and rendered but never enforced — the same declare-don't-police posture ceremony signals and the backlog already take. The report's state carries every feature's ceremony level and MVP placement alongside it, so the snapshot answers "is this worth building" without requiring the reader to open `SCOPE.md` or `PRD.md` themselves. The HTML form is one self-contained file — no external script, stylesheet, or network address — so handing it to someone else, or to a different tool, costs nothing beyond the file itself.

## T-048 — Function Point estimation, human-declared [done]

- Refs: AC-065, AC-066
- Files: src/core/estimate.js
- Notes: `computeEstimate()` multiplies a human-declared PF count by the matching `appType`/`familiarity` row in `.spec/metrics/hours-per-fp.json` (or the `business-crud/delivered` fallback, named out loud), never counts anything itself. `real-time`/`infra`/`mathematical` app types carry an explicit applicability warning in the rendered Markdown, because Function Point analysis measures those poorly and the range is weaker evidence there than elsewhere. An implausibly large PF is refused before the multiplication can overflow into `Infinity` — `JSON.stringify(Infinity)` silently writes `null`, which would have made a corrupted estimate file look merely empty.

## T-049 — Antipatterns as findings [done]

- Refs: AC-067, AC-068, AC-069, AC-070, AC-071
- Files: src/core/audit.js, src/parsers/rfc.js, src/parsers/design.js
- Notes: Five of PRD-003b's eight antipattern codes: `PRD_WITH_SOLUTION` (a PRD naming a term from the editable `.spec/PRD_VOCABULARY.json` forbidden-vocabulary list), `CONTEXT_WITHOUT_NUMBERS` (an RFC's context prose with no measurable figure anywhere in it), `DOC_TOO_LONG` (a warning, `SPEC.md` deliberately exempt since its length tracks real content), `DOC_FOSSIL` (a DESIGN document older than the newest file its tasks map, past a five-minute tolerance window — the tolerance exists because copying a whole tree does not write every file in the same instant), and `AC_NOT_OBSERVABLE` (a criterion carrying a vague adjective with no number anywhere in its Given/When/Then text, extracted via a dedicated `gwtText()` helper rather than the AC's full body, since the last AC in a document has a body that runs to end-of-file and would otherwise pick up unrelated digits from later sections). `STRAW_OPTION`, `OPTION_DO_NOTHING_MISSING` and `DUPLICATE_PROSE` remain in `.spec/BACKLOG.md`, not built this pass.

## T-050 — Closing the estimation loop [done]

- Refs: AC-072, AC-073, AC-074
- Files: src/core/closure.js
- Notes: `adp close --hours <n>` is the local half of PRD-003c — one project's own outcomes feeding its own `hours-per-fp.json` row, with no cross-project history or gate integration (both left in `.spec/BACKLOG.md`, since `adp estimate` is project-wide in this codebase and a per-PRD `HOURS_UNDECLARED` finding has no clean home yet). `recalibrateRow()` blends the observed hours-per-Function-Point into the matching row by observation count — nudge at 1, 50/50 blend at 2, mean-plus-widen at 3–5, fully observed min/mean/max at 6+ — and at every count clamps so `low <= likely <= high` always holds, a guarantee added after a review reproduced a single extreme outlier pushing `likely` outside the row's own bounds. `loadClosures()` tolerates a torn trailing line the same way `ledger.js` already does for its own append-only log.

## T-051 — The 0.6.0 migration [done]

- Refs: AC-056
- Files: src/migrations/0.6.0.js
- Notes: Ships the RFC un-nesting and TDD.md→DESIGN.md/SPEC.md split this repo's own self-audit migrated by hand earlier in the 0.6.0 work, as an idempotent migration for every other project on an older layout — the same `AC-056` criterion T-042's 0.5.0 migration already proves ("a grammar rename ships as a migration"), general enough to cover this one too without a new criterion.

## T-052 — Automated Function Point counting [done]

- Refs: AC-075, AC-076, AC-077, AC-078, AC-079, AC-080, AC-081
- Files: src/core/count.js
- Notes: Closes PRD-003-full-core — the AI proposes a function count, citing a source per entry, into `.spec/metrics/count-draft.json`; `adp estimate --review` shows the total without recording anything; only a human's `adp estimate --confirm` locks it in, attributed to their `git config` identity. An entry with no source is excluded from the total and reported, never silently dropped or counted — `FUNCTION_WITHOUT_SOURCE`'s behavior, printed rather than gated, matching the declarative posture the whole estimate/report/close family already takes. Complexity is asserted directly by whoever counts, not derived from CPM 4.3.1's DET/RET/FTR formula — deferred, the same trust-the-declaration posture ceremony signals and MVP placement already extend elsewhere.

## T-053 — Cross-project calibration history [done]

- Refs: AC-082, AC-083, AC-084, AC-085, AC-086, AC-087, AC-088, AC-089, AC-090
- Files: src/core/history.js
- Notes: Closes PRD-003c-history-core. `adp close` now recalibrates from `hours-history.jsonl` in the state directory (or `config.metrics.historyPath`) instead of from one project's own closures alone — "o histórico é a verdade; a tabela é cache." Deliberately deviates from SCOPE-0.6.0.md's own text, not just narrows it: the source design stores project/feature/person identity and strips it at export by default; this never writes that identity in the first place, since a field never written cannot leak the way a field written-then-stripped can. `adp metrics import` forces `imported: true` on every incoming record regardless of what the source file claims — provenance is not the importer's to assert. Deferred: per-observation human/agent hour breakdown, ledger corroboration fields, and `adp estimate --history`'s retrospective accuracy report.

## T-054 — The last 3 of 8 M3b antipattern codes [done]

- Refs: AC-091, AC-092, AC-093
- Files: src/parsers/rfc.js
- Notes: Closes M3b-remainder — `STRAW_OPTION`, `OPTION_DO_NOTHING_MISSING`, `DUPLICATE_PROSE`. `STRAW_OPTION` only checks the `create-rfc` dialect, since the native one has no Pros/Cons structure to weigh; `OPTION_DO_NOTHING_MISSING` checks both dialects by name match. Deliberate severity deviation from SCOPE-0.6.0.md's own "erro (G2)" for `OPTION_DO_NOTHING_MISSING`: building it that way first broke the shipped `.exemplo/` example's own RFC retroactively under `--ci` — shipped as a plain warning in every mode instead, recorded as accepted debt against this repo's own `RFC-001` in `.spec/BACKLOG.md` rather than retrofitted. `DUPLICATE_PROSE` is a word-set Jaccard similarity check across one feature's own PRD/RFC/DESIGN trio, ≥25-word paragraphs, ≥0.75 similarity.

---
