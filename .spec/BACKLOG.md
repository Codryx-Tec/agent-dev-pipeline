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
- M4's archiving step: `git mv` of recognized documentation into
  `project_old_artifacts/`, with the three guards SCOPE-0.6.0.md §PRD-002
  names as non-negotiable (`git mv` never `mv`, refuse on a dirty tree, an
  untouchable list — README/LICENSE/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT
  and anything a CI workflow references — copied, never moved) and its own
  explicit consent gate, separate from `init`'s. Deliberately deferred from
  M4-readonly-core: this is the one step in the whole 0.6.0 scope that
  moves a user's real files, and shipping it alongside the safe,
  read-only half (recognition, `BASELINE.md`, the archaeologist role)
  would mean a bug in the safe half ships untested next to the dangerous
  one. Build and review it on its own.
- `BASELINE_WIDENED` — SCOPE-0.6.0.md's rule that `BASELINE.md` may only
  shrink, never regrow, needs walking that file's own git history to
  detect a removed entry coming back. No payoff until teams are actually
  using ratchet mode over time; not built in M4-readonly-core.
- The mtime fallback for "touched since baseline" when git is unavailable
  or `git diff` fails. M4-readonly-core's ratchet only discounts severity
  when git succeeds; without it, a baselined file gets no discount at all
  rather than a less-precise guess. Brownfield adoption already assumes
  git everywhere else in the source design (the deferred archiving step
  refuses outside one); this keeps that assumption for the ratchet too.
- Module-comment scanning as a recognition source. The glob-matchable
  cases (README/docs/ADR/OpenAPI/migrations/CHANGELOG/CONTRIBUTING) are
  built; scanning source comments for documentation needs real parsing
  per language, not a glob.
