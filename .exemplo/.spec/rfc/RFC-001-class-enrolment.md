# RFC-001: class-enrolment

> rfc: RFC-001
> document: RFC — WHICH path, among the possible ones
> owns: D-xxx (decisions)
> status: ready

Flat and global (Q-001): linked from
[`class-enrolment/PRD.md`](../features/class-enrolment/PRD.md)'s `rfcs:`
line, not nested under it.

## Purpose

`PRD.md` fixed what to build. This fixes how we get there, with the roads not
taken written down beside the one we took. A class with 30 seats must never
accept a 31st enrolment — that overbooking is the concrete failure this
decision exists to prevent.

## Decisions

### D-001 — Where the seat count is decremented

**Alternatives considered**

1. *Inside the enrolment function.* It receives the class object and mutates it.
   One place to look, but the caller must hand over something mutable.
2. *In the caller, after a successful result.* The function stays pure and
   returns a verdict; the caller applies it. Isolated and testable — and every
   caller can forget, and one that forgets overfills the class.
3. *In a transaction wrapper.* Correct under concurrency, and far more machinery
   than a teaching example can justify.
4. *Do nothing — keep counting seats by hand, outside the code.* Costs no
   engineering time today. Loses the one guarantee this whole feature exists
   for: nothing stops a 31st enrolment, because nothing is actually counting.

**Decision: alternative 1 — inside the enrolment function.**

**Rationale.** AC-002 says a refused enrolment must leave the count unchanged,
so refusal and decrement have to be decided in the same place. Option 2 splits
that decision across two files and leaves the rule enforceable only by
convention.

**Consequences.** The function is not pure, so its tests assert on the class
object as well as on the return value — and they do. Concurrency is out of
scope; the day two enrolments race, alternative 3 is where to start.

### D-002 — How a refusal is reported

**Alternatives considered**

1. *Throw an exception.* Impossible to ignore, but it turns "the class is full"
   — an ordinary, expected outcome — into an exceptional one.
2. *Return a verdict object with `ok` and a reason.* Refusal becomes data, and
   the caller has to look at it to learn anything.
3. *Do nothing: return `undefined` on refusal, same as on success.* No new
   shape to design. The caller cannot tell "enrolled" from "refused" without
   inspecting the class object itself, which is exactly the silent failure
   AC-002 exists to prevent.

**Decision: alternative 2 — a verdict object.**

**Rationale.** A full class is a normal Tuesday, not an error. Exceptions for
expected outcomes push callers into using `try`/`catch` as control flow.

**Consequences.** A caller who ignores the returned value gets silence instead
of a crash. The tests assert on `ok` and on the reason for exactly that reason.

## Assumptions and open questions

Owned by `SPEC.md`, not here — see its `ASM-xxx`/`Q-xxx` sections.
