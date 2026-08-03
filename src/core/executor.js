// The worker executor.
//
// One lane, one git worktree, one branch. One task, one fresh headless agent
// invocation, one commit. No tmux, no shell script, no terminal multiplexer
// (D-002) — this is plain Node spawning processes, which is what keeps the tool
// portable and the failure modes legible.
//
// WHY THE AGENT INVOCATION IS INJECTED. `runTask` is a parameter, not a hard
// call to a CLI. Two reasons, and neither is testing convenience alone. ASM-001
// — that the configured agent CLI has a usable non-interactive mode — is still
// open, so pinning the call site would bake in an unverified assumption. And the
// executor's real logic is the worktree lifecycle, the one-commit rule and the
// undeclared-file detection; all of that must be testable without spending money
// on a model call.
//
// WHAT THIS REFUSES TO DO:
//   - resolve a merge conflict. A lane that conflicts stops and asks for a
//     human. Silent conflict resolution in code nobody reviewed is how you lose
//     work you did not know you had.
//   - touch the captain's working tree. Lanes live in worktrees; the main tree
//     is read for its HEAD and otherwise left alone (AC-020).
//   - trust a task's declared file list. It is checked afterwards against what
//     the commit actually touched, per ASM-005.

import { spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { append, appendStream, streamPath } from './ledger.js';
import { resolveStateDir } from './trust.js';

// Worktrees live in the state directory, never inside the repository under
// audit. A worktree in the project shows up as untracked debris in the user's
// own `git status`, which is the tool littering a tree it promised to leave
// alone. This resolver is the single place that decision is expressed.
export function worktreePath(config, lane) {
  return path.isAbsolute(lane.worktree)
    ? lane.worktree
    : path.join(resolveStateDir(config), lane.worktree);
}

export function git(cwd, args, { allowFail = false } = {}) {
  const proc = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (!allowFail && proc.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  }
  return { status: proc.status, stdout: (proc.stdout ?? '').trim(), stderr: (proc.stderr ?? '').trim() };
}

export function isGitRepo(dir) {
  return git(dir, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }).status === 0;
}

