# SPEC: {{FEATURE}}

> feature: {{FEATURE}}
> document: SPEC — the layer the machine confers
> owns: US-xxx (stories) · AC-xxx (criteria) · ASM-xxx (assumptions) ·
> Q-xxx (open questions) · T-xxx (tasks)
> status: draft

<!--
GRAMMAR — the engine reads these shapes and nothing else:

  ### US-001 — Story title
  #### AC-001 — Criterion title
  - **Given** ...      (or **Dado**)
  - **When** ...       (or **Quando**)
  - **Then** ...       (or **Então**)

  - **ASM-001** — text *(status: open|confirmed|invalidated)*
  - **Q-001** — text *(status: open|answered)*  add **blocking** if it gates the path

  ## T-001 — Task title [pending]
  - Refs: US-001, AC-001
  - Files: src/one.js, src/two.js
  - Reads: src/three.js
  - Depends on: T-000

Codes are unique across the WHOLE project, not just this file. Use three digits.

Gate G4 passes when every story owns at least one criterion, every criterion
has all three clauses, both the Assumptions and Open questions sections exist
with every item carrying a status, no question marked blocking is still open,
every criterion in this document is referenced by some task, every reference
resolves, and every task carries a valid status.
-->

## Stories

### US-001 — {{a role}} {{achieves something}}

As a {{role}}, I want {{capability}}, so that {{outcome}}.

#### AC-001 — {{observable result}}

- **Given** {{the starting state}}
- **When** {{the action}}
- **Then** {{the observable result}}

<!--
A criterion must be something a test can check. "Must be fast" is not a
criterion; "responds in under 300ms" is. If you cannot imagine the assertion,
the criterion is not finished.
-->

## Assumptions

Status: `open` · `confirmed` · `invalidated`. An assumption still `open`
when the feature declares itself done turns gate G6 red — on purpose.

- **ASM-001** — {{what you filled in without confirming}} *(status: open)*

## Open questions

Status: `open` · `answered`. A question marked **blocking** must be answered
before G2 can pass.

- **Q-001** — {{what you could not decide alone}} *(status: open)*

## Tasks

Statuses: `pending` · `in-progress` · `in-test` · `done`. They are engine
tokens, English, never localised — one project, one spelling.

`Files:` is what the task WRITES, and it is what lets the planner compute
which tasks can run at the same time: tasks whose written files do not
intersect become parallel lanes, each in its own git worktree. A task with no
file list is never parallelized — it runs alone, at the end.

`Reads:` is what the task reads without writing. It costs nothing in
parallelism, because every lane has its own worktree and two readers never
collide. Put a file here rather than in `Files:` when you only need to look
at it — declaring it as written forfeits the concurrency of everyone who
actually writes it.

`Depends on:` is ordering, the only way to say "after". File overlap cannot
express it: overlap is symmetric and "after" is not. A cycle, a dependency on
a task id that does not exist, or a dependency on a task that is not going to
run all keep a task out of the plan, with the reason stated. Nothing invents
an order on your behalf.

## T-001 — {{first task}} [pending]

- Refs: AC-001
- Files: {{src/path/one.js}}
- Notes: {{anything the implementer needs that is not obvious from the title}}
