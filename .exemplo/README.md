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
# remove one alternative from D-001 in RFC.md           -> G2 goes red: DECISION_WITHOUT_ALTERNATIVE
# add a criterion to SPEC.md with no task               -> G4 warns: AC_WITHOUT_TASK
```

Each time, `node ../bin/adp.js prompt` gives you the exact text to paste
back to an AI to fix it.

## What is in here

```
.spec/SCOPE.md            approved — this is what opens G0
.spec/CONSTITUTION.md     four principles; P-004 is executed against a test tag
.spec/features/class-enrolment/
    PRD.md                prose only — what, for whom, why
    RFC.md                2 decisions with alternatives     (owns D-xxx)
    DESIGN.md             the technical shape, in prose
    SPEC.md               2 stories, 3 criteria, 2 assumptions, 1 question,
                           3 tasks — the layer the machine confers
                           (owns US-xxx, AC-xxx, ASM-xxx, Q-xxx, T-xxx)
src/enrolment.js          every rule, in one function
test/enrolment.test.js    one test per criterion, annotated in the TITLE
adp.config.json       where the tests are and how to run them
AGENTS.md                 the contract the AI follows here
```

## The feature, in one paragraph

A visitor enrols in a class. A full class refuses. A minor cannot enrol without a
guardian's e-mail — and that check runs *before* the seat check, so a blocked
minor never consumes a seat. Three rules, three acceptance criteria, three tasks,
five tests.

## Four things worth noticing

**The traceability is a chain, and every link is checked.** `US-001` owns
`AC-001`; `T-001` declares `Refs: US-001, AC-001`; the test title carries
`@spec:AC-001`. Cut any link and a gate turns red naming the one you cut.

**The RFC records what was rejected.** `D-001` weighs three ways to decrement the
seat count and says why two lost, and what the winner costs. That is the
difference between a decision and a habit — and the gate counts the alternatives.

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
