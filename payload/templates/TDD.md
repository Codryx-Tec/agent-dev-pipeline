# TDD: {{FEATURE}}

> feature: {{FEATURE}}
> document: TDD — HOW to build it, in detail
> owns: T-xxx (tasks, each with `Refs:` and `Files:`)
> status: draft

<!--
GRAMMAR:

  ## T-001 — Task title [pending]
  - Refs: US-001, AC-001
  - Files: src/one.js, src/two.js
  - Reads: src/three.js
  - Depends on: T-000

Statuses: pending · in-progress · in-test · done. They are engine
tokens. They are English and they are never localised — one project, one
spelling.

`Files:` is not paperwork. It is what the task WRITES, and it is what lets the
planner compute which tasks can run at the same time: tasks whose written files
do not intersect become parallel lanes, each in its own git worktree. A task with
no file list is never parallelized — it runs alone, at the end.

`Reads:` is what the task reads without writing. It costs nothing in parallelism,
because every lane has its own worktree and two readers never collide. Put a file
here rather than in `Files:` when you only need to look at it — declaring it as
written forfeits the concurrency of everyone who actually writes it.

`Depends on:` is ordering, and it is the only way to say "after". File overlap cannot
express it: overlap is symmetric and "after" is not. You need it whenever your
task must see another task's OUTPUT, because a lane is branched from HEAD — so a
file you merely read is the version from before the run until you declare that you
follow whoever writes it. The plan warns you when that gap exists.

A cycle, a dependency on a task id that does not exist, or a dependency on a task
that is not going to run all keep a task out of the plan, with the reason stated.
Nothing invents an order on your behalf.

Gate G3 passes when every criterion in PRD.md is referenced by some task, every
reference resolves, and every task carries a valid status.
-->

## 1. Shape of the solution

How the pieces fit. A diagram beats three paragraphs.

## 2. Components

What each new or changed module is responsible for, and what it must not know
about.

## 3. Data and contracts

Schemas, endpoints, message shapes. Whatever crosses a boundary.

## Tasks

## T-001 — {{first task}} [pending]

- Refs: AC-001
- Files: {{src/path/one.js}}
- Notes: {{anything the implementer needs that is not obvious from the title}}

## Expected parallelism

Which tasks the planner should be able to run at the same time, and which
serializations are real dependencies rather than accidents. Writing this down is
how you notice that everything landed in one lane because every task touches the
same file.
