# Installing agent-dev-pipeline

There is one way, and it is not really an installation.

```sh
cd ~/projects/whatever
npx @codryx/agent-dev-pipeline init --agent claude
```

Node ≥ 24 and `git`. **No runtime dependencies** — `npx` fetches one small
package and runs it. Nothing is added to your project, no `node_modules` appears
in it, and nothing is left behind except the files `init` deliberately wrote.

That is the whole point of the zero-dependency rule: there is no toolchain to
provision, no version of the tool that can be broken by someone else's release,
and nothing to uninstall.

## The `./adp` wrapper

`init` writes an executable `./adp` (and `adp.cmd` for Windows) **into the
project**, pinned to the exact version that just installed it:

```sh
#!/usr/bin/env bash
exec npx --yes @codryx/agent-dev-pipeline@0.6.0 "$@"
```

That one file resolves two things at once: you never write a shell alias by
hand, and CI gets a pinned version for free by calling `./adp` instead of a
bare `npx @codryx/agent-dev-pipeline`. It goes through the same
create-only-if-missing path every other file `init` writes does — a second
`init` never overwrites it, so a hand edit survives.

```sh
./adp new student-enrolment
./adp status
```

Want a bare `adp` on your `PATH` too? `./adp init --shell-alias` appends a
marked, removable block to `~/.zshrc` or `~/.bashrc` — never silently: it
prints the exact block first and asks for the word "yes" before writing
anything, the same posture `adp trust` takes before running anything *out
of* your repository. This is opt-in because writing into a dotfile
contradicts the "leaves nothing behind" promise on line one — the wrapper
above is the default precisely so nobody has to choose that trade-off just
to get a short command.

## Pin the version in CI

`./adp` already does this for you. Without it, `npx @codryx/agent-dev-pipeline`
with no version fetches whatever was published most recently — fine on your
own machine, awkward in a pipeline, where it means the gate guarding your
repository can change under you without a commit:

```yaml
- run: ./adp audit --ci
```

If you are not using the wrapper for some reason, pin explicitly:

```yaml
- run: npx --yes @codryx/agent-dev-pipeline@0.6.0 audit --ci
```

A build that is not reproducible cannot be evidence of anything, which is
awkward for a tool whose entire job is producing evidence.

### 0.5.0 stays published

Upgrading is never forced. **0.5.0 remains published on the registry and
fully supported** — a project that pinned `@codryx/agent-dev-pipeline@0.5.0`
in CI keeps installing and running against it exactly as it does today,
against projects still written in the 0.5.0 document grammar (`PRD.md`
owning `US-xxx`/`AC-xxx`, `RFC.md`, `TDD.md`). Nobody is required to migrate
to read this file. When you are ready, see "Upgrading" below.

## Verifying what you got

```sh
adp doctor              # the payload matches the manifest shipped with it
npm audit signatures    # the package came from its stated source
```

The two answer different questions and neither replaces the other. `doctor`
detects tampering after publication — a bad mirror, a partial extraction, an
edited local copy. It cannot detect a malicious publish, because an attacker who
controls the tarball controls the manifest inside it; that is what `npm audit
signatures` is for, checking the Sigstore provenance attached at publish time.

`init` runs the same payload check itself, **before writing anything**, and
refuses outright on a mismatch. There is no override flag, on purpose.

---

## Setting up a project

```sh
cd my-project
git init                 # lanes are git worktrees; without a repo, adp run cannot work
npx @codryx/agent-dev-pipeline init
```

`init` creates `.spec/SCOPE.md`, `.spec/CONSTITUTION.md`, `.spec/BACKLOG.md`,
`adp.config.json`, `./adp`/`adp.cmd`, the `.spec/features/`,
`.spec/rfc/` and `.spec/verification/` directories, and installs the agent
skill into whichever agent directory your project uses.

**It never overwrites.** Every write goes through a "create only if missing"
path, so re-running it after you have edited everything is safe, and the report
tells you what it kept rather than asking you to trust it. That is also why
upgrading needs no migration step of its own: the tool never assumes it wrote
what is on disk.

