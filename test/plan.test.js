// Background execution: planning, isolation, telemetry and re-runs.
//
// The lane tests use a real git repository and real worktrees, with the agent
// invocation replaced by a fake. That split is on purpose: the parts worth
// testing are the worktree lifecycle, the one-commit rule and the refusal to
// resolve conflicts — none of which need a model call to be wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { buildPlan, renderPlan } from '../src/core/plan.js';
import { runLane, mergeLane, git, filesInCommit, linkIntoWorktree } from '../src/core/executor.js';
import { makeLaneTestRunner } from '../src/core/verify.js';
import { grantTrust, TRUST_ENV } from '../src/core/trust.js';
import { rerunLane } from '../src/core/rerun.js';
import { append, read, progress, prune, streamPath, ledgerPath } from '../src/core/ledger.js';
import { buildPrompt } from '../src/core/prompts.js';

// ------------------------------------------------------------------ helpers

function fakeProject(tasks) {
  return {
    rootDir: '/nowhere',
    features: [{ name: 'demo', spec: { tasks } }],
  };
}

function task(id, files, status = 'pending', { reads = [], dependsOn = [] } = {}) {
  return { id, title: `task ${id}`, status, files, refs: [], reads, dependsOn };
}

/** The lane a task ended up in, by task id. */
function laneWith(plan, taskId) {
  return plan.lanes.find((l) => l.tasks.some((t) => t.id === taskId));
}

function gitRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-lane-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(root, 'README.md'), '# base\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base']);
  return root;
}

function state() {
  return { stateDir: mkdtempSync(path.join(tmpdir(), 'adp-state-')) };
}

// ------------------------------------------------------------------ planner

test('tasks sharing a file land in one lane, disjoint tasks in another @spec:AC-019', () => {
  // Exactly the shape AC-019 describes: three pending tasks, two of which
  // overlap. The plan must contain two lanes, not three and not one.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js']),
      task('T-002', ['src/b.js']),
      task('T-003', ['src/a.js', 'src/c.js']),
    ]),
    { parallel: { maxParallel: 3 } },
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 2);

  const withA = plan.lanes.find((l) => l.tasks.some((t) => t.id === 'T-001'));
  assert.deepEqual(
    withA.tasks.map((t) => t.id),
    ['T-001', 'T-003'],
    'overlapping tasks share a lane, in document order'
  );

  // Each lane owns a distinct branch and worktree, or isolation is a fiction.
  const branches = plan.lanes.map((l) => l.branch);
  const worktrees = plan.lanes.map((l) => l.worktree);
  assert.equal(new Set(branches).size, 2);
  assert.equal(new Set(worktrees).size, 2);
});

test('overlap is transitive @spec:AC-019', () => {
  // A shares with B, B shares with C, A and C share nothing directly — all three
  // must still run in one lane. Getting this wrong produces a plan that looks
  // right and corrupts files.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js']),
      task('T-002', ['src/a.js', 'src/b.js']),
      task('T-003', ['src/b.js']),
    ]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 1);
  assert.deepEqual(plan.lanes[0].tasks.map((t) => t.id), ['T-001', 'T-002', 'T-003']);
});

test('a task with no declared files is never parallelised @spec:AC-012', () => {
  const plan = buildPlan(
    fakeProject([task('T-001', ['src/a.js']), task('T-002', [])]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 1);
  assert.equal(plan.sequential.length, 1);
  assert.equal(plan.sequential[0].id, 'T-002');
  assert.match(plan.sequential[0].reason, /unknown file footprint/);
});

test('only pending tasks are planned @spec:AC-019', () => {
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js'], 'done'),
      task('T-002', ['src/b.js'], 'in-test'),
      task('T-003', ['src/c.js'], 'pending'),
    ]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 1);
  assert.equal(plan.lanes[0].tasks[0].id, 'T-003');
  assert.equal(plan.skipped.length, 2);
});

test('waves bound concurrency without changing the lanes @spec:AC-019', () => {
  const plan = buildPlan(
    fakeProject([1, 2, 3, 4, 5].map((n) => task(`T-00${n}`, [`src/${n}.js`]))),
    { parallel: { maxParallel: 2 } },
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 5);
  assert.deepEqual(plan.waves.map((w) => w.length), [2, 2, 1]);
});

test('the same document always plans the same way @spec:AC-019', () => {
  const tasks = [task('T-001', ['a']), task('T-002', ['b']), task('T-003', ['a'])];
  const a = JSON.stringify(buildPlan(fakeProject(tasks), {}, { runId: 'r' }));
  const b = JSON.stringify(buildPlan(fakeProject(tasks), {}, { runId: 'r' }));
  assert.equal(a, b, 'planning must be deterministic or a re-run is a different execution');
  assert.match(renderPlan(JSON.parse(a)), /lane-01/);
});

// --------------------------------------------------------- ordering (Q-010)

