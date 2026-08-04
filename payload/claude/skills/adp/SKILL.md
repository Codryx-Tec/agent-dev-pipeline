---
name: adp
description: Spec-anchored development driven by six mechanical gates. Guides a project through SCOPE → PRD (what, for whom, why) → RFC (which path, among the possible ones) → TDD (how, in detail) → code → test → audit, with traceability from user story to acceptance criterion to task to test, an executable constitution whose regexes actually run, and a verdict that is an exit code rather than a claim. Use when specifying a feature, deciding an architecture with alternatives recorded, breaking work into parallelizable tasks, proving an implementation against its specification, checking whether documentation has gone stale, or answering "is this done?". Triggers: "specify this feature", "new feature", "write the PRD", "write the RFC", "break this into tasks", "audit against the spec", "is this done", "what has no test", "which gate is red", "the docs are out of date".
license: MIT
metadata:
  version: 0.5.0
  engine: agent-dev-pipeline
---

# agent-dev-pipeline — the specification that stays true

Most spec-driven tooling is **spec-first**: the specification generates code, the
code evolves, and the specification becomes well-formatted fiction. This is
**spec-anchored**: the specification is audited mechanically against the code, all
the time. You do not claim the work is done. **The machine decides, and it says so
with an exit code.**

```
SCOPE ──▶ PRD ──▶ RFC ──▶ TDD ──▶ code ──▶ test ──▶ audit
  G0      G1      G2      G3               G4       G5
what we   what,   which   how,             is it    do they
agreed    whom,   path    in detail        proven   still agree
          why
```

## Talk to the human in their language, and in plain words

The files use short **traceability codes**, because that is what links the
documents to the tests mechanically. With the person, always use the full name;
the code goes in parentheses only when they need it.

| Code | What you call it |
|---|---|
| US-xxx | **user story** — who needs it, what, and why |
| AC-xxx | **acceptance criterion** — an observable result a test can check |
| T-xxx | **task** — one step of implementation |
| ASM-xxx | **assumption** — a gap you filled with a guess, not yet confirmed |
| Q-xxx | **open question** — a decision the product owner still owes |
| D-xxx | **decision** — a chosen path, with the alternatives recorded |
| P-xxx | **principle** — a non-negotiable constraint from the constitution |
| G0–G5 | **gate** — a mechanical checkpoint between phases |

Say "the acceptance criterion AC-003 (late delivery warning) still has no test",
never "AC-003 is missing its @spec tag". Never require the person to know the
alphabet soup in order to understand what you told them.

Answer in whatever language the person is writing to you in. Files stay in the
language the repository mandates — check `AGENTS.md`.

## The engine

```sh
npx @codryx/agent-dev-pipeline <command>
```

Run it from the **root of the user's project**. Below, `adp <command>` is
shorthand for that invocation — the person will usually have it aliased.

| Command | What it does |
|---|---|
| `status` | six lights, one line each — start here, every session |
| `audit [--ci] [--json]` | every gate, with the findings behind the first red one |
| `gates [--list]` | the gates and their state, without the findings |
| `prompt [<gate>]` | the paste-ready text for a red gate |
| `verify [--background]` | **run the tests and record what they prove** |
| `verify --status` | how a background verification is doing |
| `trust [--revoke]` | approve this project's test command for execution |
| `plan` | the execution lanes, without running anything |
| `run [--lane <id>]` | execute pending tasks in isolated git worktrees |
| `rerun <lane>` | re-run one lane, leaving merged work alone |
| `monitor [--port <n>]` | a read-only page showing gates and progress |
| `init` · `new <feature>` | scaffold a project · scaffold a feature |
| `doctor` | verify this copy of the tool against its manifest |

**The exit code is the failing gate.** `0` clean, `1`–`6` for G0–G5. You never
have to parse output to learn where you are.

**Graceful degradation.** If Node is not available, do the audit by hand — re-read
the documents against the finding catalogue below — and label the result, in
writing, as **`WEAK PROOF (manual audit)`**. Never present a manual reading as if
it were the mechanical gate.

## Proof comes from `verify`, and from nothing else

This is the part most agents get wrong, so it is stated on its own.

