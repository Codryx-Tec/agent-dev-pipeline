# Backlog — Inscrição em Turma (exemplo)

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

- Payment and invoicing for paid classes. `SCOPE.md` names this explicitly
  out of scope for `class-enrolment` — it changes what the acceptance
  criteria would have to promise, so it earns its own feature rather than
  creeping into this one.
- Cancelling an existing enrolment, freeing the seat back up.
- A waiting list for a class that is already full, instead of a flat
  refusal.

## Technical

- Concurrency handling for the seat count. The RFC's decision on where the
  count is decremented already names a transaction wrapper as where to
  start "the day two enrolments race" — not needed yet at this example's
  scale.