test('a task declares what it runs after, and keeps its own lane @spec:AC-044', () => {
  // The failure this replaces: before `Depends on:` the only way to run last was to
  // declare somebody else's files, which put you in their lane. Ordering and
  // parallelism were the same mechanism, so buying one spent the other.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js']),
      task('T-002', ['src/b.js']),
      task('T-003', ['src/c.js'], 'pending', { dependsOn: ['T-001'] }),
    ]),
    {},
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 3, 'declaring an order must not collapse lanes');

  const first = laneWith(plan, 'T-001');
  const dependent = laneWith(plan, 'T-003');
  assert.deepEqual(dependent.after, [first.id]);
  assert.ok(dependent.wave > first.wave, 'a dependent lane runs in a later stage');

  // And the stages are what the executor iterates, so the order has to be there.
  const stageOf = (id) => plan.waves.findIndex((w) => w.includes(id));
  assert.ok(stageOf(dependent.id) > stageOf(first.id));
  assert.equal(stageOf(laneWith(plan, 'T-002').id), stageOf(first.id), 'independent lanes stay together');
});

test('a dependency orders tasks inside a lane too @spec:AC-044', () => {
  // Same file, so one lane — but the declared order still has to beat document
  // order, which is the only thing deciding it otherwise.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js'], 'pending', { dependsOn: ['T-002'] }),
      task('T-002', ['src/a.js']),
    ]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 1);
  assert.deepEqual(plan.lanes[0].tasks.map((t) => t.id), ['T-002', 'T-001']);
});

test('lanes that depend on each other are merged, not ordered @spec:AC-044', () => {
  // No single task is circular: T-001 → T-002 and T-004 → T-003. But T-001 and
  // T-003 share a file, and so do T-002 and T-004, so the two lanes each need to
  // run after the other. There is no order, and pretending otherwise would run
  // one of them against a tree missing the work it asked to follow.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js'], 'pending', { dependsOn: ['T-002'] }),
      task('T-002', ['src/b.js']),
      task('T-003', ['src/a.js']),
      task('T-004', ['src/b.js'], 'pending', { dependsOn: ['T-003'] }),
    ]),
    {},
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 1, 'mutually dependent lanes cannot run in parallel');
  assert.equal(plan.sequential.length, 0, 'and this is not a contradiction, so nothing is refused');

  const order = plan.lanes[0].tasks.map((t) => t.id);
  assert.ok(order.indexOf('T-002') < order.indexOf('T-001'));
  assert.ok(order.indexOf('T-003') < order.indexOf('T-004'));
});

test('a file a task only reads does not collapse lanes @spec:AC-045', () => {
  // Every lane has its own worktree, so two readers of a file never collide.
  // Charging a reader the parallelism of everyone who writes it was the whole
  // cost of having one declaration for two different claims.
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js']),
      task('T-002', ['src/b.js'], 'pending', { reads: ['src/a.js'] }),
    ]),
    {},
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 2);
  assert.deepEqual(plan.lanes.map((l) => l.wave), [0, 0], 'reading alone implies no order');

  // What reading does NOT get you is the writer's version, because the lane is
  // branched from HEAD. Reported rather than refused: reading the pre-run file
  // is legitimate, and the two cases look identical in the document.
  assert.equal(plan.warnings.length, 1);
  assert.equal(plan.warnings[0].task, 'T-002');
  assert.equal(plan.warnings[0].writtenBy, 'T-001');
  assert.match(plan.warnings[0].message, /before the run/);
  assert.match(renderPlan(plan), /will not see this run's changes/);
});

test('declaring the order silences the stale-read warning @spec:AC-045', () => {
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js']),
      task('T-002', ['src/b.js'], 'pending', { reads: ['src/a.js'], dependsOn: ['T-001'] }),
    ]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 2);
  assert.deepEqual(plan.warnings, [], 'the reader now runs after the writer, so it sees the change');
  assert.ok(laneWith(plan, 'T-002').wave > laneWith(plan, 'T-001').wave);
});

test('a dependency cycle is reported, never broken arbitrarily @spec:AC-046', () => {
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js'], 'pending', { dependsOn: ['T-002'] }),
      task('T-002', ['src/b.js'], 'pending', { dependsOn: ['T-001'] }),
    ]),
    {},
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 0, 'picking a member to go first invents a decision nobody made');
  assert.deepEqual(plan.sequential.map((t) => t.id).sort(), ['T-001', 'T-002']);
  for (const t of plan.sequential) assert.match(t.reason, /circular dependency: T-001 → T-002/);
});