`audit` **reads** documents and tests. It can see that a criterion has a test
annotated `@spec:AC-xxx`. It cannot see whether that test passed — nothing in a
document can tell it that. Proof is written by **`adp verify`**, which runs the
project's test command, extracts the result of each test, matches titles to
criteria, and records what actually passed.

```sh
adp verify        # runs the tests, writes .spec/verification/<feature>.json
adp audit         # now G4 can be green
```

Until `verify` has run, every criterion reports `AC_WITHOUT_PROOF` — *has a test, but
no PASS proof*. That finding is not a bug and not something to work around: it
means nobody has run the tests through the engine yet.

**The first `verify` will be refused, and that is correct.** The test command
lives in the project's config, which is a file in the repository — running it is
executing code that came from a repo. The engine refuses until a human has read
that exact command and approved it:

```sh
adp trust         # shows the command, asks for confirmation
```

**Never approve on the person's behalf and never reach for `--yes` to get past
it.** Show them the command, explain that approving binds to that exact text, and
let them answer. If the command later changes, approval is void by design — say
so rather than re-approving.

If the suite takes minutes, use `adp verify --background` and follow it with
`adp verify --status`. The verdict is identical either way.

## Running work in the background

For a `TDD.md` with several pending tasks, the engine can run them in parallel,
each in its own git worktree:

```sh
adp plan          # shows the lanes — read this before running anything
adp run           # asks for confirmation, then executes
adp rerun lane-02 # one lane again, leaving merged work untouched
```

Tasks whose `Files:` lists overlap land in the same lane and run in order;
disjoint tasks run at the same time. A task that declares no files is never
parallelized — that is the file list earning its keep.

`Files:` is what a task WRITES. Use `Reads:` for a file it only reads, which costs
no parallelism, and `Depends on: T-001` to say it runs after another task. Ordering
cannot be inferred from file overlap, because overlap is symmetric and "after" is
not — and a lane is branched from HEAD, so a file you only read is the pre-run
version until you declare the dependency.

After each task commits, the pipeline runs the project's approved test command
inside that lane and stops the lane if it fails, so a broken test belongs to the
task that broke it. That uses the consent `adp trust` already recorded; it grants
the agent nothing. `--no-lane-tests` turns it off for a suite too slow to run
after every task.

`adp run` invokes an AI that writes code and whose work gets committed. Show the
person `adp plan` first and let them start it. It refuses on a dirty working
tree, outside a git repository, and without a terminal to confirm at.

## Two commands to offer, not to run unprompted

`adp monitor` serves a **read-only** page on loopback showing the six gates, the
findings behind the first red one, and each feature's progress. Offer it when the
person is trying to see where things stand across several features — it is easier
to read than repeated `status` calls. It has no write endpoints and cannot change
their project. It holds a terminal until stopped, so suggest it rather than
starting it in the middle of other work.

`adp doctor` checks that this copy of the tool matches the manifest shipped with
it. Reach for it when something behaves impossibly — a command that vanished, a
skill file that does not match its documentation — before assuming the person's
project is at fault.

## Non-negotiable rules

1. **Every acceptance criterion becomes a test whose title carries `@spec:AC-xxx`.**
   Without the annotation, the criterion does not exist for the machine.
2. **The test runner decides whether a criterion passed — never you.** You cannot
   declare victory. **A skipped test is not proof**, and the audit says so.
3. **`adp verify` is what grants proof.** A test that exists is not a test that
   passed. Run verify before you claim anything, and never mark a task
   `[done]` on a criterion the engine has not recorded as proven.
4. **Never approve the test command for the person.** `adp trust` shows them what
   will execute; that decision is theirs, and `--yes` is not yours to use.
5. **The feature closes when `adp audit --ci` exits 0.** Running it and pasting
   the output is the last step, always.
6. **Assumptions and open questions are mandatory.** Filled a gap without
   confirming? That is an assumption. Missing information? That is an open
   question. If there are truly none, write "None." and be suspicious of yourself.
7. **A decision without at least two alternatives is not a decision.** Write down
   what you rejected and why, or the RFC gate stays red.
8. **The constitution rules.** `[MUST]` principles are executed. Never fix the
   principle to make the check pass — fix the code.
9. **Never weaken, skip or delete a test to go green.** If the same finding
   survives **three attempts**, STOP and bring the findings to the person. Do not
   iterate forever and do not route around the gate.

