# Backlog — Agent Dev Pipeline

> What fell outside the MVP boundary (SCOPE-0.6.0.md §2.2). Backlog items
> carry no tracking code — only a promoted PRD does. A line that already
> looks like a real one (`US-001`, `AC-002`, `T-003`, `ASM-004`, `Q-005`,
> `D-006`) is reported as `BACKLOG_ITEM_WITH_CODE`: a warning, not a gate,
> but a real loophole if left alone — an item that already claims a code
> could look proven without ever having been implemented.
>
> To promote an item: remove its line here, run `adp new <feature-slug>`,
> and add `- [ ] <feature-slug>` to `SCOPE.md`'s MVP checklist.

## Product

## Technical

- Catch up this repo's own self-audit (`.spec/features/agent-dev-pipeline/SPEC.md`)
  with everything built since the M1→M2-core migration: the ceremony matrix
  (M2b-core), the MVP boundary and `BACKLOG.md` (M2c-core), `adp report` and
  the recorded decision, `adp profile`/`adp estimate` (PRD-003-core), and the
  five antipattern checks (M3b-core). `adp audit --ci` currently reports 51
  `TEST_ORPHAN` and 6 `FILE_ORPHAN` findings — every test written for that
  work already carries a real `@spec:AC-xxx` tag and already has real
  passing proof; what's missing is the `US-xxx`/`AC-xxx`/`T-xxx` entries in
  `SPEC.md` for the tags to resolve against. Real, substantial writing (not
  mechanical) — carving 51 test cases into coherent story/criterion
  boundaries is a judgment call worth doing carefully, not rushed inside a
  feature pass. Roughly the size of its own milestone.
- Once the above lands, refresh `DESIGN.md`'s "Three rings" architecture
  section to describe what actually exists now (ceremony.js, the MVP/
  backlog checks, report-html.js, estimate.js, the antipattern checks) —
  `DOC_FOSSIL` already reports it as older than the code it maps, correctly.
- Realign `payload/claude/agents/*.md` (architect, backend, business-analyst,
  designer, frontend, security, techlead, tester — 8 files, ~766 lines) with
  this engine's actual document chain. Found while writing `researcher.md`:
  all eight still reference `spec.md`/`tasks.md`/`plan.md` (lowercase) and
  `.spec/architecture/<slug>.md` — a different, older convention than this
  tool's own `PRD.md`/`RFC.md`/`DESIGN.md`/`SPEC.md`, `.spec/rfc/RFC-<NNN>-
  <slug>.md` for decisions. `architect.md` even defines its own inline ADR
  format instead of pointing at the RFC family that already exists for
  exactly that. Not urgent (these are used by name, when a session invokes
  that role — they don't gate anything mechanically the way `SKILL.md`
  does), but real: an agent handed one of these roles today would look for
  files this project doesn't have. `researcher.md` was written fresh
  against the current grammar and does not have this problem.
