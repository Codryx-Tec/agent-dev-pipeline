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
import { runLane, mergeLane, git, filesInCommit } from '../src/core/executor.js';
import { rerunLane } from '../src/core/rerun.js';
import { append, read, progress, prune, streamPath, ledgerPath } from '../src/core/ledger.js';
import { buildPrompt } from '../src/core/prompts.js';

// ------------------------------------------------------------------ helpers

function fakeProject(tasks) {
  return {
    rootDir: '/nowhere',
    features: [{ name: 'demo', tdd: { tasks } }],
  };
}

function task(id, files, status = 'pendente') {
  return { id, title: `task ${id}`, status, files, refs: [] };
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
      task('T-001', ['src/a.js'], 'concluida'),
      task('T-002', ['src/b.js'], 'em-teste'),
      task('T-003', ['src/c.js'], 'pendente'),
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
      { code: 'AC_SEM_TASK', message: 'AC-007 is covered by no task', file: 'PRD.md', line: 12 },
      { code: 'AC_SEM_TASK', message: 'AC-008 is covered by no task', file: 'PRD.md', line: 20 },
      { code: 'REF_QUEBRADA', message: 'T-003 references AC-999', file: 'TDD.md', line: 40 },
    ],
  });

  assert.match(prompt, /Gate G3 \(Breakdown implementable\) is red/);
  assert.match(prompt, /AC_SEM_TASK/);
  assert.match(prompt, /PRD\.md:12/);
  assert.match(prompt, /REF_QUEBRADA/);
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
        prd: {
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
        prd: { acs: [{ id: 'AC-001', title: 'one' }, { id: 'AC-002', title: 'two' }] },
        rfc: { questions: [{ id: 'Q-001', status: 'aberta', blocking: true, text: 'which path?' }] },
        tdd: { tasks: [
          { id: 'T-001', title: 'doing', status: 'em-andamento' },
          { id: 'T-002', title: 'resting', status: 'em-teste' },
          { id: 'T-003', title: 'also resting', status: 'em-teste' },
        ] },
      },
    ],
  };

  const r1 = buildResume(project, cfg, { findings: [] });
  assert.equal(r1.checkpoint, null, 'with no note, everything still derives');
  assert.equal(r1.unprovenCount, 1, 'AC-002 has no proof');
  assert.equal(r1.lastVerify.stale, true, 'code moved after the proof');
  // Only em-andamento is in flight; em-teste is a resting state, counted not listed.
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
  assert.match(text, /2 task\(s\) sit at \[em-teste\]/);
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
