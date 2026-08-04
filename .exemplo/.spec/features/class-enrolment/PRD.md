# PRD: class-enrolment

> feature: class-enrolment
> document: PRD — WHAT, for WHOM, WHY
> owns: US-xxx (user stories) · AC-xxx (acceptance criteria)
> status: implemented

## Context

A visitor enrols in an open class. Two rules make this more than a form: a class
has a finite number of seats, and a minor cannot be enrolled without a guardian's
consent — that second one is a legal requirement rather than a preference, which
is why the constitution executes a check for it.

## Stories

### US-001 — A visitor enrols in a class with seats

As a visitor, I want to enrol in a class that still has room, so that my place is
guaranteed.

#### AC-001 — Enrolment in a class with a free seat

- **Given** an open class with at least one free seat
- **When** the visitor submits a valid e-mail and age
- **Then** the enrolment is accepted and the free-seat count drops by one

#### AC-002 — A full class refuses the enrolment

- **Given** a class with zero free seats
- **When** a visitor tries to enrol
- **Then** the enrolment is refused with the reason "class full" and the seat
  count is left unchanged

### US-002 — A minor needs a guardian's consent

As a guardian, I want to authorise a minor's enrolment, so that processing their
data has a legal basis.

#### AC-003 — A minor without guardian data is blocked

- **Given** a visitor who declares an age below 18
- **When** they try to finish enrolling without guardian data
- **Then** the enrolment is blocked with the reason "guardian required" and no
  seat is consumed

## Out of scope for this PRD

Payment, cancellation and waiting lists. Each would change what these criteria
promise, so each gets its own feature.

## Assumptions

Owned by `RFC.md`.

## Open questions

Owned by `RFC.md`.
