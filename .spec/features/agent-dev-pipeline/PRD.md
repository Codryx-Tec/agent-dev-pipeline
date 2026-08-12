# PRD: Agent Dev Pipeline

> feature: agent-dev-pipeline
> document: PRD — WHAT, for WHOM, WHY
> status: draft
> rfcs: RFC-001
> signals: hard-to-reverse

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
