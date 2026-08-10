# PRD: {{FEATURE}}

> feature: {{FEATURE}}
> document: PRD — WHAT, for WHOM, WHY
> status: draft

Prose only. No stories, no criteria, no technology — those belong to
`SPEC.md` and `RFC.md`. A PRD that names a database, a framework or a data
structure has drifted into being a spec in disguise; say what the system must
do, never how it does it.

Gate G1 passes when this document exists and the `feature:` line above
matches the directory it lives in.

## Context

Why this feature exists, in a paragraph anyone on the team can read. Ground it
in a number where you can — "the process has some problems" proves nothing;
"support tickets about this take 20 minutes to resolve" does.

## What this delivers

The outcome, for the person who asked for it. Not a list of screens or
endpoints — what becomes true that was not true before.

## Out of scope for this PRD

## Stories and criteria

Owned by `SPEC.md` — the layer the machine confers. Write `US-xxx` and
`AC-xxx` there, not here.

## Assumptions and open questions

Owned by `SPEC.md`. Anything you assumed while writing this goes there as an
`ASM-xxx`; anything you could not decide goes there as a `Q-xxx`, marked
**blocking** if the path cannot be chosen without the answer.
