# AGENTS.md — Rules for AI Agents

> Read before any task. All `.md` output in English. **Never translate engine
> tokens** — finding codes (`AC_WITHOUT_TEST`, `AC_WITHOUT_PROOF`,
> `TASK_DONE_WITHOUT_PROOF`, `PRINCIPLE_WITHOUT_VERIFICATION`) and task statuses
> (`[pending]`, `[in-progress]`, `[in-test]`, `[done]`) are the
> machine's vocabulary, not prose. Talk to the human in their own language.

## Core loop

Start every session with `adp status`. Seven lights come back. Work on the
**first red one** — the ones after it read `blocked`, not broken, and fixing
those first is wasted effort.

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ code ──▶ verify ──▶ audit
  G0      G1      G2       G3         G4                 G5        G6
```

`PRD.md` is prose only — what, for whom, why. `RFC.md` owns `D-xxx` decisions.
`SPEC.md` is where `US-xxx`, `AC-xxx`, `ASM-xxx`, `Q-xxx` and `T-xxx` all
live now — it is the layer the machine confers. `DESIGN.md` (formerly called
TDD in older projects) is the technical blueprint a human reads; it has no
grammar of its own beyond existing.

| Gate | Passes when |
|---|---|
| G0 | `.spec/SCOPE.md` says `Approved` |
| G1 | the PRD exists and its `feature:` line matches its directory |
| G2 | every decision records ≥2 alternatives and a chosen one |
| G3 | the DESIGN document exists |
| G4 | every story owns a criterion, every criterion has Given/When/Then, every criterion is covered by a task, every reference resolves, no blocking question is open |
| G5 | every criterion has a test that PASSED (a skip is never proof) |
| G6 | documents, code and constitution still agree |

**The exit code is the failing gate**: `0` clean, `1`–`7` for G0–G6. Never parse
output to find out where you are.

## Proof is written by `verify`, and by nothing else

`adp audit` reads documents and tests. It can see that a criterion has a test
annotated `@spec:AC-xxx`; it **cannot** see whether that test passed, because
nothing in a document can tell it that. Proof is written by `adp verify`, which
runs the project's test command and records which criteria actually passed.

```sh
adp verify        # runs the tests, writes .spec/verification/<feature>.json
adp audit --ci    # now G5 can be green
```

Before verify has run, every criterion reports `AC_WITHOUT_PROOF` — *has a test, but
no PASS proof*. That is not a bug to work around; it means nobody has run the
tests through the engine yet. A slow suite goes to `adp verify --background`,
followed by `adp verify --status`.

**The first verify will be refused, and that is correct.** The test command lives
in the project's config — a file in the repository — so running it executes code
that came from a repo. `adp trust` shows the human that exact command and asks.
**Never approve on their behalf, and never reach for `--yes` to get past it.**

## Rules

1. **Spec first.** `PRD.md` before `RFC.md` before `DESIGN.md` before
   `SPEC.md` before code. The gates enforce the order; do not route around them.
2. **Every acceptance criterion becomes a test whose TITLE carries
   `@spec:AC-xxx`.** No annotation, no criterion — as far as the machine is
   concerned.
3. **You never declare a criterion passed.** The test runner does. A skipped
   test is not proof.
4. **Never mark `[done]` without PASS proof.** `[in-test]` is the honest
   resting place — implemented, proof not yet granted. The audit checks, and
   `TASK_DONE_WITHOUT_PROOF` is an error.
5. **`adp verify` is what grants proof.** A test that exists is not a test that
   passed. Run it before claiming anything.
6. **Never approve the test command for the human.** `adp trust` is their
   decision; `--yes` is not yours to use. The same goes for `adp run`, which
   invokes an AI whose work gets committed, and for `--allow-edits`, which lets
   that AI write to the worktree without asking.
7. **A decision without at least two alternatives is not a decision.** Write
   down what you rejected and why.
8. **Assumptions and open questions are mandatory.** Filled a gap without
   confirming? That is an `ASM-xxx`. Could not decide? That is a `Q-xxx`, marked
   **blocking** if the path depends on it. If there are genuinely none, write
   "None." and be suspicious of yourself.
9. **The constitution rules.** `[MUST]` principles are executed, not read. Never
   fix the principle to make the check pass — fix the code.
10. **Never weaken, skip or delete a test to go green.** If the same finding
   survives **three attempts**, STOP and bring it to the human. Do not iterate
   forever.
11. **`adp verify` then `adp audit --ci` exits 0 before any hand-off.** Paste the output.
12. **Read paths from `adp.config.json`.** Never hard-code a test path or a
    verification directory.
13. **A command run more than once becomes a `Makefile` target**, mirrored in
    `README.md`. Deploy- or usage-relevant changes update `docs/DEPLOYMENT.md`
    and `docs/USAGE.md`.
14. **Keep the memory files current** — see Memory below.

## Delivery mode

Set `delivery` in `adp.config.json`. It decides how finished work reaches
main, and **nothing else in the loop depends on it**:

- **`local-only`** (default) — work lands in a branch. No remote, no network, no
  account. The full chain from specification to proof closes offline, on purpose.
- **`direct-PR`** — push and open a pull request; a human merges. One issue per
  task, `Closes #N` in the pull request body.

