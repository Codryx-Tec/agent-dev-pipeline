# RFC: {{FEATURE}}

> feature: {{FEATURE}}
> document: RFC — WHICH path, among the possible ones
> owns: ASM-xxx (assumptions) · Q-xxx (open questions)
> status: rascunho

<!--
GRAMMAR:

  ### D-001 — Decision title
    **Alternatives considered**
    1. *Name.* what it is, what it buys, what it costs
    2. *Name.* ...
    **Decision: alternative N — name.**
    rationale, then consequences

  - **ASM-001** — text *(status: aberta|confirmada|invalidada)*
  - **Q-001** — text *(status: aberta|respondida)*  add **blocking** if it gates the path

Gate G2 passes when every decision records at least two alternatives AND a
chosen one, both sections below exist, every item carries a status, and no
question marked blocking is still open.
-->

## Purpose

`PRD.md` fixed what to build. This document fixes how we get there — decision by
decision, with the roads not taken written beside the one we took. A decision
recorded without its alternatives is indistinguishable from a habit, and habits
are what nobody can revisit later.

## Decisions

### D-001 — {{what had to be decided}}

**Alternatives considered**

1. *{{Name}}.* {{what it is, what it buys, what it costs}}
2. *{{Name}}.* {{...}}

**Decision: alternative {{N}} — {{name}}.**

**Rationale.** {{why this one, in terms of the constraints that actually applied}}

**Consequences.** {{what this now costs us, what it closes off, what it makes
harder later. A decision with no consequences was not a decision.}}

## Assumptions

Status: `aberta` · `confirmada` · `invalidada`. An assumption still `aberta`
when the feature declares itself done turns gate G5 red — on purpose.

- **ASM-001** — {{what you filled in without confirming}} *(status: aberta)*

## Open questions

Status: `aberta` · `respondida`. A question marked **blocking** must be answered
before G2 can pass.

- **Q-001** — {{what you could not decide alone}} *(status: aberta)*
