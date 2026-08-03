// Re-running one lane, without disturbing what already merged.
//
// The property AC-022 asks for is narrow and easy to get wrong: re-running a
// failed lane must clean THAT lane's previous worktree and branch, execute only
// THAT lane's tasks, and leave work merged from other lanes exactly where it is.
//
// The danger is the tempting shortcut — resetting the main branch to a known
// point before re-running. That would indeed give the failed lane a clean base,
// and it would also silently discard the lanes that succeeded. So the base for a
// re-run is the CURRENT main HEAD, which already contains the merged work, and
// the lane is rebuilt on top of it.

import { runLane, mergeLane, cleanLane, git } from './executor.js';
import { append } from './ledger.js';

/** Find a lane in a plan by id, with a message a human can act on. */
export function laneById(plan, laneId) {
  const lane = plan.lanes.find((l) => l.id === laneId);
  if (!lane) {
    throw new Error(
      `no lane "${laneId}" in this plan — it has: ${plan.lanes.map((l) => l.id).join(', ') || '(none)'}`
    );
  }
  return lane;
}

/**
 * Re-run exactly one lane.
 *
 * @param runTask the same injected worker used by a full run.
 */
export function rerunLane(project, config, plan, laneId, runTask, { runId } = {}) {
  const lane = laneById(plan, laneId);

  append(config, { runId, laneId: lane.id, type: 'lane-rerun-requested' });

  // Base on the CURRENT head, not on where the original run started. Anything
  // merged since — including sibling lanes that succeeded — must survive.
  const base = git(project.rootDir, ['rev-parse', 'HEAD']).stdout;

  // cleanLane is what makes a re-run idempotent: the previous attempt's worktree
  // and branch are removed before the new one is created, so a half-finished
  // lane never leaks into its own retry.
  cleanLane(project.rootDir, lane, config);

  const result = runLane(project, config, lane, runTask, { runId, base });
  return { ...result, base };
}

/** Re-run a lane and merge it if it completed. */
export function rerunAndMerge(project, config, plan, laneId, runTask, { runId } = {}) {
  const result = rerunLane(project, config, plan, laneId, runTask, { runId });
  if (result.state !== 'done') return { ...result, merged: false };
  const merge = mergeLane(project, config, laneById(plan, laneId), { runId });
  return { ...result, merged: merge.ok, mergeMessage: merge.message ?? null };
}