Rules 2, 3 and 4 do not change between modes. An external service's rate limit
must never be what stops you proving that work is done.

## Running several tasks at once

When `SPEC.md` holds several `[pending]` tasks, the engine can run them in
parallel, each in its own git worktree:

```sh
adp plan          # the lanes — show the human this before running anything
adp run           # asks for confirmation, then executes
adp rerun lane-02 # one lane again, leaving merged work untouched
```

`adp run` on its own cannot write anything: the workers are invoked in a mode
that must ask before editing, and a headless process has nobody to ask, so every
task finishes having changed nothing. Writing is granted by `--allow-edits`, and
that grant is the human's to make — like `adp trust` and `--yes`, it is not
yours to add on their behalf.

Tasks whose `Files:` lists overlap share a lane and run in order; disjoint
tasks run at the same time. **A task with no declared files is never
parallelised** — that is the file list earning its keep, not paperwork.

`Files:` is what a task WRITES. `Reads:` is what it only reads, and costs no
parallelism. `Depends on: T-001` is how a task says it runs after another one —
overlap cannot say it, because overlap is symmetric and "after" is not. A lane is
branched from HEAD, so a file you merely read is the version from before the run
until you declare the dependency; the plan tells you when that gap exists.

After every task commits, the pipeline runs the project's **approved** test
command inside that lane and stops the lane if it fails, so a broken test is
attributed to the task that broke it instead of surfacing at `adp verify` after
the merge. This spends the consent `adp trust` already holds and grants the agent
nothing new.

`adp monitor` serves a read-only page with the gates and per-feature progress.
`adp doctor` checks this copy of the tool against its own manifest — reach for it
when something behaves impossibly, before blaming the project.

## Roles

| Agent | Owns |
|---|---|
| business-analyst | stakeholder interviews; `SCOPE.md` |
| architect | architecture; `STACK.md`, `STRUCTURE.md`, `CONSTITUTION.md`, `RFC.md` |
| techlead | task assignment, review, final sign-off |
| designer | UX only; end-user experience |
| backend | backend implementation |
| frontend | framework ↔ API integration |
| security | all security; reviews code and principles |
| tester | tests everything before techlead sign-off |

Pipeline: business-analyst → architect → techlead → designer/backend/frontend
(security reviews) → tester → techlead.

Writing an `RFC.md`? It is flat and global, at `.spec/rfc/RFC-<NNN>-<slug>.md`
— `adp new --rfc <slug>` creates one — and the PRD that needs it links it by
adding the id to its own `rfcs:` line. One RFC can serve several PRDs, and one
PRD often needs several, one per one-way door. The `create-rfc` skill produces
the decision-record shape — options with pros and cons, decision criteria with
weights, RACI, outcome. The engine reads that shape natively. Assumptions and
open questions belong in `SPEC.md`, not here: give each one an `ASM-xxx`/
`Q-xxx` code instead of a bare row number. Without codes an assumption cannot
be referenced, tracked or closed.

## Feature or issue

**Broken existing behaviour → ISSUE.** `fix(<module>): <desc>`. Body: current
behaviour with logs, expected behaviour, steps to reproduce.

**New capability → FEATURE.** `feat(<module>): <desc>`. Run `adp new <name>`
and write the three documents.

A one-line fix does not need a feature folder. A change that alters what the
system promises does, even when the diff is small — the promise is what the
documents track.

## Memory

`.spec/CHANGELOG.md` what changed · `.spec/BEST_PRACTICES.md` patterns that
worked more than once · `.spec/TROUBLESHOOTING.md` problems that actually
happened and what fixed them.

Every test failure, bug and incident lands in TROUBLESHOOTING. A pattern that
recurs across features also earns a line in BEST_PRACTICES. These files are how
the next session starts smarter than this one — an empty one after a hard week
means the week was wasted.

## YAGNI

Stop at the first that solves it: speculative → do not build · reuse an existing
helper · standard library or an existing dependency · a framework built-in ·
otherwise the smallest implementation.

No single-use abstractions, no configuration for constants, no scaffolding for a
future nobody has specified. Fix bugs at the root cause, not at the call site.
**Never** simplify boundary validation, data-loss prevention, or security.

## References

`.spec/SCOPE.md` context · `.spec/STACK.md` and `.spec/STRUCTURE.md` details ·
`.spec/CONSTITUTION.md` principles · `adp.config.json` configuration ·
`README.md` and `docs/` product documentation · `.claude/skills/<name>/SKILL.md`
the skills — note the **plural**: `.claude/skill/` is never read by the harness.
