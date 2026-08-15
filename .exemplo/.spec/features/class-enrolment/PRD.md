# PRD: class-enrolment

> feature: class-enrolment
> document: PRD — WHAT, for WHOM, WHY
> status: implemented
> rfcs: RFC-001
> signals: multiple-teams

## Context

A visitor enrols in an open class. Two rules make this more than a form: a class
has a finite number of seats, and a minor cannot be enrolled without a guardian's
consent — that second one is a legal requirement rather than a preference, which
is why the constitution executes a check for it.

## What this delivers

A visitor can enrol in a class that still has room, with their place
guaranteed the moment the enrolment is accepted. A minor's enrolment requires
a guardian's consent before it can go through.

## Out of scope for this PRD

Payment, cancellation and waiting lists. Each would change what these criteria
promise, so each gets its own feature.

## Stories and criteria

Owned by `SPEC.md` — see `US-001`, `US-002` and their acceptance criteria there.

## Assumptions and open questions

Owned by `SPEC.md`.