## Working the flow

**Start every session by asking the machine where you are:** `adp status`. Six
lights come back. Work on the **first red one** — the ones after it are `blocked`,
not broken, and fixing them first is wasted effort.

**G0 — Scope.** `.spec/SCOPE.md` must say `Approved`. Not approved means the work
has not been agreed. Do not start; go get the agreement.

**G1 — PRD.** One `PRD.md` per feature in `.spec/features/<name>/`. Write the user
stories, and for each one the acceptance criteria in Given/When/Then. A criterion
must be observable — something a test asserts. "Must be fast" is not a criterion;
"responds in under 300ms" is.

**G2 — RFC.** For each real decision, record the alternatives considered, the one
you chose, why, and what it costs. Register every assumption and open question
with an honest status. If the person is present, ask now, with concrete options,
and record the answer. Mark a question **blocking** when the path genuinely cannot
be chosen without it.

**G3 — TDD.** Break the work into tasks. Every task declares `Refs:` (the stories
and criteria it serves) and `Files:` (the files it will WRITE, comma-separated),
and optionally `Reads:` (files it only reads) and `Depends on:` (tasks it runs after).
The file list is not paperwork: it is what lets the planner compute which tasks can
run at the same time. A task with no file list is never parallelized.

**Implementation.** One task, one atomic commit whose message names the task.
Update the status in `TDD.md` as you go: `[pending]` → `[in-progress]` →
`[in-test]` → `[done]`.

`[in-test]` is the honest resting place: implemented, proof not yet granted.
Moving to `[done]` without proof is `TASK_DONE_WITHOUT_PROOF`, an error, and
the audit will catch you. This is the rule the whole product rests on — you do not
get to declare a task done.

**G4 — proof.** Run `adp verify`. It executes the test command and records which
criteria actually passed. Skipped, pending and todo all count as **not proven**;
a skip tells you nothing. Only now can `[done]` be honest.

**G5 — the gate.** Run `adp audit --ci`, paste the output, translate it in one
sentence. If it did not exit 0, it is not done.

## Explain yourself as you go

After **every** action, say in plain words: what you did, the path of every file
you created or changed, and what comes next. The person should never have to ask
"where is the file?" or "what now?".

Mirror the tasks in whatever native task list your harness offers, and keep the
status current — that is how the person follows along without asking.

When you run an engine command, paste the raw output (that is the proof) **and**
summarize it in one to three sentences. Never hand over the raw output alone.

If the person clearly knows the flow — uses the codes, asks for commands directly —
drop the tutoring and get to the point. The explanation shortens; the rigour never
does.

## What the audit reports

Use the readable name when you talk. The code in parentheses is for pipelines.
It is English and it **never changes with the reader's language** — a pipeline
grepping for it must find the same string on every machine.

