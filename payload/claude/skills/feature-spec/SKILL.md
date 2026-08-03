---
name: feature-spec
description: Guides feature specification before coding - spec (what/why) -> plan (how) -> tasks (steps) -> analyze (consistency), generating .spec/features/<feature>/. Use when the feature is large, ambiguous, touches several modules/contracts, or requires an architecture decision. Inspired by Spec-Driven Development (github/spec-kit).
---

# Per-feature specification (spec -> plan -> tasks -> analyze)

The scope gate (`project-kickoff` skill) covers the project as a whole. For a feature that is large, ambiguous, or touches several modules, write a short per-feature spec before coding. Inspired by Spec-Driven Development (github/spec-kit), adapted to our flow.

## When to use

- Use when: the feature is large, has ambiguous requirements, touches several modules/contracts, or involves an architecture decision.
- Can skip when: the change is small, obvious and local (a bug fix, a text tweak). In that case, record the decision to skip in `.spec/CHANGELOG.md`.

## Steps

1. Confirm the scope: does the feature fit within the approved `.spec/SCOPE.md`? If not, stop and align with the user.
2. Define the slug and create `.spec/features/<feature-slug>/`.
3. Write `spec.md` — the **what** and the **why** (requirements, acceptance criteria), without technical detail. Ask the user about anything ambiguous, one question at a time.
4. Write `plan.md` — the **how** (stack, architecture, affected modules/files, API contracts, risks, validation).
5. Write `tasks.md` — an ordered checklist, with dependencies and a `[P]` marker for what can be parallelized. Each task must trace back to a line in `spec.md` or `plan.md`.
6. Run **Analyze** (checklist below).
7. Define the target version (SemVer milestone `v0.x.0`) and, with the user's confirmation, generate the issues from the tasks (`github-flow` skill pipeline). This is handed off to techlead, who owns issue creation.
8. Record the spec creation in `.spec/CHANGELOG.md`.

## Link to the GitHub pipeline (`github-flow` skill)

- Each item in `tasks.md` becomes an issue (`feature` label), linked to a version (SemVer milestone `v0.x.0`).
- A completed and validated feature closes the milestone and goes into that version's tag/release.

## Analyze: consistency checklist (before implementing)

```txt
[ ] spec.md covers what the approved .spec/SCOPE.md asks for (nothing out of scope)
[ ] plan.md addresses everything the spec describes
[ ] every task in tasks.md traces back to a line in spec.md or plan.md
[ ] the GitHub issues match the tasks 1:1
[ ] the feature's version/milestone (v0.x.0) is defined
[ ] ambiguous points have been resolved (or listed as "To confirm")
```

## Templates

### `spec.md`

```md
# Spec: <feature name>

**Status:** Draft | Approved
**Date:** YYYY-MM-DD
**Target version:** vX.Y.0

## Goal

What this feature delivers and why.

## Users and scenarios

Who uses it and in what situation.

## Functional requirements

- [ ] FR1: ...
- [ ] FR2: ...

## Acceptance criteria

- [ ] ...

## Out of scope

- ...

## Open items

- [ ] To confirm: ...
```

### `plan.md`

```md
# Plan: <feature name>

**Related spec:** ./spec.md
**Date:** YYYY-MM-DD

## Approach

How the feature will be built (summary).

## Architecture and affected modules

- Frontend: ...
- Backend: ...
- Database: ...

## Contracts / API

Endpoints, payloads and contract changes, if any.

## Files likely affected

- `path/file` — reason

## Risks and decisions

- Risk/decision -> mitigation

## Validation

How it will be tested (test, build, lint, manual verification).
```

### `tasks.md`

```md
# Tasks: <feature name>

**Related plan:** ./plan.md
**Version/milestone:** vX.Y.0

Execution order. Mark [P] when the task can be done in parallel.

- [ ] T1: ... (tracks: FR1)
- [ ] T2 [P]: ... (tracks: plan > Architecture)
- [ ] T3: ... (depends on: T1)

## Task -> issue map

| Task | Issue |
| ---- | ----- |
| T1   | #     |
```

Rules:

- Keep the artifacts small; the spec describes intent, not implementation.
- Update `spec.md`/`plan.md`/`tasks.md` if the understanding changes during the feature.
- Do not start implementation while Analyze is still pending.
- Record the feature spec creation in `.spec/CHANGELOG.md`.
- After merge, if a bug shows up in a feature that has a spec, go back to its `spec.md`/`plan.md`: confirm the code still matches what was written (drift) before fixing just the symptom. Record the bug in `.spec/TROUBLESHOOTING.md` and, if it reveals a permanent rule, in `.spec/BEST_PRACTICES.md` (see `AGENTS.md` > Memory Files).
