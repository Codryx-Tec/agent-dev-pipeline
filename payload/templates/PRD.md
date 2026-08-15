# PRD: {{FEATURE}}

> feature: {{FEATURE}}
> document: PRD — WHAT, for WHOM, WHY
> status: draft
> rfcs:
> signals: {{SIGNALS}}

Prose only. No stories, no criteria, no technology — those belong to
`SPEC.md` and `RFC.md`. A PRD that names a database, a framework or a data
structure has drifted into being a spec in disguise; say what the system must
do, never how it does it.

Gate G1 passes when this document exists and the `feature:` line above
matches the directory it lives in.

RFCs are no longer a fixed file next to this one — one can serve several
PRDs, and one PRD often needs several, one per one-way door. `rfcs:` names
which decision records apply here, comma-separated: `rfcs: RFC-001, RFC-003`.
Create one with `adp new --rfc <slug>`; gate G2 fails while this line stays
empty, or if an id it names does not resolve to a real file — but only when
`signals:` below puts this feature at a ceremony level that requires one.

`signals:` is what decides how much ceremony this feature actually owes —
comma-separated, from: `multiple-teams`, `hard-to-reverse`, `money-or-pii`,
`new-tech`, `large-estimate`. No signal at all means light ceremony (SPEC
only — RFC and DESIGN both read `n/a`); `hard-to-reverse`/`new-tech`/
`large-estimate` alone means DESIGN is due; `multiple-teams` means RFC is
due too; `money-or-pii` means the full chain, reviewed. `adp new --signals
<list>` sets this at creation time; edit it by hand later if the stakes
turn out different than they first looked.

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
