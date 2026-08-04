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

## Give it a short name

You will type this dozens of times a day, so alias it once:

```sh
# ~/.zshrc or ~/.bashrc
alias adp='npx @codryx/agent-dev-pipeline'
```

Everything in the documentation is written as `adp <command>`; that alias is what
makes it true. The rest of this file assumes it.

## Pin the version in CI

`npx` without a version fetches whatever was published most recently. On your own
machine that is usually what you want. In a pipeline it means the gate that
guards your repository can change under you without a commit:

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
```

Pin it. A build that is not reproducible cannot be evidence of anything, which is
awkward for a tool whose entire job is producing evidence.

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
git init                 # lanes are git worktrees; without a repo, M6 cannot work
adp init
```

`init` creates `.spec/SCOPE.md`, `.spec/CONSTITUTION.md`, `adp.config.json`,
the `.spec/features/` and `.spec/verification/` directories, and installs the
agent skill into whichever agent directory your project uses.

**It never overwrites.** Every write goes through a "create only if missing"
path, so re-running it after you have edited everything is safe, and the report
tells you what it kept rather than asking you to trust it. That is also why
upgrading needs no migration step: the tool never assumes it wrote what is on
disk.

The agent is detected from the directories already present — `.claude/`,
`.cursor/`, `.agents/`. If more than one exists, it says so instead of guessing
silently. Override with `--agent claude|codex|cursor|antigravity|none`.

Then:

```sh
# 1. fill in .spec/SCOPE.md and set its status to Approved   -> opens G0
adp new student-enrolment      # creates PRD.md, RFC.md, TDD.md
adp status                     # six lights
adp audit                      # the findings behind the first red one
adp prompt                     # the text to paste back to your AI
adp monitor                    # the read-only page, on http://127.0.0.1:7788
```

## Wiring it into CI

The exit code **is** the failing gate: `0` clean, `1`–`6` for G0–G5. Nothing to
parse.

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
```

`--ci` escalates the softer findings — unproven criteria, stale proof, open
questions, uncovered criteria, orphan source files — from warnings to errors.
One engine, two postures: quiet enough to work under, strict enough to be a gate.

## Upgrading

Nothing to do. `npx` picks up the new version the next time you run it, and
`init` never overwrites your documents, so re-running it after an upgrade only
fills in files a newer version added.

If you pinned a version in CI, that pin is the one place an upgrade is a
deliberate act — which is the point of pinning it.

## Uninstalling

There is nothing installed. Clear the `npx` cache if you want the bytes back:

```sh
npm cache clean --force
```

Your `.spec/` documents are plain markdown and stay useful without the tool —
that was the point of not putting them in a database.

---

## Working on the tool itself

Not an install route; this is how you run the source you are editing.

```sh
git clone https://github.com/Codryx-Tec/agent-dev-pipeline
cd agent-dev-pipeline
npm test                       # 139 tests, no dependencies to fetch first
node bin/adp.js status         # the tool auditing itself
node scripts/build-manifest.js # after changing anything under payload/
```

`npm link` works if you want `adp` on your PATH pointing at the working tree.
It is a convenience for development, not a supported way to install the tool.