test('a task depending on itself is a cycle of one @spec:AC-046', () => {
  const plan = buildPlan(
    fakeProject([task('T-001', ['src/a.js'], 'pending', { dependsOn: ['T-001'] })]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 0);
  assert.match(plan.sequential[0].reason, /circular dependency/);
});

test('a dependency on an id no task declares is refused @spec:AC-046', () => {
  const plan = buildPlan(
    fakeProject([task('T-001', ['src/a.js'], 'pending', { dependsOn: ['T-999'] })]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 0);
  assert.match(plan.sequential[0].reason, /T-999, which no task declares/);
});

test('waiting on a task that will not run keeps you out of the plan too @spec:AC-046', () => {
  // T-001 has no file footprint, so it is never placed in a lane — and the
  // sequential remainder is printed, not executed. Anything waiting on it is
  // waiting for something that will not happen.
  const plan = buildPlan(
    fakeProject([
      task('T-001', []),
      task('T-002', ['src/b.js'], 'pending', { dependsOn: ['T-001'] }),
      task('T-003', ['src/c.js'], 'pending', { dependsOn: ['T-002'] }),
    ]),
    {},
    { runId: 'r1' }
  );

  assert.equal(plan.lanes.length, 0);
  assert.match(plan.sequential.find((t) => t.id === 'T-002').reason, /not in this plan/);
  // Propagated: the dependent of a dependent is in exactly the same position.
  assert.match(plan.sequential.find((t) => t.id === 'T-003').reason, /not in this plan/);
});

test('a dependency already concluded is satisfied, not waited for @spec:AC-044', () => {
  const plan = buildPlan(
    fakeProject([
      task('T-001', ['src/a.js'], 'done'),
      task('T-002', ['src/b.js'], 'pending', { dependsOn: ['T-001'] }),
    ]),
    {},
    { runId: 'r1' }
  );
  assert.equal(plan.lanes.length, 1);
  assert.equal(plan.lanes[0].wave, 0, 'there is nothing in this plan to wait for');
  assert.deepEqual(plan.lanes[0].after, []);
});

// ------------------------------------------------------------------ executor

test('each lane runs in its own worktree, one commit per task @spec:AC-020', () => {
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };
  const lane = {
    id: 'lane-01',
    branch: 'adp/r1/lane-01',
    worktree: '.adp-worktrees/r1/lane-01',
    tasks: [
      { id: 'T-001', title: 'first', files: ['one.txt'], refs: [] },
      { id: 'T-002', title: 'second', files: ['two.txt'], refs: [] },
    ],
    files: ['one.txt', 'two.txt'],
  };

  const headBefore = git(root, ['rev-parse', 'HEAD']).stdout;

  const result = runLane(project, cfg, lane, ({ task: t, cwd }) => {
    writeFileSync(path.join(cwd, t.files[0]), `written by ${t.id}\n`);
    return { ok: true, summary: `${t.id} done`, output: 'raw worker chatter\n' };
  }, { runId: 'r1' });

  assert.equal(result.state, 'done');
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((r) => r.ok));

  // The captain's tree is untouched while the lane runs.
  assert.equal(git(root, ['rev-parse', 'HEAD']).stdout, headBefore);
  assert.ok(!existsSync(path.join(root, 'one.txt')), 'lane work must not appear in the main tree');

  // One commit per task, each naming its task code.
  const log = git(root, ['log', '--format=%s', lane.branch]).stdout.split('\n');
  assert.equal(log[0], 'T-002: second');
  assert.equal(log[1], 'T-001: first');
  assert.deepEqual(filesInCommit(result.worktree, 'HEAD'), ['two.txt']);
});

test('a worker that changes nothing fails the lane rather than committing @spec:AC-020', () => {
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };
  const lane = {
    id: 'lane-01', branch: 'adp/r2/lane-01', worktree: '.adp-worktrees/r2/lane-01',
    tasks: [{ id: 'T-001', title: 'nothing', files: ['x.txt'], refs: [] }], files: ['x.txt'],
  };
  const result = runLane(project, cfg, lane, () => ({ ok: true, summary: 'claimed done' }), { runId: 'r2' });
  assert.equal(result.state, 'failed');
  assert.match(result.results[0].summary, /no changes/);
});

test('a file touched but not declared is reported, not hidden @spec:AC-020', () => {
  // ASM-005 says declarations are trusted; this is the after-the-fact check that
  // keeps that from being blind faith.
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };
  const lane = {
    id: 'lane-01', branch: 'adp/r3/lane-01', worktree: '.adp-worktrees/r3/lane-01',
    tasks: [{ id: 'T-001', title: 'sneaky', files: ['declared.txt'], refs: [] }],
    files: ['declared.txt'],
  };

  const result = runLane(project, cfg, lane, ({ cwd }) => {
    writeFileSync(path.join(cwd, 'declared.txt'), 'ok\n');
    writeFileSync(path.join(cwd, 'undeclared.txt'), 'surprise\n');
    return { ok: true, summary: 'done' };
  }, { runId: 'r3' });

  assert.deepEqual(result.results[0].undeclared, ['undeclared.txt']);
  const { events } = read(cfg, { runId: 'r3' });
  assert.ok(events.some((e) => e.type === 'undeclared-files'), 'it must reach the ledger');
});

test('a conflicting lane is not merged and not resolved @spec:AC-020', () => {
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };
  const lane = {
    id: 'lane-01', branch: 'adp/r4/lane-01', worktree: '.adp-worktrees/r4/lane-01',
    tasks: [{ id: 'T-001', title: 'edit', files: ['README.md'], refs: [] }], files: ['README.md'],
  };

  runLane(project, cfg, lane, ({ cwd }) => {
    writeFileSync(path.join(cwd, 'README.md'), '# from the lane\n');
    return { ok: true, summary: 'edited' };
  }, { runId: 'r4' });

  // The main tree moves in a way that conflicts.
  writeFileSync(path.join(root, 'README.md'), '# from the captain\n');
  git(root, ['commit', '-q', '-am', 'captain edit']);

  const merge = mergeLane(project, cfg, lane, { runId: 'r4' });
  assert.equal(merge.ok, false);
  assert.equal(merge.conflict, true);
  assert.match(merge.message, /does not resolve conflicts/);
  // The branch must survive so a human can deal with it.
  assert.equal(git(root, ['rev-parse', '--verify', lane.branch], { allowFail: true }).status, 0);
  // And the main tree must be left clean, not mid-merge.
  assert.equal(git(root, ['status', '--porcelain']).stdout, '');
});

