# Architecture

Design notes for anyone changing the engine. If you only want to *use* the tool,
read `README.md` instead — this file is about why the code looks like it does.

## What is already enforced

Traceability from story to criterion to task to test, with codes unique
project-wide. Four documents, each owning a distinct family: `PRD.md` is prose
only (what, for whom, why); `RFC.md` — flat and global, not nested under a
feature — owns `D-xxx` decisions; `DESIGN.md` is prose only (how, in detail);
`SPEC.md` owns everything the engine cross-references: `US-xxx`, `AC-xxx`,
`ASM-xxx`, `Q-xxx`, `T-xxx`. A decision recorded without at least two
alternatives. A criterion missing any of its Given/When/Then clauses. A task
marked `[done]` whose criteria have no PASS proof. A test annotated with a
criterion that no longer exists. A source file mapped by no task.

Beyond structure: the eight antipattern checks (a PRD naming a technical
solution, a decision with no measurable context, an option with no real
cons, no option considering "do nothing," a vague criterion with no number,
a document past its length ceiling, a document older than the code it maps,
substantial prose copied instead of linked). The ceremony matrix, so a
one-person reversible change never owes the same paperwork as a
money-touching one. The MVP boundary and `BACKLOG.md`, so nothing exists in
limbo. Brownfield recognition and the baseline ratchet, so adopting an
existing codebase produces a legible first audit instead of a wall.
Declared deferral, so living with a real finding on purpose is a dated,
owned decision instead of a hidden switch.

And the one this project did not have before any of that: **the constitution
actually runs.** Each `verification(forbidden|required)` executes its regex
against its glob, each `verification(test)` checks that the tagged test
exists, a `[MUST]` with no executable verification is a finding, and a glob
that matches nothing is reported as inert — because a check that cannot fail
looks exactly like a check that passed.

## The seven gates

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ code ──▶ test ──▶ audit
  G0      G1      G2       G3         G4                G5       G6
```

`gates.js` holds one table — `GATES`, a code, and the gate each code belongs
to — as data, not as scattered `if` statements. `test/gates.test.js` reads
the codes `audit.js`/`principles.js` can actually `emit(...)` straight out of
their source and asserts every one of them is claimed by exactly one gate.
A hand-kept list would drift, and drift is the one thing this tool exists to
catch. The exit code doubles as the gate number that failed (`0` clean,
`1`–`7` for G0–G6) — a pipeline learns *where* it broke without parsing
anything.

Four states, not two: `clean`, `red`, `blocked` (an earlier gate is red, so
this one was never evaluated), and `n/a` (the ceremony matrix decided this
gate is not due — G2/G3 only, the other five are never skippable). A gate
sitting on a real error is red even when ceremony would not otherwise
require it; only a gate with zero findings of its own may ever read `n/a`.

## What ships in this folder

```
bin/adp.js         the command — sets process.exitCode, never calls process.exit()
src/
  cli.js             command dispatch: help/version, then config, then a full project load
  config.js          everything defaulted; runs against a repo with no config file at all
  version.js         the single VERSION constant every doc/wrapper/lockfile reads
  parsers/           prd · rfc · design · spec · constitution · backlog · baseline ·
                      deferrals · annotations — each returns data, touches no I/O of its own
  core/              project (loads everything once) · audit (the findings) ·
                      gates (the code→gate map and the state machine) · principles ·
                      ceremony · init (the installer) · report / report-html ·
                      estimate · count · closure · history (Function Point + calibration) ·
                      plan · executor · ledger (background execution in worktrees) ·
                      agent (the headless CLI adapter) · trust · verify · upgrade · resume
  util/              text (line-anchored regex helpers) · glob (zero-dependency matching + walk)
  server/            read-only http server + state projection for the monitor
  ui/                index.html · app.css · app.js, inlined into one response
scripts/           build-manifest.js — the payload's SHA-256 manifest
.github/workflows/ ci, and publish with provenance from OIDC
test/              374 tests, node:test, no framework
payload/           WHAT GETS INSTALLED — templates, AGENTS.md, skills, agents, hooks, docs
.exemplo/          a finished, green, runnable project to read and break
.exemplo-legado/   a small pre-existing codebase, adopted with --brownfield
package.json       bin, exports, files — this folder IS the package
```

The split that matters: **what the tool *is* lives in `src/`; what the tool
*installs* lives in `payload/`.** Nothing pretends to be both, which is why
the repository root stays clean and `init` has no special cases.

## Configuration

Everything is defaulted, so the engine runs against a repository with no
config at all — that is what lets `adp audit` be the first command anyone
ever types. Two filenames are read, the first that exists winning:
`adp.config.json`, then `.spec/spec.config.json`.

This repository's own root config, to see its own tests and source:

```json
{
  "testCommand": "node --test --test-reporter=tap \"test/*.test.js\"",
  "reporter": "tap",
  "testGlobs": ["test/**"],
  "srcGlobs": ["src/**", "bin/**"],
  "delivery": "local-only",
  "parallel": { "maxParallel": 3 }
}
```

`deferrals: { maxMatches, maxDays }` and `agent: { models: {...} }` are the
two newest keys — see `README.md`'s "Living with a real finding" section and
`core/agent.js`'s `resolveConfiguredModel()` for what each one governs.

## Design notes worth knowing before changing anything

`src/core/` never touches I/O beyond reading the documents: it takes a
project and returns findings. Rendering lives in `src/core/report.js` (and
`report-html.js` for the portable snapshot), JSON serialisation behind
`--json`, and neither can reach a conclusion the other would not.

`bin/adp.js` sets `process.exitCode` and never calls `process.exit()`. With
`process.exit()`, a large piped output is truncated at the pipe buffer
because the process dies before stdout flushes. This is a scar, not a style
preference.

Every structural regex is line-anchored and runs over a code-stripped copy of
the document. A heading shown inside backticks is documentation *about* the
grammar, not an element of it. Task status is read from the heading line,
never by searching the task's block for a status token — the last task's
block runs to end of file, so any later prose would be read as its status.
Both rules exist because both bugs were real, found by running this
document chain through itself.

Constitution regexes — and a deferral's `Scope:` glob, and every other
project-supplied pattern — are arbitrary, human-written regexes. `(a+)+$`
against the wrong input backtracks catastrophically. They run in a
**disposable subprocess with a hard timeout**, so a pathological pattern
degrades into a finding instead of hanging the gate forever. That is a
security boundary, not an optimisation.

`core/agent.js`'s `editArgs`/`modelArgs` are `null`, never `[]`, for a
harness nobody has verified the flags for. `--allow-edits`/a configured
model with an unknown harness **refuses rather than guesses** — a wrong
guess here is silent and surfaces hours (or a bill) later as work that
looks like it happened and did not.

`core/init.js`'s `writeIfMissing()` is the one place every file `init`
writes goes through: a path that already exists is reported as *kept*, never
touched. That single function is why re-running `init` is always safe and
why upgrading needs no migration step at all — the tool never assumes it
wrote what is on disk.

## Credit

The engine's design descends from
[onp-spec-driven](https://github.com/onovoprogramador/onp-spec-driven) by Vitor
Manoel (MIT): the markdown grammar, the finding catalogue, proof that refuses
skips, and the sandboxed pattern search. The operating doctrine
descends from [bridge-commander](https://github.com/tonylampada/bridge-commander)
by Tony Lampada — including the sentence the whole board rests on — *board state
is the truth, conversation memory is a cache*. See
`.spec/rfc/RFC-001-agent-dev-pipeline.md`, D-001 and D-004.