| Finding (code) | What it means | What to do |
|---|---|---|
| scope document missing (`SCOPE_MISSING`) | there is no `.spec/SCOPE.md` | run `adp init`, then fill it in |
| scope not approved (`SCOPE_NOT_APPROVED`) | work was not agreed | get the approval before coding |
| required scope field empty (`SCOPE_FIELD_EMPTY`) | the scope is a template, not an agreement | fill the field it names |
| PRD / RFC / TDD missing (`PRD_MISSING`, `RFC_MISSING`, `TDD_MISSING`) | a feature is missing one of its three documents | `adp new <feature>` creates all three |
| PRD has no user story (`SPEC_WITHOUT_US`) | a PRD with nothing in it | write the stories |
| user story without acceptance criterion (`US_WITHOUT_AC`) | a story nobody can check | write its criteria |
| incomplete acceptance criterion (`AC_INCOMPLETE`) | missing Given, When or Then | complete the clause it names |
| criterion outside any story (`AC_OUTSIDE_US`) | a criterion serving nothing | move it under its story |
| traceability code too short (`ID_TOO_SHORT`) | `AC-1` instead of `AC-001` | codes are zero-padded to three digits |
| duplicate traceability code (`ID_DUPLICATE`) | the same code defined twice | codes are unique across the WHOLE project |
| decision without alternatives (`DECISION_WITHOUT_ALTERNATIVE`) | a habit, not a decision | record what you rejected |
| decision without a chosen option (`DECISION_WITHOUT_CHOICE`) | alternatives listed, none picked | say which one, and why |
| required section missing (`SECTION_MISSING`) | no assumptions or no open-questions section | add it; "None." is a valid answer, silence is not |
| assumption or question without a code (`ASM_WITHOUT_CODE`) | written as prose, unreferenceable | code it `ASM-001` / `Q-001` |
| invalid status (`STATUS_INVALID`) | not `open` or `answered` | use the exact word — **and no markdown around it**, `**answered**` does not parse |
| blocking question still open (`Q_BLOCKING_OPEN`) | the path cannot be chosen yet | ask the person |
| open question (`Q_OPEN`) | a decision still owed | answer it, or accept a red `--ci` |
| acceptance criterion covered by no task (`AC_WITHOUT_TASK`) | a requirement nobody will build | add or extend a task |
| broken reference (`REF_BROKEN`) | a task cites something that does not exist | fix the reference |
| task without declared files (`TASK_WITHOUT_FILES`) | cannot be parallelized | declare the files it touches |
| task maps a file that does not exist (`FILE_MISSING`) | declared but unwritten | expected while pending; an error once `[done]` |
| invalid task status (`TASK_STATUS_INVALID`) | not one of the four words | `pending` · `in-progress` · `in-test` · `done` |
| acceptance criterion without a test (`AC_WITHOUT_TEST`) | a requirement with no proof | write the test with `@spec:AC-xxx` in its title |
| acceptance criterion without proof (`AC_WITHOUT_PROOF`) | the test exists but never passed, or was SKIPPED | run verify; a skip is never proof |
| proof is out of date (`PROOF_STALE`) | code moved after the last proof | `adp verify` again |
| weak proof (`PROOF_WEAK`) | proven only by the runner's global exit code | configure a per-test reporter — a green suite is not per-criterion proof |
| orphan test (`TEST_ORPHAN`) | a test points at a criterion that is gone | the spec moved and the test did not — reconcile them |
| task completed without proof (`TASK_DONE_WITHOUT_PROOF`) | `[done]` with unproven criteria | verify, or reopen the task |
| open assumption (`ASM_OPEN`) | a guess in a feature declared done | confirm or invalidate it with the person |
| principle without executable verification (`PRINCIPLE_WITHOUT_VERIFICATION`) | a MUST nothing checks | give it a verification, or lower its level honestly |
| invalid principle level (`LEVEL_INVALID`) | not MUST, SHOULD or MAY | use one of the three |
| principle violated (`PRINCIPLE_VIOLATED`) | the constitution was broken | fix the code, never the principle |
| verification matches no file (`GLOB_WITHOUT_FILES`) | the check is inert | fix the glob — a check that cannot fail looks like one that passed |
| malformed verification (`VERIFICATION_MALFORMED`) | invalid regex, or one that timed out | simplify the pattern |
| source file mapped by no task (`FILE_ORPHAN`) | code nothing asked for | map it to a task, or question why it exists |
| feature name diverges from its directory (`FEATURE_MISMATCH`) | the header and the folder disagree | make them match |
| project could not be read (`PROJECT_INVALID`) | a document failed to parse | the message names the file |
| duplicate traceability code (`ID_DUPLICATE`) | the same code defined twice | codes are unique across the whole project |

## Questions the engine answers for you

"Which requirement has no test?" → `adp audit` → `AC_WITHOUT_TEST`.
"Which test maps to no requirement?" → `TEST_ORPHAN`.
"Which code serves no requirement?" → `FILE_ORPHAN`.
"Which principle is decoration?" → `PRINCIPLE_WITHOUT_VERIFICATION`.
"Which criteria are actually proven?" → `adp verify` → the proof record.
"Which proof went stale?" → `PROOF_STALE`.
"What can run in parallel?" → `adp plan`.
"Where are we?" → `adp status`.
"What do I send back to fix this?" → `adp prompt`.

## The golden rule

If you are about to say "done", run `adp verify` and then `adp audit --ci`, and
paste the output. If it did not exit 0, it is not done.

Both, in that order. `audit` alone can only tell you a test exists; `verify` is
what makes it a test that passed. Here, "done" is something a machine verifies —
not a sentence you wrote.