// -------------------------------------------------------- lane tests (Q-009)

// Green when the worker left a `pass.txt` behind, red otherwise. `node` rather
// than a shell builtin because node is the one binary this project can assume.
const MARKER_TEST = 'node -e "process.exit(require(\'fs\').existsSync(\'pass.txt\') ? 0 : 1)"';

function laneFor(runId, taskId, files) {
  return {
    id: 'lane-01',
    branch: `adp/${runId}/lane-01`,
    worktree: path.join('worktrees', runId, 'lane-01'),
    tasks: [{ id: taskId, title: 'work', files, refs: [] }],
    files,
  };
}

test('the approved tests run in the lane, and a failure names the task @spec:AC-047', () => {
  const root = gitRepo();
  const cfg = { ...state(), testCommand: MARKER_TEST };
  const project = { rootDir: root, features: [] };
  grantTrust(root, cfg.testCommand, cfg);

  const { runner, command } = makeLaneTestRunner(project, cfg);
  assert.equal(command, MARKER_TEST);

  const lane = laneFor('rt1', 'T-001', ['work.txt']);
  const result = runLane(project, cfg, lane, ({ cwd }) => {
    // Work, but no `pass.txt` — exactly the worker that writes a test it cannot
    // run and is wrong about it.
    writeFileSync(path.join(cwd, 'work.txt'), 'half done\n');
    return { ok: true, summary: 'wrote the thing' };
  }, { runId: 'rt1', runTests: runner });

  assert.equal(result.state, 'failed');
  assert.equal(result.results[0].ok, false);
  assert.match(result.results[0].summary, /tests FAILED in the lane/);
  assert.equal(result.results[0].tests.ok, false);
  // The worker's own account is kept rather than overwritten: it said it
  // succeeded, and that it was wrong is the finding.
  assert.equal(result.results[0].workerSummary, 'wrote the thing');

  // The work is committed BEFORE the tests run, on purpose. A failing task has
  // still produced something, and its branch is the only place that exists.
  assert.ok(result.results[0].commit, 'the commit must survive the failure');
  assert.equal(git(root, ['log', '--format=%s', lane.branch]).stdout.split('\n')[0], 'T-001: work');

  const { events } = read(cfg, { runId: 'rt1' });
  assert.ok(events.some((e) => e.type === 'task-tests-failed'), 'the failure must reach the ledger');
  // Attribution is the whole point: the event carries the task it belongs to.
  assert.equal(events.find((e) => e.type === 'task-tests-failed').taskId, 'T-001');
});

test('a lane whose tests pass finishes normally @spec:AC-047', () => {
  const root = gitRepo();
  const cfg = { ...state(), testCommand: MARKER_TEST };
  const project = { rootDir: root, features: [] };
  grantTrust(root, cfg.testCommand, cfg);

  const result = runLane(project, cfg, laneFor('rt2', 'T-001', ['pass.txt']), ({ cwd }) => {
    writeFileSync(path.join(cwd, 'pass.txt'), 'green\n');
    return { ok: true, summary: 'done' };
  }, { runId: 'rt2', runTests: makeLaneTestRunner(project, cfg).runner });

  assert.equal(result.state, 'done');
  assert.equal(result.results[0].tests.ok, true);
  assert.ok(read(cfg, { runId: 'rt2' }).events.some((e) => e.type === 'task-tests-passed'));
});

test('lane tests need no grant beyond the one already given @spec:AC-048 @spec:AC-121', () => {
  const root = gitRepo();
  const project = { rootDir: root, features: [] };
  // Isolated from the ambient environment on purpose: this whole test's point
  // is "no grant recorded means refused," and ADP_TRUST_TEST_COMMAND=1 — the
  // CI escape hatch — is exactly the kind of ambient state that would make
  // that false. `adp verify` (M7's self-audit) sets that variable for its own
  // outer approval and it leaks to every child process, this test's own
  // included, so relying on `process.env` here made the test's correctness
  // depend on who was invoking it rather than on what it declares.
  const noEscape = { env: { ...process.env, [TRUST_ENV]: undefined } };

  // Nothing to run.
  const none = makeLaneTestRunner(project, state());
  assert.equal(none.runner, null);
  assert.match(none.reason, /no testCommand/);

  // A command, but nobody approved it. The lane worktree is still this machine,
  // and a command out of the repository is still a stranger's code.
  const cfg = { ...state(), testCommand: MARKER_TEST };
  const untrusted = makeLaneTestRunner(project, cfg, noEscape);
  assert.equal(untrusted.runner, null);
  assert.match(untrusted.reason, /adp trust/);

  // Approval of a DIFFERENT command does not carry over.
  grantTrust(root, 'npm run something-else', cfg);
  assert.match(makeLaneTestRunner(project, cfg, noEscape).reason, /changed since it was approved/);

  // And a run with no test runner is still a run: the check is optional, so its
  // absence costs the run its attribution, not its result.
  const result = runLane(project, cfg, laneFor('rt3', 'T-001', ['work.txt']), ({ cwd }) => {
    writeFileSync(path.join(cwd, 'work.txt'), 'x\n');
    return { ok: true, summary: 'done' };
  }, { runId: 'rt3', runTests: null });
  assert.equal(result.state, 'done');
  assert.equal(result.results[0].tests, null);
});

