# TDD: {{FEATURE}}

> feature: {{FEATURE}}
> document: TDD — HOW to build it, in detail
> owns: T-xxx (tasks, each with `Refs:` and `Arquivos:`)
> status: rascunho

<!--
GRAMMAR:

  ## T-001 — Task title [pendente]
  - Refs: US-001, AC-001
  - Arquivos: src/one.js, src/two.js

Statuses: pendente · em-andamento · em-teste · concluida. They are engine
tokens — never translate them.

`Arquivos:` is not paperwork. It is what lets the planner compute which tasks
can run at the same time: tasks whose file sets do not intersect become parallel
lanes, each in its own git worktree. A task with no file list is never
parallelized — it runs alone, at the end.

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

## T-001 — {{first task}} [pendente]

- Refs: AC-001
- Arquivos: {{src/path/one.js}}
- Notas: {{anything the implementer needs that is not obvious from the title}}

## Expected parallelism

Which tasks the planner should be able to run at the same time, and which
serializations are real dependencies rather than accidents. Writing this down is
how you notice that everything landed in one lane because every task touches the
same file.
