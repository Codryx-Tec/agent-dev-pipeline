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

- `adp audit` reports `OPTION_DO_NOTHING_MISSING` (warning) 16 times against
  this repo's own `.spec/rfc/RFC-001-agent-dev-pipeline.md` — none of its
  16 decisions names a "do nothing" alternative, because they all predate
  the check (M3b-remainder). Known, accepted debt, not retrofitted:
  writing a genuine "do nothing" alternative for 16 already-settled,
  mostly-structural engineering decisions after the fact would be
  ceremony for its own sake, exactly what this whole antipattern family
  exists to catch elsewhere. Revisit case by case if any of these
  decisions are ever reopened, rather than as a batch.