test('a fresh worktree gets the ignored artefacts the tests need @spec:AC-047', () => {
  // A worktree holds what git tracks, and installed dependencies are the one
  // thing every project deliberately does not track — so `npm test` in a new
  // lane would fail on a missing module rather than on the code.
  const root = gitRepo();
  const cfg = { ...state(), parallel: { linkIntoWorktree: ['node_modules', 'vendor'] } };
  writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
  mkdirSync(path.join(root, 'node_modules'));
  writeFileSync(path.join(root, 'node_modules', 'marker'), 'installed\n');
  mkdirSync(path.join(root, 'vendor'));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'ignore deps']);

  const wt = mkdtempSync(path.join(tmpdir(), 'adp-wt-'));
  const { linked, skipped } = linkIntoWorktree(root, wt, cfg);

  assert.deepEqual(linked, ['node_modules']);
  assert.ok(existsSync(path.join(wt, 'node_modules', 'marker')), 'the tests must be able to resolve it');

  // `vendor` is tracked, so linking it would sweep it into the lane's `git add
  // -A` and commit it — a worse outcome than the tests not running.
  assert.deepEqual(skipped.map((s) => s.name), ['vendor']);
  assert.match(skipped[0].reason, /not git-ignored/);
});

// ------------------------------------------------------------------ re-run

test('re-running one lane leaves merged work alone @spec:AC-022', () => {
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };

  const good = {
    id: 'lane-01', branch: 'adp/r5/lane-01', worktree: '.adp-worktrees/r5/lane-01',
    tasks: [{ id: 'T-001', title: 'good', files: ['good.txt'], refs: [] }], files: ['good.txt'],
  };
  const bad = {
    id: 'lane-02', branch: 'adp/r5/lane-02', worktree: '.adp-worktrees/r5/lane-02',
    tasks: [{ id: 'T-002', title: 'bad', files: ['bad.txt'], refs: [] }], files: ['bad.txt'],
  };
  const plan = { lanes: [good, bad] };

  // Lane 1 succeeds and merges.
  runLane(project, cfg, good, ({ cwd, task: t }) => {
    writeFileSync(path.join(cwd, t.files[0]), 'good\n');
    return { ok: true, summary: 'ok' };
  }, { runId: 'r5' });
  assert.equal(mergeLane(project, cfg, good, { runId: 'r5' }).ok, true);
  assert.ok(existsSync(path.join(root, 'good.txt')), 'merged work is in the main tree');

  // Lane 2 fails.
  const first = runLane(project, cfg, bad, () => ({ ok: false, summary: 'boom' }), { runId: 'r5' });
  assert.equal(first.state, 'failed');

  // Re-run only lane 2. The merged work must survive, and the lane must be
  // rebuilt on the CURRENT head rather than on where the run started.
  const again = rerunLane(project, cfg, plan, 'lane-02', ({ cwd, task: t }) => {
    writeFileSync(path.join(cwd, t.files[0]), 'fixed\n');
    return { ok: true, summary: 'fixed' };
  }, { runId: 'r5' });

  assert.equal(again.state, 'done');
  assert.ok(existsSync(path.join(root, 'good.txt')), 'the merged lane must not be disturbed');
  assert.ok(
    existsSync(path.join(again.worktree, 'good.txt')),
    'the re-run must be based on the head that already contains the merged work'
  );
  assert.ok(
    path.relative(root, again.worktree).startsWith('..'),
    `a worktree must never be created inside the project, got ${again.worktree}`
  );
});

test('an unknown lane is refused with the lanes that do exist @spec:AC-022', () => {
  assert.throws(
    () => rerunLane({ rootDir: '/nowhere' }, {}, { lanes: [{ id: 'lane-01' }] }, 'lane-99', () => {}),
    /no lane "lane-99".*lane-01/s
  );
});

// ------------------------------------------------------------------ ledger

test('worker output goes outside the repository, never into it @spec:AC-021', () => {
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };
  const lane = {
    id: 'lane-01', branch: 'adp/r6/lane-01', worktree: '.adp-worktrees/r6/lane-01',
    tasks: [{ id: 'T-001', title: 'x', files: ['f.txt'], refs: [] }], files: ['f.txt'],
  };

  runLane(project, cfg, lane, ({ cwd }) => {
    writeFileSync(path.join(cwd, 'f.txt'), 'x\n');
    return { ok: true, summary: 'short summary', output: 'PAGES AND PAGES OF TRANSCRIPT\n' };
  }, { runId: 'r6' });

  const stream = streamPath(cfg, 'r6', 'lane-01', 'T-001');
  assert.ok(existsSync(stream), 'the stream must be written');
  assert.ok(
    path.relative(root, stream).startsWith('..'),
    `the stream must live outside the repository, got ${stream}`
  );
  assert.ok(path.relative(root, ledgerPath(cfg)).startsWith('..'));
});

