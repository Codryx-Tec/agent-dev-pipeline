// The execution planner.
//
// Turns a list of tasks into lanes that are safe to run at the same time. Safety
// here means one thing only: two tasks in different lanes never touch the same
// file. That is decided from the `Arquivos:` each task declares, which makes the
// declaration load-bearing rather than documentation.
//
// THE REFUSAL THAT MATTERS. A task that declares no files is never placed in a
// lane (AC-012). It goes to the sequential remainder with its reason recorded.
// The alternative — assuming an undeclared task touches nothing — is the same
// shape of mistake as counting a skipped test as proof: an absence of
// information read as a guarantee.
//
import path from 'path';

// ASM-005 is the honest limit: this trusts the declaration. A worker that edits
// a file it did not declare breaks the disjointness that makes lanes safe, so
// the executor detects that after the fact and reports it, rather than the
// planner pretending it cannot happen.

/** Statuses that still have work left in them. */
const PLANNABLE = new Set(['pendente']);

function normalise(file) {
  return String(file).trim().replace(/^\.\//, '').replace(/\\/g, '/');
}

/**
 * Union-find over tasks, keyed by the files they declare.
 *
 * Two tasks sharing any file end up in the same component; a component is a
 * lane. Transitivity is the point and is easy to get wrong by hand: if A shares
 * a file with B, and B with C, then A and C must run in the same lane even
 * though they share nothing directly.
 */
function components(tasks) {
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const t of tasks) parent.set(t.id, t.id);

  const owner = new Map(); // file -> first task id that declared it
  for (const t of tasks) {
    for (const f of t.files.map(normalise)) {
      if (owner.has(f)) union(t.id, owner.get(f));
      else owner.set(f, t.id);
    }
  }

  const groups = new Map();
  for (const t of tasks) {
    const root = find(t.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  }
  return [...groups.values()];
}

/**
 * Build an execution plan.
 *
 * Ordering is stable and follows document order throughout — lanes are ordered
 * by their first task, and tasks inside a lane keep the order they appear in
 * `TDD.md`. The same document must always plan the same way, or a re-run
 * silently becomes a different execution.
 */
export function buildPlan(project, config = {}, { runId } = {}) {
  const maxParallel = config.parallel?.maxParallel ?? 3;

  const all = [];
  for (const feature of project.features ?? []) {
    for (const task of feature.tdd?.tasks ?? []) {
      all.push({ ...task, feature: feature.name, files: task.files ?? [] });
    }
  }

  const plannable = all.filter((t) => PLANNABLE.has(t.status));

  // AC-012: an undeclared file footprint is never parallelised.
  const sequential = plannable
    .filter((t) => t.files.length === 0)
    .map((t) => ({
      id: t.id,
      feature: t.feature,
      title: t.title ?? '',
      files: [],
      reason: 'unknown file footprint — the task declares no Arquivos:',
    }));

  const declared = plannable.filter((t) => t.files.length > 0);

  const lanes = components(declared)
    .map((group) => group.sort((a, b) => all.indexOf(a) - all.indexOf(b)))
    .sort((a, b) => all.indexOf(a[0]) - all.indexOf(b[0]))
    .map((group, i) => {
      const n = String(i + 1).padStart(2, '0');
      const files = [...new Set(group.flatMap((t) => t.files.map(normalise)))].sort();
      return {
        id: `lane-${n}`,
        branch: `adp/${runId ?? 'run'}/lane-${n}`,
        // Relative to the STATE directory, not to the repository. A worktree
        // created inside the project shows up as untracked debris in the user's
        // own `git status` — the tool leaving footprints in a tree it promised
        // not to touch. git does not care where a worktree lives.
        worktree: path.join('worktrees', String(runId ?? 'run'), `lane-${n}`),
        tasks: group.map((t) => ({
          id: t.id,
          feature: t.feature,
          title: t.title ?? '',
          files: t.files.map(normalise),
          refs: t.refs ?? [],
        })),
        files,
      };
    });

  // Waves: at most maxParallel lanes in flight. Lanes are already disjoint, so a
  // wave is only a concurrency bound, never a correctness one.
  const waves = [];
  for (let i = 0; i < lanes.length; i += maxParallel) {
    waves.push(lanes.slice(i, i + maxParallel).map((l) => l.id));
  }

  return {
    runId: runId ?? null,
    maxParallel,
    lanes,
    sequential,
    waves,
    skipped: all
      .filter((t) => !PLANNABLE.has(t.status))
      .map((t) => ({ id: t.id, status: t.status })),
  };
}

/** One-screen rendering, so the plan can be read before it is run. */
export function renderPlan(plan) {
  const out = [];
  out.push(`run ${plan.runId ?? '(unnamed)'} — ${plan.lanes.length} lane(s), max ${plan.maxParallel} at a time`);
  out.push('');
  for (const lane of plan.lanes) {
    out.push(`${lane.id}  ${lane.branch}`);
    for (const t of lane.tasks) out.push(`    ${t.id}  ${t.title}`);
    out.push(`    files: ${lane.files.join(', ')}`);
    out.push('');
  }
  if (plan.sequential.length) {
    out.push('sequential remainder (never parallelised):');
    for (const t of plan.sequential) out.push(`    ${t.id}  ${t.title}  — ${t.reason}`);
    out.push('');
  }
  if (plan.skipped.length) {
    out.push(`not planned: ${plan.skipped.map((t) => `${t.id} [${t.status}]`).join(', ')}`);
  }
  return out.join('\n');
}
