# RFC-{{NUMBER}}: {{SLUG}}

> rfc: RFC-{{NUMBER}}
> document: RFC — WHICH path, among the possible ones
> owns: D-xxx (decisions)
> status: draft

Flat and global (Q-001): this file is not owned by one feature. Any PRD that
needs this decision links it by adding `RFC-{{NUMBER}}` to its own `rfcs:`
line — one RFC can serve several PRDs, and one PRD often needs several, one
per one-way door.

<!--
GRAMMAR:

  ### D-001 — Decision title
    **Alternatives considered**
    1. *Name.* what it is, what it buys, what it costs
    2. *Name.* ...
    **Decision: alternative N — name.**
    rationale, then consequences

Gate G2 passes when every PRD that links here names an id that resolves, and
every decision in every linked RFC records at least two alternatives and a
chosen one.
-->

## Purpose

`PRD.md` fixed what to build. This document fixes how we get there — decision
by decision, with the roads not taken written beside the one we took. A
decision recorded without its alternatives is indistinguishable from a habit,
and habits are what nobody can revisit later.

Only write an RFC when the decision is a one-way door — expensive or
impossible to reverse. A two-way door (cheap to undo) does not need one.

## Decisions

### D-001 — {{what had to be decided}}

**Alternatives considered**

1. *{{Name}}.* {{what it is, what it buys, what it costs}}
2. *{{Name}}.* {{...}}

**Decision: alternative {{N}} — {{name}}.**

**Rationale.** {{why this one, in terms of the constraints that actually applied}}

**Consequences.** {{what this now costs us, what it closes off, what it makes
harder later. A decision with no consequences was not a decision.}}

## Assumptions and open questions

Owned by `SPEC.md`, not here — see its `ASM-xxx`/`Q-xxx` sections.