test('progress is built from events and summaries, never from a transcript @spec:AC-021', () => {
  const cfg = state();
  append(cfg, { runId: 'r7', laneId: 'lane-01', taskId: 'T-001', type: 'task-started' });
  append(cfg, { runId: 'r7', laneId: 'lane-01', taskId: 'T-001', type: 'task-done', summary: 'built the thing' });
  append(cfg, { runId: 'r7', laneId: 'lane-01', type: 'lane-done' });
  append(cfg, { runId: 'OTHER', laneId: 'lane-09', type: 'lane-done' });

  const p = progress(cfg, 'r7');
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].state, 'task-done');
  assert.equal(p.tasks[0].summary, 'built the thing');
  assert.equal(p.lanes.length, 1, 'another run must not leak into this report');
  assert.equal(JSON.stringify(p).includes('TRANSCRIPT'), false);
});

test('a torn trailing line does not lose the history @spec:AC-021', () => {
  const cfg = state();
  append(cfg, { runId: 'r8', type: 'a' });
  append(cfg, { runId: 'r8', type: 'b' });
  appendFileSync(ledgerPath(cfg), '{"runId":"r8","typ');  // killed mid-append

  const { events, skipped } = read(cfg, { runId: 'r8' });
  assert.equal(events.length, 2, 'readable events must survive');
  assert.equal(skipped, 1, 'and the damage must be countable, not silent');
});

test('pruning drops old streams and keeps the ledger @spec:AC-021', () => {
  const cfg = state();
  for (const runId of ['a', 'b', 'c']) {
    mkdirSync(path.dirname(streamPath(cfg, runId, 'lane-01', 'T-001')), { recursive: true });
    writeFileSync(streamPath(cfg, runId, 'lane-01', 'T-001'), 'noise\n');
  }
  append(cfg, { runId: 'a', type: 'kept' });

  const { removed } = prune(cfg, { keep: 1 });
  assert.equal(removed.length, 2);
  assert.equal(read(cfg).events.length, 1, 'events are small and are what a post-mortem reads');
});

// ------------------------------------------------------------------ prompts

test('a red gate becomes a paste-ready prompt with codes and locations @spec:AC-023', () => {
  const prompt = buildPrompt({
    id: 'G3',
    title: 'Breakdown implementable',
    findings: [
      { code: 'AC_WITHOUT_TASK', message: 'AC-007 is covered by no task', file: 'PRD.md', line: 12 },
      { code: 'AC_WITHOUT_TASK', message: 'AC-008 is covered by no task', file: 'PRD.md', line: 20 },
      { code: 'REF_BROKEN', message: 'T-003 references AC-999', file: 'TDD.md', line: 40 },
    ],
  });

  assert.match(prompt, /Gate G3 \(Breakdown implementable\) is red/);
  assert.match(prompt, /AC_WITHOUT_TASK/);
  assert.match(prompt, /PRD\.md:12/);
  assert.match(prompt, /REF_BROKEN/);
  // The two non-negotiables.
  assert.match(prompt, /Do not weaken, skip or delete a test/);
  assert.match(prompt, /3 attempts/);
});

test('a clean gate produces no prompt at all @spec:AC-023', () => {
  assert.equal(buildPrompt({ id: 'G0', title: 'Scope approved', findings: [] }), null);
  assert.equal(buildPrompt(null), null);
});

// ------------------------------------------------------------------ agent

test('the brief carries the task, its criteria and the rules @spec:AC-020', async () => {
  const { buildBrief } = await import('../src/core/agent.js');
  const proj = {
    features: [
      {
        name: 'demo',
        spec: {
          acs: [
            { id: 'AC-001', title: 'A thing', body: '- **Given** g\n- **When** w\n- **Then** t' },
            { id: 'AC-999', title: 'Not referenced', body: 'irrelevant' },
          ],
        },
      },
    ],
  };
  const brief = buildBrief(proj, {
    id: 'T-001', title: 'do it', refs: ['AC-001'], files: ['src/a.js'],
  });

  assert.match(brief, /T-001 — do it/);
  assert.match(brief, /AC-001 — A thing/);
  assert.ok(!brief.includes('AC-999'), 'a worker gets only its own criteria, not the whole spec');
  assert.match(brief, /src\/a\.js/);
  assert.match(brief, /Do NOT commit/);
  assert.match(brief, /Do NOT weaken, skip or delete a test/);
});

test('the agent command is argv, never a shell string @spec:AC-020', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  const { command, args } = resolveAgentCommand({ agent: { name: 'claude' } });
  assert.equal(command, 'claude');
  // The prompt must occupy its own argv slot. Interpolated into a shell string,
  // a task title containing a quote or a semicolon becomes shell syntax — and
  // the brief is built from documents this tool does not control.
  assert.ok(args.includes('{{PROMPT}}'), 'the prompt is a discrete argument');
  assert.equal(args.filter((a) => a.includes('{{PROMPT}}')).length, 1);
});

test('an unknown agent is refused with the ones that are known @spec:AC-020', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  assert.throws(() => resolveAgentCommand({ agent: { name: 'nope' } }), /claude/);
});