/** Files a commit actually touched — the ground truth ASM-005 is checked against. */
export function filesInCommit(cwd, rev = 'HEAD') {
  const out = git(cwd, ['show', '--name-only', '--pretty=format:', rev]).stdout;
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function cleanLane(rootDir, lane, config = {}) {
  const wt = worktreePath(config, lane);
  // `worktree remove` refuses on a dirty tree; --force is right here because we
  // are deliberately discarding a previous attempt (AC-022).
  git(rootDir, ['worktree', 'remove', '--force', wt], { allowFail: true });
  if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
  git(rootDir, ['worktree', 'prune'], { allowFail: true });
  git(rootDir, ['branch', '-D', lane.branch], { allowFail: true });
}

/**
 * Run one lane to completion, or stop at the first task that fails.
 *
 * @param runTask ({task, cwd, lane}) => {ok, summary, output}
 *        The headless agent invocation. Must leave its work in the worktree
 *        UNCOMMITTED — this function does the committing, so that "one task, one
 *        commit, named for the task" is a property of the executor rather than a
 *        request the worker may forget.
 */
export function runLane(project, config, lane, runTask, { runId, base = 'HEAD' } = {}) {
  const rootDir = project.rootDir;
  const wt = worktreePath(config, lane);

  append(config, { runId, laneId: lane.id, type: 'lane-started', branch: lane.branch });

  cleanLane(rootDir, lane, config);
  git(rootDir, ['worktree', 'add', '-b', lane.branch, wt, base]);

  const results = [];
  try {
    for (const task of lane.tasks) {
      append(config, { runId, laneId: lane.id, taskId: task.id, type: 'task-started' });

      const before = git(wt, ['rev-parse', 'HEAD']).stdout;
      let outcome;
      try {
        outcome = runTask({ task, cwd: wt, lane });
      } catch (err) {
        outcome = { ok: false, summary: `worker threw: ${err.message}`, output: '' };
      }

      // The raw stream goes outside the repository and is read only on request.
      if (outcome.output) {
        appendStream(config, runId, lane.id, task.id, outcome.output);
      }

      if (!outcome.ok) {
        append(config, {
          runId, laneId: lane.id, taskId: task.id, type: 'task-failed',
          summary: outcome.summary ?? 'the worker reported failure',
        });
        results.push({ task: task.id, ok: false, summary: outcome.summary ?? null });
        return finish(config, runId, lane, results, 'failed', wt);
      }

      // One commit per task, named for the task. Staged here rather than by the
      // worker so the rule holds even when the worker forgets it.
      git(wt, ['add', '-A']);
      const staged = git(wt, ['diff', '--cached', '--name-only']).stdout;
      if (!staged) {
        append(config, {
          runId, laneId: lane.id, taskId: task.id, type: 'task-empty',
          summary: 'the worker changed nothing',
        });
        results.push({ task: task.id, ok: false, summary: 'no changes were produced' });
        return finish(config, runId, lane, results, 'failed', wt);
      }

      git(wt, ['commit', '-m', `${task.id}: ${task.title}`.trim()]);
      const after = git(wt, ['rev-parse', 'HEAD']).stdout;

      // ASM-005, checked rather than assumed: a worker that touched a file the
      // task did not declare has broken the disjointness that makes lanes safe.
      // Reported, not silently tolerated — and not fatal either, because the
      // damage is already done and hiding it helps nobody.
      const touched = filesInCommit(wt, after);
      const declared = new Set(task.files ?? []);
      const undeclared = touched.filter((f) => !declared.has(f));
      if (undeclared.length) {
        append(config, {
          runId, laneId: lane.id, taskId: task.id, type: 'undeclared-files',
          files: undeclared,
        });
      }

      append(config, {
        runId, laneId: lane.id, taskId: task.id, type: 'task-done',
        commit: after, from: before, summary: outcome.summary ?? null,
      });
      results.push({
        task: task.id, ok: true, commit: after,
        summary: outcome.summary ?? null, undeclared,
      });
    }
  } catch (err) {
    append(config, { runId, laneId: lane.id, type: 'lane-error', error: err.message });
    return finish(config, runId, lane, results, 'error', wt, err.message);
  }

  return finish(config, runId, lane, results, 'done', wt);
}

function finish(config, runId, lane, results, state, worktree, error = null) {
  append(config, { runId, laneId: lane.id, type: `lane-${state}`, error });
  return { lane: lane.id, branch: lane.branch, worktree, state, results, error };
}

/**
 * Merge a completed lane back, with --no-ff so the lane stays visible in history.
 *
 * A conflict is NOT resolved: the merge is aborted, the lane is left intact, and
 * the caller is told. Anything else would be this tool making a code decision
 * nobody asked it to make.
 */
export function mergeLane(project, config, lane, { runId } = {}) {
  const rootDir = project.rootDir;
  const merge = git(rootDir, ['merge', '--no-ff', '-m', `merge ${lane.id} (${lane.branch})`, lane.branch], {
    allowFail: true,
  });

  if (merge.status !== 0) {
    git(rootDir, ['merge', '--abort'], { allowFail: true });
    append(config, { runId, laneId: lane.id, type: 'merge-conflict' });
    return {
      ok: false,
      conflict: true,
      message:
        `${lane.id} conflicts with the main tree and was NOT merged.\n` +
        `  The branch ${lane.branch} is intact — resolve it yourself.\n` +
        '  This tool does not resolve conflicts: a merge nobody reviewed is not a merge.',
    };
  }

  append(config, { runId, laneId: lane.id, type: 'lane-merged' });
  return { ok: true, conflict: false };
}

/** Remove a lane's worktree and branch after a successful merge. */
export function cleanupLane(project, config, lane) {
  cleanLane(project.rootDir, lane, config);
}

/**
 * Every worktree this tool has created and not cleaned up.
 *
 * Read from git itself rather than from the state directory listing: git is the
 * authority on what worktrees exist, and a directory deleted by hand leaves a
 * registration behind that only `git worktree list` knows about.
 */
export function listOurWorktrees(rootDir, config = {}) {
  const stateRoot = resolveStateDir(config);
  const out = git(rootDir, ['worktree', 'list', '--porcelain'], { allowFail: true });
  if (out.status !== 0) return [];

  const found = [];
  let current = null;
  for (const line of out.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim(), branch: null };
      found.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
    }
  }

  // Only ours. A worktree the human created for their own reasons is none of
  // this tool's business, and deleting it would be unforgivable.
  return found.filter(
    (w) => w.path.startsWith(path.join(stateRoot, 'worktrees')) || (w.branch ?? '').startsWith('adp/')
  );
}

/**
 * Remove worktrees and branches left behind by finished runs.
 *
 * `keepBranches` protects lanes whose work has NOT been merged. A failed lane is
 * evidence: its branch is the only place the partial work exists, and deleting
 * it to tidy up would destroy the thing the human needs in order to re-run or
 * inspect it. Tidiness never outranks not losing work.
 */
export function cleanWorktrees(project, config = {}, { force = false } = {}) {
  const rootDir = project.rootDir;
  const removed = [];
  const kept = [];

  for (const wt of listOurWorktrees(rootDir, config)) {
    const branch = wt.branch;
    // Is this branch's work already in the current HEAD?
    const merged = branch
      ? git(rootDir, ['merge-base', '--is-ancestor', branch, 'HEAD'], { allowFail: true }).status === 0
      : false;

    if (!merged && !force) {
      kept.push({ ...wt, reason: 'not merged — its work exists nowhere else' });
      continue;
    }

    git(rootDir, ['worktree', 'remove', '--force', wt.path], { allowFail: true });
    if (existsSync(wt.path)) rmSync(wt.path, { recursive: true, force: true });
    if (branch) git(rootDir, ['branch', '-D', branch], { allowFail: true });
    removed.push(wt);
  }

  git(rootDir, ['worktree', 'prune'], { allowFail: true });
  return { removed, kept };
}

export { cleanLane };
