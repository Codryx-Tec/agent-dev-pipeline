# TDD: class-enrolment

> feature: class-enrolment
> document: TDD — HOW to build it, in detail
> owns: T-xxx (tasks, each with `Refs:` and `Files:`)
> status: implemented

## 1. Shape of the solution

One module, one exported function. `enrol({ cohort, applicant })` returns
`{ ok, reason }` and decrements `cohort.seats` only when it returns `ok: true`.

## 2. Components

`src/enrolment.js` holds every rule. There is no layer beneath it, because
nothing yet would justify one — see `AGENTS.md`, YAGNI.

## 3. Data and contracts

```
cohort  : { id: string, seats: number }
applicant  : { email: string, age: number, guardian?: { email: string } }
return : { ok: boolean, reason?: "class full" | "guardian required" }
```

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

## Expected parallelism

All three tasks touch `src/enrolment.js`, so the planner puts them in ONE lane,
in document order. That is the correct answer rather than a limitation — and it
is exactly what the file list is for.