test('permission to write is withheld unless it is asked for @spec:AC-020', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  // The default is the invocation that cannot write. That is the point: an
  // agent editing a repository unattended is a decision, and a decision nobody
  // made is not one that should be made by a default.
  const off = resolveAgentCommand({ agent: { name: 'claude' } });
  assert.ok(!off.args.includes('--permission-mode'), 'no write permission unless requested');

  const on = resolveAgentCommand({ agent: { name: 'claude' } }, { allowEdits: true });
  assert.deepEqual(on.args, ['-p', '{{PROMPT}}', '--permission-mode', 'acceptEdits']);
  // The prompt keeps its own argv slot with the flag appended, or the brief
  // would be parsed as flags.
  assert.equal(on.args.filter((a) => a.includes('{{PROMPT}}')).length, 1);
});

test('a harness whose write flags are unknown refuses rather than guesses @spec:AC-020', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  // Guessing here fails silently and late: the run looks like it worked, every
  // task reports done, and nothing was written. Refusing costs one error now.
  assert.throws(
    () => resolveAgentCommand({ agent: { name: 'codex' } }, { allowEdits: true }),
    /agent\.editArgs/
  );
  assert.throws(
    () => resolveAgentCommand({ agent: { command: 'my-agent', args: ['{{PROMPT}}'] } }, { allowEdits: true }),
    /agent\.editArgs/
  );
  // ...and accepts them once the operator states what they are.
  const declared = resolveAgentCommand(
    { agent: { command: 'my-agent', args: ['{{PROMPT}}'], editArgs: ['--write'] } },
    { allowEdits: true }
  );
  assert.deepEqual(declared.args, ['{{PROMPT}}', '--write']);
});

test('resolveConfiguredModel prefers agent.models.implementation, then parallel.model, then null @spec:AC-115', async () => {
  const { resolveConfiguredModel } = await import('../src/core/agent.js');
  assert.equal(resolveConfiguredModel({ agent: { models: { implementation: 'opus' } } }), 'opus');
  // The older, single-phase key still works, so an existing config is not silently ignored.
  assert.equal(resolveConfiguredModel({ parallel: { model: 'sonnet' } }), 'sonnet');
  assert.equal(
    resolveConfiguredModel({ agent: { models: { implementation: 'opus' } }, parallel: { model: 'sonnet' } }),
    'opus',
    'the generalized per-phase key wins over the older single one'
  );
  assert.equal(resolveConfiguredModel({}), null, 'no configuration means no opinion — let the harness pick');
});

test('a configured model becomes --model for a harness that knows the flag @spec:AC-115', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  const { args } = resolveAgentCommand({ agent: { name: 'claude' } }, { model: 'opus' });
  assert.deepEqual(args, ['-p', '{{PROMPT}}', '--model', 'opus']);
});

test('a configured model combines with --allow-edits, model flags first @spec:AC-115', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  const { args } = resolveAgentCommand({ agent: { name: 'claude' } }, { model: 'opus', allowEdits: true });
  assert.deepEqual(args, ['-p', '{{PROMPT}}', '--model', 'opus', '--permission-mode', 'acceptEdits']);
});

test('a harness with no known model flag refuses a configured model instead of guessing @spec:AC-116', async () => {
  const { resolveAgentCommand } = await import('../src/core/agent.js');
  // Guessing here is a real bill, not just a broken run: a wrong flag might be
  // silently ignored by the harness, which then runs its own (possibly pricier
  // or cheaper) default model with nobody the wiser.
  assert.throws(
    () => resolveAgentCommand({ agent: { name: 'codex' } }, { model: 'gpt-5' }),
    /agent\.modelArgs/
  );
  assert.throws(
    () => resolveAgentCommand({ agent: { command: 'my-agent', args: ['{{PROMPT}}'] } }, { model: 'x' }),
    /agent\.modelArgs/
  );
  // ...and accepts it once the operator states the flag, same shape as editArgs.
  const declared = resolveAgentCommand(
    { agent: { command: 'my-agent', args: ['{{PROMPT}}'], modelArgs: ['--model', '{{MODEL}}'] } },
    { model: 'x' }
  );
  assert.deepEqual(declared.args, ['{{PROMPT}}', '--model', 'x']);
});

test('describeAgentCommand resolves the configured model automatically, without the caller repeating the lookup @spec:AC-115', async () => {
  const { describeAgentCommand } = await import('../src/core/agent.js');
  const text = describeAgentCommand({ agent: { name: 'claude', models: { implementation: 'opus' } } });
  assert.match(text, /--model opus/);
});

test('the summary is the one line the orchestrator reads @spec:AC-021', async () => {
  const { extractSummary } = await import('../src/core/agent.js');
  assert.equal(
    extractSummary('lots\nof\nchatter\nSUMMARY: added the parser\nmore noise'),
    'added the parser'
  );
  // A worker that ignored the instruction still yields something reportable.
  assert.equal(extractSummary('just\nsome\noutput'), 'output');
  assert.equal(extractSummary(''), null);
});

// ------------------------------------------------------------------ cleanup

