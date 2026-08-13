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

- Rewrite or retire the `feature-spec` skill
  (`payload/claude/skills/feature-spec/SKILL.md`). Found while realigning
  the role agents with the current document chain: it still produces
  `spec.md`/`plan.md`/`tasks.md` (lowercase, `FR1`/`FR2` requirements, no
  Given/When/Then) — a separate, older grammar than `PRD.md`/`RFC.md`/
  `SPEC.md`/`DESIGN.md`. `business-analyst.md` and `architect.md` no
  longer point at it (fixed alongside the agent realignment), but the
  skill itself still exists and would reintroduce the same staleness if
  anything references it again.
