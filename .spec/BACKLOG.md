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
- The mtime fallback for "touched since baseline" when git is unavailable
  or `git diff` fails. M4-readonly-core's ratchet only discounts severity
  when git succeeds; without it, a baselined file gets no discount at all
  rather than a less-precise guess. Brownfield adoption already assumes
  git everywhere else in the source design (`adp archive`, D-017, refuses
  outside one too); this keeps that assumption for the ratchet.
- Module-comment scanning as a recognition source. The glob-matchable
  cases (README/docs/ADR/OpenAPI/migrations/CHANGELOG/CONTRIBUTING) are
  built; scanning source comments for documentation needs real parsing
  per language, not a glob.
- `--shell-alias` on PowerShell (Windows). PRD-005 says "same rule" for
  `adp.cmd`'s side of the alias, but that means editing the PowerShell
  `$PROFILE` file, which this Linux development environment has no way to
  test. `./adp`/`adp.cmd` themselves ship regardless — they are plain
  files, not an edit to something outside the project — only the opt-in
  alias-into-the-profile half is deferred, same reasoning `D-017`'s guards
  use: an unverified edit to a file this tool cannot check risks
  corrupting it, and that is worse than not offering the shortcut yet.
- The capability-gap hours multiplier (`ceremony.capabilityGapMultiplier`,
  §2.4) is a flat, informational `1.5x`, not a measured one — no closure
  yet records which capabilities a feature actually exercised, so there is
  nothing yet to average instead of assume. Matches the deferral
  PRD-003c-history-core already recorded for the rest of `adp close`'s own
  metrics; revisit once enough closures against `OPTION_BEYOND_TEAM`
  features exist to make a real number worth computing.
- The §2.4 scoring matrix's `Total` column is a plain sum, not weighted by
  the declared `W-xxx` values arithmetically — the weights order which
  criteria get cited in `**Decision criteria:**` and feed
  `OPTION_BEYOND_TEAM`'s ceremony logic, but nothing in `audit.js`
  multiplies a cell by its column's weight. Surfaced while drafting `D-017`
  (a `W-001`/`W-002`-weight-5 criterion sits in the same unweighted sum as
  `W-005`/`W-006`-weight-3 ones), not fixed there. A human filling in raw
  per-criterion scores can under- or over-represent a heavily-weighted
  criterion next to a lightly-weighted one without the tool ever noticing.
