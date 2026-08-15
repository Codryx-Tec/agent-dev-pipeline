# .exemplo-legado — adopting a codebase that already exists

Everything else in this folder — `README.md`, `CHANGELOG.md`, `docs/`,
`src/`, `test/` — **is the example**: a small, real, pre-existing project
that has never heard of this tool. `invoice-tools` has real code, a partial
test suite (`formatInvoice` and `discount.js` are untested — that is
deliberate, not an oversight), a loose ADR, and a `docs/SPEC.md` that has
quietly drifted from what the code actually does. This file is the only
thing here that is not part of the fiction.

`.exemplo/` shows a project born with this tool. This one shows the other
entry door: **`adp init --brownfield`**, and what it is actually like to
point this tool at four years of code nobody wrote it for.

## 1. Make it a real repository first

This folder ships without a `.git/` — npm packages never include one, and
without a commit, the ratchet in step 4 has nothing to compare against.

```sh
cd .exemplo-legado
git init -q -b main
git add -A
git commit -q -m "invoice-tools as it stood before adoption"
```

## 2. Recognition — nothing is moved or rewritten

```sh
node ../bin/adp.js init --brownfield --agent none
```

Read the notes at the bottom of the output:

```
note: brownfield recognition found 4 existing doc-like file(s): README* (1), docs/** (2), CHANGELOG* (1) — a starting point for the archaeologist role, nothing was moved
note: BASELINE.md recorded 2 pre-existing source file(s) — findings tied to them stay warnings until touched
```

Nothing you already had was touched. What got created is entirely new:
`.spec/`, a fresh `adp.config.json`, `./adp`. Open `.spec/BASELINE.md` — it
names `src/discount.js` and `src/invoice.js`, the commit you just made, and
nothing else. That list is the whole mechanism: a **read-only receipt** of
what existed the moment this tool arrived.

## 3. The archaeologist — a draft, cited, never approved

If you have Claude Code installed, this is the moment to invoke the
`archaeologist` role. It reads the recognition notes above plus
`README.md`, `docs/SPEC.md`, and `docs/adr/0001-flat-json-storage.md`, and
proposes `.spec/SCOPE.md` as a **`Draft`** — every claim citing the file it
came from, never `Approved` on its own. Nobody's SCOPE gets signed by an AI
reading old files; a human still has to read the draft and decide.

Without Claude Code, do the same thing by hand: fill in `.spec/SCOPE.md`
from what `README.md`/`docs/SPEC.md` actually say, and set its status to
`Approved` once you agree with it.

## 4. The first audit is legible — not a wall

```sh
node ../bin/adp.js audit
```

```
WARN   source file mapped by no task (FILE_ORPHAN) — src/discount.js is mapped by no task
WARN   source file mapped by no task (FILE_ORPHAN) — src/invoice.js is mapped by no task
WARN   principle without executable verification (PRINCIPLE_WITHOUT_VERIFICATION) — P-001 ...

✔ all gates clean (3 warning(s))
```

Three lines. Every real project this tool has never seen before starts with
every source file `FILE_ORPHAN` — mapped by no task, because no task has
been written yet — and on a real four-year-old codebase that would normally
mean hundreds of lines burying the one thing worth reading. `BASELINE.md` is
what keeps it to three: both pre-existing files are warnings, not errors,
and stay that way even under `--ci`:

```sh
node ../bin/adp.js audit --ci
# still: all gates clean (3 warning(s)) — the baseline discount holds
```

## 5. The ratchet — touch a file, and the discount ends

```sh
echo "// a small edit" >> src/invoice.js
node ../bin/adp.js audit --ci
```

```
WARN   source file mapped by no task (FILE_ORPHAN) — src/discount.js is mapped by no task
ERROR  source file mapped by no task (FILE_ORPHAN) — src/invoice.js is mapped by no task

✘ 1 error(s), 2 warning(s) — first red gate: G6
```

`discount.js` — still untouched since the baseline commit — is exactly
where it was. `invoice.js` — the file you just edited, even before
committing that edit — lost its discount and reports at full strength. This
list only ever shrinks: touch a baselined file once, and this tool governs
it like any other file, permanently.

## What this does not show

Archiving the old documentation into `project_old_artifacts/` — the one
step in this tool that would actually move one of your files — is
deliberately not built yet (see the main repository's own
`.spec/BACKLOG.md`). Nothing here demonstrates it, because there is nothing
to demonstrate.
