# DESIGN: {{FEATURE}}

> feature: {{FEATURE}}
> document: DESIGN — HOW to build it, in detail (the technical design a
> human reads — formerly called TDD in earlier versions of this tool)
> status: draft

The longevity test decides what belongs here versus in `SPEC.md`: if we
swapped frameworks tomorrow, would this sentence still be true? Yes → it is a
decision, it belongs here. No → it is implementation detail, it belongs in a
task's notes.

`T-xxx` tasks live in `SPEC.md` now, not here — a task is something the
machine confers, not something a human designs. This document has no
grammar of its own beyond the header above; gate G3 passes once it exists.

## 1. Shape of the solution

How the pieces fit. A diagram beats three paragraphs.

## 2. Components

What each new or changed module is responsible for, and what it must not know
about.

## 3. Data and contracts

Schemas, endpoints, message shapes. Whatever crosses a boundary.

## Expected parallelism

Which tasks the planner should be able to run at the same time, and which
serializations are real dependencies rather than accidents. Writing this down
is how you notice that everything landed in one lane because every task
touches the same file. The tasks themselves are declared in `SPEC.md`.
