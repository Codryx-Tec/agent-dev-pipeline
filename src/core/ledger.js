// The event ledger.
//
// Append-only JSONL, one line per event, kept in the state directory OUTSIDE the
// host repository (D-007). Two reasons, and the second is the one people forget:
// run events are high-volume churn nobody wants in a diff, and telemetry about a
// lane must outlive the lane — lanes are worktrees, and worktrees get deleted.
//
// A CORRUPT TRAILING LINE IS NORMAL. A process killed mid-append leaves half a
// line behind. The reader skips it and keeps going, because refusing to read a
// history because its last byte is torn would lose everything to protect
// nothing. Corruption anywhere else is skipped the same way and counted, so a
// caller can tell "clean" from "mostly readable".
//
// This is where AC-021 is enforced from the storage side: worker output streams
// are written here, not into the repository, and the orchestrator composes its
// reports from events and short summaries rather than from transcripts.

import { appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import path from 'path';
import { resolveStateDir } from './trust.js';

/**
 * Retention: the last ten runs' streams.
 *
 * Answered by Q-005, and the reason is token economy rather than disk. Worker
 * transcripts are the bulk of what this tool produces and the least re-read part
 * of it; keeping thirty runs meant carrying weeks of output nobody would open.
 * Ten covers "what went wrong in the last few attempts", which is the only
 * question a stream ever actually answers.
 *
 * Events are NOT pruned. They are small, and they are what a post-mortem reads.
 */
export const DEFAULT_KEEP_RUNS = 10;

export function ledgerPath(config = {}) {
  return path.join(resolveStateDir(config), 'ledger.jsonl');
}

export function streamsDir(config = {}, runId) {
  return path.join(resolveStateDir(config), 'streams', String(runId));
}

/** Append one event. Never throws on a full disk mid-run — the run matters more. */
export function append(config, event) {
  const p = ledgerPath(config);
  mkdirSync(path.dirname(p), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  try {
    appendFileSync(p, line + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read events back.
 *
 * @returns {{events: object[], skipped: number}} skipped counts unparseable
 * lines, so "the history is clean" and "the history is readable" stay
 * distinguishable rather than both looking like success.
 */
export function read(config, { runId } = {}) {
  const p = ledgerPath(config);
  if (!existsSync(p)) return { events: [], skipped: 0 };

  const events = [];
  let skipped = 0;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (runId && e.runId !== runId) continue;
      events.push(e);
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}

/** Where a worker's raw output goes — outside the repository, read on request only. */
export function streamPath(config, runId, laneId, taskId) {
  return path.join(streamsDir(config, runId), `${laneId}--${taskId}.jsonl`);
}

export function appendStream(config, runId, laneId, taskId, chunk) {
  const p = streamPath(config, runId, laneId, taskId);
  mkdirSync(path.dirname(p), { recursive: true });
  try {
    appendFileSync(p, chunk);
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop the oldest runs' streams.
 *
 * Only streams are pruned, never the ledger: events are small and are what a
 * post-mortem reads, while streams are the bulk. Deleting the evidence and
 * keeping the noise would be the wrong way round.
 */
export function prune(config, { keep = DEFAULT_KEEP_RUNS } = {}) {
  const dir = path.join(resolveStateDir(config), 'streams');
  if (!existsSync(dir)) return { removed: [] };

  const runs = readdirSync(dir)
    .map((name) => {
      const full = path.join(dir, name);
      try {
        return { name, full, mtime: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  const removed = [];
  for (const run of runs.slice(keep)) {
    try {
      rmSync(run.full, { recursive: true, force: true });
      removed.push(run.name);
    } catch {
      /* a stream we cannot delete is not worth failing a run over */
    }
  }
  return { removed };
}

/**
 * The orchestrator's view: built from events and summaries, never transcripts.
 *
 * This function is the enforcement point for AC-021 on the read side. It takes
 * the ledger and returns progress. It has no access to a stream and no reason to
 * want one — reading a worker's transcript is precisely the context cost the
 * whole background-execution design exists to avoid.
 */
export function progress(config, runId) {
  const { events, skipped } = read(config, { runId });
  const tasks = new Map();
  const lanes = new Map();

  for (const e of events) {
    if (e.taskId) {
      const prev = tasks.get(e.taskId) ?? { id: e.taskId, laneId: e.laneId, events: 0 };
      tasks.set(e.taskId, {
        ...prev,
        events: prev.events + 1,
        state: e.type,
        summary: e.summary ?? prev.summary ?? null,
      });
    }
    if (e.laneId && !e.taskId) {
      lanes.set(e.laneId, { id: e.laneId, state: e.type, error: e.error ?? null });
    }
  }

  return {
    runId,
    lanes: [...lanes.values()],
    tasks: [...tasks.values()],
    skippedLines: skipped,
  };
}