The agent is detected from the directories already present — `.claude/`,
`.cursor/`, `.agents/`, `.windsurf/`, `.gemini/`, `.github/skills/`, `.cline/`,
`.opencode/`, `.kilocode/`. When it can't tell — nothing found, or more than
one — and you're at a real terminal, it asks; a script or CI run gets
exactly today's silent default instead, and `--yes` skips the question even
interactively. Override with `--agent
claude|codex|cursor|antigravity|windsurf|gemini|copilot|cline|opencode|kilocode|none`
— or any other name at all, once `agent.skillsDir` names where to install it
in `adp.config.json`.

Adopting a codebase that already exists? Add `--brownfield`: it scans for
doc-shaped files and writes `.spec/BASELINE.md`, read-only — nothing is
moved or rewritten. See `README.md`'s "Adopting an existing project."

Then:

```sh
# 1. fill in .spec/SCOPE.md and set its status to Approved   -> opens G0
./adp new student-enrolment    # creates PRD.md and SPEC.md; DESIGN.md too if due
./adp status                   # seven lights
./adp audit                    # the findings behind the first red one
./adp prompt                   # the text to paste back to your AI
./adp monitor                  # the read-only page, on http://127.0.0.1:7788
```

## Wiring it into CI

The exit code **is** the failing gate: `0` clean, `1`–`7` for G0–G6. Nothing to
parse.

```yaml
- run: ./adp audit --ci
```

`--ci` escalates the softer findings — unproven criteria, stale proof, open
questions, uncovered criteria, orphan source files — from warnings to errors,
and still honors a valid entry in `DEFERRALS.md`. One engine, two postures:
quiet enough to work under, strict enough to be a gate. For the run that
should see past every deferral, add `--strict` — the monthly check, not the
everyday one.

## Upgrading

```sh
./adp upgrade                    # dry-run: reports what would change
./adp upgrade --apply            # writes it
./adp upgrade --only-migrations  # run pending .spec/** migrations alone, e.g. while debugging one
```

`init` writes `.spec/.adp-install.json`, a lockfile recording exactly which
version installed which file, and its hash. `upgrade` diffs that against the
version currently running: a file you never touched is updated in place; a
file you edited gets a `.new` sidecar instead of being overwritten, so your
edit and the new version sit side by side for you to merge by hand; a file
removed from the payload is reported, never deleted. Migrations run first —
the 0.5.0→0.6.0 one rewrites `PRD.md`/`RFC.md`/`TDD.md` into
`PRD.md`/`RFC.md`/`DESIGN.md`/`SPEC.md` without discarding a line of your
content: what it cannot place automatically becomes a finding
(`PRD_MISSING` once the split runs), never silence.

Dry-run is the default on purpose — writing is `--apply`, a deliberate act,
same posture as everything else this tool asks consent for.

If you pinned a version in CI, that pin is the one place an upgrade stays
manual until you choose it — which is the point of pinning it. `adp doctor`
warns when it detects your lockfile is behind the copy currently running.

## Uninstalling

There is nothing installed beyond the files inside your project. Delete
`.spec/`, `./adp`, `adp.cmd`, `adp.config.json` and whichever agent
directories `init` populated, and clear the `npx` cache if you want the
bytes back:

```sh
npm cache clean --force
```

If you ran `--shell-alias`, remove the marked block from your shell rc file
by hand — it is delimited exactly so this is easy:

```sh
# >>> agent-dev-pipeline alias >>>
alias adp='npx --yes @codryx/agent-dev-pipeline@0.6.0'
# <<< agent-dev-pipeline alias <<<
```

Your `.spec/` documents are plain markdown and stay useful without the tool —
that was the point of not putting them in a database.

---

## Working on the tool itself

Not an install route; this is how you run the source you are editing.

```sh
git clone https://github.com/Codryx-Tec/agent-dev-pipeline
cd agent-dev-pipeline
npm test                       # 423 tests, no dependencies to fetch first
node bin/adp.js status         # the tool auditing itself
node scripts/build-manifest.js # after changing anything under payload/
```

`npm link` works if you want `adp` on your PATH pointing at the working tree.
It is a convenience for development, not a supported way to install the tool.