test('a merged lane is cleaned up; an unmerged one is kept @spec:AC-043', async () => {
  const { cleanWorktrees, listOurWorktrees } = await import('../src/core/executor.js');
  const root = gitRepo();
  const cfg = state();
  const project = { rootDir: root, features: [] };

  const merged = {
    id: 'lane-01', branch: 'adp/rc/lane-01', worktree: path.join('worktrees', 'rc', 'lane-01'),
    tasks: [{ id: 'T-001', title: 'a', files: ['a.txt'], refs: [] }], files: ['a.txt'],
  };
  const orphan = {
    id: 'lane-02', branch: 'adp/rc/lane-02', worktree: path.join('worktrees', 'rc', 'lane-02'),
    tasks: [{ id: 'T-002', title: 'b', files: ['b.txt'], refs: [] }], files: ['b.txt'],
  };

  for (const lane of [merged, orphan]) {
    runLane(project, cfg, lane, ({ cwd, task: t }) => {
      writeFileSync(path.join(cwd, t.files[0]), 'x\n');
      return { ok: true, summary: 'ok' };
    }, { runId: 'rc' });
  }
  assert.equal(mergeLane(project, cfg, merged, { runId: 'rc' }).ok, true);
  assert.equal(listOurWorktrees(root, cfg).length, 2);

  const { removed, kept } = cleanWorktrees(project, cfg);
  assert.deepEqual(removed.map((w) => w.branch), ['adp/rc/lane-01']);
  // The unmerged lane's branch is the ONLY place that work exists. Tidiness
  // never outranks not losing work.
  assert.equal(kept.length, 1);
  assert.equal(kept[0].branch, 'adp/rc/lane-02');
  assert.match(kept[0].reason, /not merged/);
  assert.equal(git(root, ['rev-parse', '--verify', 'adp/rc/lane-02'], { allowFail: true }).status, 0);
});

test('cleanup never touches a worktree this tool did not create @spec:AC-043', async () => {
  const { listOurWorktrees } = await import('../src/core/executor.js');
  const root = gitRepo();
  const cfg = state();
  const mine = path.join(root, '..', path.basename(root) + '-human-worktree');
  git(root, ['worktree', 'add', '-b', 'my-own-branch', mine]);
  try {
    assert.deepEqual(listOurWorktrees(root, cfg), [], 'a human worktree is none of this tool\'s business');
  } finally {
    git(root, ['worktree', 'remove', '--force', mine], { allowFail: true });
  }
});

// ------------------------------------------------------------------ resume

test('the briefing is derived, and only the note is stored @spec:AC-041', async () => {
  const { buildResume, renderResume, saveCheckpoint, clearCheckpoint } = await import(
    '../src/core/resume.js'
  );
  const root = mkdtempSync(path.join(tmpdir(), 'adp-resume-'));
  const cfg = state();
  const project = {
    rootDir: root,
    scope: { status: 'Approved' },
    codeMtime: 2000,
    verification: { demo: { verifiedAt: '2026-01-01T00:00:00Z', codeMtime: 1000, results: { 'AC-001': { status: 'pass' } } } },
    features: [
      {
        name: 'demo',
        spec: {
          acs: [{ id: 'AC-001', title: 'one' }, { id: 'AC-002', title: 'two' }],
          questions: [{ id: 'Q-001', status: 'open', blocking: true, text: 'which path?' }],
          tasks: [
            { id: 'T-001', title: 'doing', status: 'in-progress' },
            { id: 'T-002', title: 'resting', status: 'in-test' },
            { id: 'T-003', title: 'also resting', status: 'in-test' },
          ],
        },
      },
    ],
  };

  const r1 = buildResume(project, cfg, { findings: [] });
  assert.equal(r1.checkpoint, null, 'with no note, everything still derives');
  assert.equal(r1.unprovenCount, 1, 'AC-002 has no proof');
  assert.equal(r1.lastVerify.stale, true, 'code moved after the proof');
  // Only in-progress is in flight; in-test is a resting state, counted not listed.
  assert.deepEqual(r1.inFlight.map((t) => t.id), ['T-001']);
  assert.equal(r1.awaitingProof, 2);
  assert.equal(r1.openQuestions.filter((q) => q.blocking).length, 1);

  saveCheckpoint(root, cfg, { note: 'was halfway through the parser', next: 'finish T-001' });
  const r2 = buildResume(project, cfg, { findings: [] });
  assert.equal(r2.checkpoint.note, 'was halfway through the parser');

  const text = renderResume(r2);
  assert.match(text, /was halfway through the parser/);
  assert.match(text, /STALE/);
  assert.match(text, /Q-001/);
  assert.match(text, /2 task\(s\) sit at \[in-test\]/);
  // The note is labelled as the one thing that can be wrong.
  assert.match(text, /only part not recomputed/);

  assert.equal(clearCheckpoint(root, cfg), true);
  assert.equal(buildResume(project, cfg, { findings: [] }).checkpoint, null);
});

test('a checkpoint does not leak between projects @spec:AC-042', async () => {
  const { saveCheckpoint, readCheckpoint } = await import('../src/core/resume.js');
  const cfg = state();
  const a = mkdtempSync(path.join(tmpdir(), 'adp-cp-a-'));
  const b = mkdtempSync(path.join(tmpdir(), 'adp-cp-b-'));
  saveCheckpoint(a, cfg, { note: 'project A' });
  assert.equal(readCheckpoint(a, cfg).note, 'project A');
  assert.equal(readCheckpoint(b, cfg), null);
});
