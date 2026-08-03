# Architecture

Design notes for anyone changing the engine. If you only want to *use* the tool,
read `README.md` instead — this file is about why the code looks like it does.

## What is already enforced

Traceability from story to criterion to task to test, with codes unique
project-wide. Documents that own distinct families of codes: `PRD.md` owns
US-xxx and AC-xxx, `RFC.md` owns ASM-xxx and Q-xxx, `TDD.md` owns T-xxx. A
decision recorded without at least two alternatives considered. A criterion
missing any of its Given/When/Then clauses. A task marked `[concluida]` whose
criteria have no PASS proof. A test annotated with a criterion that no longer
exists. A source file mapped by no task.

And the one this project did not have before: **the constitution actually runs.**
Each `verification(forbidden|required)` executes its regex against its glob, each
`verification(test)` checks that the tagged test exists, a `[MUST]` with no
executable verification is a finding, and a glob that matches nothing is reported
as inert — because a check that cannot fail looks exactly like a check that
passed.

## What ships in this folder

```
bin/adp.js     the command
src/               the engine — parsers, audit, gates, init, rendering
src/index.js       programmatic API, for calling the same verdict from your own script
templates/         SCOPE · PRD · RFC · TDD · CONSTITUTION · config, what init writes
skill/SKILL.md     the agent contract, installed into .claude|.cursor|.agents by init
test/              56 tests, node:test, no framework
package.json       bin, exports, files — this folder IS the package
```

## Configuration

Everything is defaulted, so the engine runs against a repository with no config
at all. Two filenames are read, the first that exists winning:
`adp.config.json`, then `.spec/spec.config.json` — the file this repository
already carries.

To have the engine see its own tests while it is being built here, the config
needs `.` in the globs:

```json
{
  "testGlobs": ["test/**"],
  "srcGlobs": ["src/**", "bin/**"],
  "testCommand": "node --test \"test/*.test.js\"",
  "reporter": "tap"
}
```

Which config the repository root should carry depends on **Q-001** in
`.spec/features/agent-dev-pipeline/RFC.md` — whether this repository's scope is the
tool or Portal Proauto. Until that is answered, keep the snippet above in a
scratch file rather than committing it as the root config.

## Design notes worth knowing before changing anything

`src/core/` never touches I/O beyond reading the documents: it takes a project
and returns findings. Rendering lives in `src/cli.js`, serialisation behind
`--json`, and neither can reach a conclusion the other would not.

`bin/adp.js` sets `process.exitCode` and never calls `process.exit()`. With
`process.exit()`, a large piped output is truncated at the pipe buffer because
the process dies before stdout flushes. This is a scar, not a style preference.

Every structural regex is line-anchored and runs over a code-stripped copy of the
document. A heading shown inside backticks is documentation *about* the grammar,
not an element of it. Task status is read from the heading line, never by
searching the task's block for a status token — the last task's block runs to end
of file, so any later prose would be read as its status. Both rules exist because
both bugs were real, in this repository's own `.spec/scripts/audit.js`, and were
found by running this document chain through it.

Constitution regexes are supplied by the project, which means they are arbitrary
regexes written by a human. `(a+)+$` against the wrong input backtracks
catastrophically. They run in a **disposable subprocess with a hard timeout**, so
a pathological pattern degrades into a finding instead of hanging the gate
forever. That is a security boundary, not an optimisation.

`test/gates.test.js` reads the set of emittable codes out of the engine's own
source rather than from a hand-kept list, and fails if any code belongs to no
gate. A hand-kept list would drift — and drift is the one thing this tool exists
to catch.

## Credit

The engine's design descends from
[onp-spec-driven](https://github.com/onovoprogramador/onp-spec-driven) by Vitor
Manoel (MIT): the markdown grammar, the finding catalogue, proof that refuses
skips, and the sandboxed pattern search. The operating doctrine
descends from [bridge-commander](https://github.com/tonylampada/bridge-commander)
by Tony Lampada — including the sentence the whole board rests on — *board state
is the truth, conversation memory is a cache*. See `RFC.md` D-004 and D-001.
