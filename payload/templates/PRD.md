# PRD: {{FEATURE}}

> feature: {{FEATURE}}
> document: PRD — WHAT, for WHOM, WHY
> owns: US-xxx (user stories) · AC-xxx (acceptance criteria)
> status: draft

<!--
GRAMMAR — the engine reads these shapes and nothing else:

  ### US-001 — Story title
  #### AC-001 — Criterion title
  - **Given** ...      (or **Dado**)
  - **When** ...       (or **Quando**)
  - **Then** ...       (or **Então**)

Codes are unique across the WHOLE project, not just this file. Use three digits.
Gate G1 passes when every story owns at least one criterion and every criterion
has all three clauses.
-->

## Context

Why this feature exists, in a paragraph anyone on the team can read.

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

## Out of scope for this PRD

## Assumptions

Owned by `RFC.md`. Anything you assumed while writing these stories goes there
as an ASM-xxx, with a status.

## Open questions

Owned by `RFC.md`. Anything you could not decide goes there as a Q-xxx. Mark it
**blocking** if the path cannot be chosen without the answer.
