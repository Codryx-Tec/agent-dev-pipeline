# .exemplo — a finished project you can run

This folder is a **complete, working agent-dev-pipeline project**, kept inside the tool
so that "how does this work?" has an answer you can execute instead of read.

Run it:

```sh
cd .exemplo
node ../bin/adp.js status        # seven lights; G5 red — nothing is proven yet
node ../bin/adp.js trust         # read the test command, then approve it
node ../bin/adp.js verify        # runs the tests, records what actually passed
node ../bin/adp.js audit --ci    # exit 0 — clean under the strict posture
```

**It arrives unproven on purpose.** No proof record ships with this example,
because proof is not a file somebody can hand you — it is the result of running
the tests on *your* machine. Shipping one would be handing over a claim, which is
the one thing this tool exists not to do.

The refusal at `verify` is also on purpose: the test command lives in this
repository, so running it means executing code that came from a repo. `trust`
shows you the exact command and asks. Approving binds to that text — change the
command and it asks again.

Then break it, which is the part worth doing:

```sh
rm .spec/verification/class-enrolment.json
node ../bin/adp.js audit --ci    # G5 red again, and all three tasks now report
                                 # TASK_DONE_WITHOUT_PROOF
```

Then break it on purpose — that is the part worth doing:

```sh
# delete the @spec:AC-002 annotation from a test title  -> G5 goes red: AC_WITHOUT_TEST
# change a task's status to [done]                 -> G6 goes red: TASK_DONE_WITHOUT_PROOF
# remove one alternative from D-001 in .spec/rfc/RFC-001-class-enrolment.md
#                                                        -> G2 goes red: DECISION_WITHOUT_ALTERNATIVE
# add a criterion to SPEC.md with no task               -> G4 warns: AC_WITHOUT_TASK
# remove the "signals:" line from PRD.md                -> G2 reads n/a; the RFC is no longer required
# remove the "class-enrolment" line from SCOPE.md's MVP  -> G1 goes red: PRD_UNPLACED
# add "- see AC-099" to BACKLOG.md                       -> G1 warns: BACKLOG_ITEM_WITH_CODE
# write "use PostgreSQL with a row lock" in PRD.md       -> G1 goes red: PRD_WITH_SOLUTION
```

Each time, `node ../bin/adp.js prompt` gives you the exact text to paste
back to an AI to fix it.

## What is in here

```
.spec/SCOPE.md            approved — this is what opens G0; MVP checklist
                           names "class-enrolment" by slug
.spec/BACKLOG.md          what SCOPE.md's own "Out of scope" section named
                           (payment, cancellation, a waiting list) — plain
                           prose, no tracking code
.spec/CONSTITUTION.md     four principles; P-004 is executed against a test tag
.spec/ESTIMATE.md         a Function Point estimate, cold-start, labeled as
                           such — see "Estimate and close" below
.spec/metrics/            profile.json · count-confirmed.json · estimate.json ·
                           closures.jsonl · hours-history.jsonl · the seeded
                           hours-per-fp.json/fp-weights.json tables
.spec/features/class-enrolment/
    PRD.md                prose only — what, for whom, why; declares
                           "signals: multiple-teams", which is what puts
                           this feature at rfc-first ceremony and keeps
                           G2/G3 due (see "break it" above)
    DESIGN.md              the technical shape, in prose
    SPEC.md                2 stories, 3 criteria, 2 assumptions, 1 question,
                           3 tasks — the layer the machine confers
                           (owns US-xxx, AC-xxx, ASM-xxx, Q-xxx, T-xxx)
.spec/rfc/RFC-001-class-enrolment.md
                           2 decisions with alternatives, flat and global
                           (owns D-xxx) — not nested under the feature
src/enrolment.js          every rule, in one function
test/enrolment.test.js    one test per criterion, annotated in the TITLE
adp.config.json           where the tests are and how to run them; also
                           points the shared hours-history at a path
                           inside this folder, so running `adp close`
                           here never touches your own machine's real
                           cross-project history
AGENTS.md                 the contract the AI follows here
```

## Estimate and close — the loop, not just the number

```sh
node ../bin/adp.js estimate --review    # the confirmed function count, already recorded
cat .spec/ESTIMATE.md                   # 14 PF x the business-crud/delivered cold-start row
```

`ESTIMATE.md` is dated before this feature shipped: 14 PF, sourced `cold-start`
— a market-anchored number with zero project history behind it, and the tool
says so out loud rather than letting it look like more than it is. `adp close
--hours 180` was run once the feature actually shipped, seven days later,
recording a **+7.1%** deviation and a one-line note about why. That closure
did two things a single number never could: it wrote a local audit trail
(`.spec/metrics/closures.jsonl`) and, since it also fed the shared,
identity-free `hours-history.jsonl` this config points inside the example
folder, it **recalibrated** the `business-crud/delivered` row in
`hours-per-fp.json` — `source` there now reads `measured`, not `cold-start`.
Run `node ../bin/adp.js estimate --pf 14` again and watch it use that
recalibrated row instead of the market seed.

## The feature, in one paragraph

A visitor enrols in a class. A full class refuses. A minor cannot enrol without a
guardian's e-mail — and that check runs *before* the seat check, so a blocked
minor never consumes a seat. Three rules, three acceptance criteria, three tasks,
five tests.

## Four things worth noticing

**The traceability is a chain, and every link is checked.** `US-001` owns
`AC-001`; `T-001` declares `Refs: US-001, AC-001`; the test title carries
`@spec:AC-001`. Cut any link and a gate turns red naming the one you cut.

**The RFC records what was rejected — including doing nothing.** `D-001`
weighs four ways to decrement the seat count, one of them "do nothing," and
says why three lost and what the winner costs. That is the difference
between a decision and a habit — and the gate counts the alternatives.

**The tasks all touch the same file, so the planner will put them in one lane.**
That is the correct answer, not a limitation. The `Files:` list exists so the
machine can tell real serialization from accidental.

**The tasks say `[done]`, and that word is worth nothing on its own.** They
only survive an audit once `verify` has run and recorded that each criterion's
test passed. Delete the proof record and all three become
`TASK_DONE_WITHOUT_PROOF` instantly — the status word stays exactly where it
was, and the engine stops believing it. That refusal is the entire product.

## Two postures, one engine

`AC_WITHOUT_PROOF` is a **warning** while you work and an **error** under
`audit --ci` — quiet enough to work under, strict enough to be a gate. This
example is clean under both, which is the bar a real project should hold itself
to before calling a feature done.

The one remaining warning is honest: `P-001` declares only a manual gate, so
nothing about it is machine-checked. The engine says so out loud rather than
letting a principle look verified when it is not.
