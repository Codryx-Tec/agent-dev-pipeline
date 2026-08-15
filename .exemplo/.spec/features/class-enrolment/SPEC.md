# SPEC: class-enrolment

> feature: class-enrolment
> document: SPEC — the layer the machine confers
> owns: US-xxx (stories) · AC-xxx (criteria) · ASM-xxx (assumptions) ·
> Q-xxx (open questions) · T-xxx (tasks)
> status: implemented

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

## Assumptions

- **ASM-001** — age is self-declared and not checked against a document *(status: confirmed)*
- **ASM-002** — e-mail identifies a person uniquely *(status: confirmed)*

## Open questions

- **Q-001** — is a guardian's e-mail stored separately from the student's? *(status: answered, Door: two-way — a storage-layout choice, migratable later without losing data)*

## Tasks

## T-001 — Accept the enrolment and consume a seat [done]

- Refs: US-001, AC-001
- Files: src/enrolment.js
- Notes: the decrement lives here, per D-001.

## T-002 — Refuse a full class without touching the seat count [done]

- Refs: AC-002
- Files: src/enrolment.js
- Notes: check before mutating; AC-002 asserts the count is unchanged.

## T-003 — Require guardian data for a minor [done]

- Refs: US-002, AC-003
- Files: src/enrolment.js
- Notes: checked before the seat check, so a blocked minor never consumes a seat.
