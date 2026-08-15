# DESIGN: class-enrolment

> feature: class-enrolment
> document: DESIGN — HOW to build it, in detail
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

## Expected parallelism

All three tasks touch `src/enrolment.js`, so the planner puts them in ONE lane,
in document order. That is the correct answer rather than a limitation — and it
is exactly what the file list is for. The tasks themselves are declared in
`SPEC.md`.
