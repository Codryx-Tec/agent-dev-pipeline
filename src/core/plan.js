// The execution planner.
//
// Turns a list of tasks into lanes that are safe to run at the same time, and an
// order those lanes must run in. Those are two different questions, and until
// Q-010 they were answered by one mechanism.
//
// SAFETY is file disjointness: two tasks in different lanes never WRITE the same
// file. That is decided from the `Arquivos:` each task declares, which makes the
// declaration load-bearing rather than documentation.
//
// ORDER is declared, not inferred: `Depende: T-001` says this task runs after
// that one. Inferring it from file overlap cannot work, because overlap is
// symmetric and "after" is not. The experiment that raised Q-010 showed what the
// absence cost: a task that needed to run last declared three files it only read
// in order to force the issue, and the connected component swallowed the whole
// graph into a single lane.
//
// `Lê:` is the other half of that fix. A file a task only reads costs nothing in
// parallelism, because every lane has its own worktree and two readers do not
// collide. What reading does NOT get you is the other task's version — the
// worktree is branched from HEAD, so a reader sees the pre-run file unless it
// also declares `Depende:`. That gap is reported rather than silently tolerated.
//
// THE REFUSALS THAT MATTER. A task is never placed in a lane when the plan
// cannot be shown to be safe or satisfiable: no declared files (AC-012), a
// dependency on an id no task declares, or a dependency cycle. Each goes to the
// sequential remainder with its reason. The alternative — assuming an undeclared
// task touches nothing, or picking an arbitrary order out of a cycle — is the
// same shape of mistake as counting a skipped test as proof: an absence of
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
 * Union-find, exposed rather than run once.
 *
 * Lanes are built in two passes — write-file overlap first, then contraction of
 * mutually dependent lanes — and the second pass has to be able to add unions to
 * the result of the first.
 */
function unionFind(ids) {
  const parent = new Map(ids.map((id) => [id, id]));
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
  return { find, union };
}

/**
 * Tarjan's strongly connected components.
 *
 * Used twice, for the same reason both times: a set of nodes that all reach each
 * other cannot be ordered. Among tasks that is a contradiction in the documents
 * and gets reported. Among lanes it is not — two lanes can depend on each other
 * through different tasks without any single task being circular — so those
 * lanes are merged into one, which is the only honest answer: they cannot run at
 * the same time and they cannot run in an order.
 */
function stronglyConnected(nodes, edgesOf) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const out = [];
  let counter = 0;

  const connect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);

    for (const w of edgesOf(v)) {
      if (!index.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }

    if (low.get(v) === index.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      out.push(component);
    }
  };

  for (const n of nodes) if (!index.has(n)) connect(n);
  return out;
}

/**
 * Build an execution plan.
 *
 * Ordering is stable and follows document order wherever the dependency graph
 * leaves a choice — lanes are ordered by their first task, and tasks inside a
 * lane keep the order they appear in `TDD.md` unless a dependency moves them.
 * The same document must always plan the same way, or a re-run silently becomes
 * a different execution.
 */
export function buildPlan(project, config = {}, { runId } = {}) {
  const maxParallel = config.parallel?.maxParallel ?? 3;

  const all = [];
  for (const feature of project.features ?? []) {
    for (const task of feature.tdd?.tasks ?? []) {
      all.push({
        ...task,
        feature: feature.name,
        files: task.files ?? [],
        reads: task.reads ?? [],
        dependsOn: task.dependsOn ?? [],
      });
    }
  }

  const order = new Map(all.map((t, i) => [t.id, i]));
  const known = new Set(all.map((t) => t.id));
  const plannable = all.filter((t) => PLANNABLE.has(t.status));
  const plannableIds = new Set(plannable.map((t) => t.id));

  // Every reason a task is kept out of a lane, collected before lanes are built
  // so that one pass decides membership and nothing is placed and then removed.
  const excluded = new Map();
  const exclude = (id, reason) => {
    if (!excluded.has(id)) excluded.set(id, reason);
  };

  // AC-012: an undeclared file footprint is never parallelised.
  for (const t of plannable) {
    if (t.files.length === 0) exclude(t.id, 'unknown file footprint — the task declares no Arquivos:');
  }

  // A dependency on an id nothing declares is a broken document, and the
  // constraint it was trying to express cannot be honoured. Running the task
  // anyway would honour an order nobody wrote.
  for (const t of plannable) {
    const dangling = t.dependsOn.filter((id) => !known.has(id));
    if (dangling.length) {
      exclude(t.id, `depends on ${dangling.join(', ')}, which no task declares`);
    }
  }

  // Edges that constrain THIS plan. A dependency on a task that is not plannable
  // — already concluded, or in somebody else's hands — is satisfied by there
  // being nothing to wait for: it will not run in this plan, so there is no
  // order to enforce against it.
  const depsOf = (t) => t.dependsOn.filter((id) => plannableIds.has(id) && !excluded.has(id));

  // A set of tasks that all reach each other has no valid order. Reported rather
  // than broken arbitrarily — picking a member to go first invents a decision the
  // documents did not make.
  const live = plannable.filter((t) => !excluded.has(t.id));
  const liveById = new Map(live.map((t) => [t.id, t]));
  for (const component of stronglyConnected(
    live.map((t) => t.id),
    (id) => depsOf(liveById.get(id)).filter((d) => liveById.has(d))
  )) {
    const selfLoop = component.length === 1 && depsOf(liveById.get(component[0])).includes(component[0]);
    if (component.length > 1 || selfLoop) {
      const cycle = [...component].sort((a, b) => order.get(a) - order.get(b));
      for (const id of cycle) {
        exclude(id, `circular dependency: ${cycle.join(' → ')} → ${cycle[0]}`);
      }
    }
  }

  // A task excluded from this plan does not run at all — the sequential
  // remainder is printed, not executed. So anything waiting on it is waiting for
  // something that will never happen, and running it anyway would run it against
  // a tree that does not have the work it asked to come after. Propagated to a
  // fixpoint, because the dependent of a dependent is in the same position.
  for (;;) {
    let changed = false;
    for (const t of plannable) {
      if (excluded.has(t.id)) continue;
      const blocked = t.dependsOn.filter((id) => plannableIds.has(id) && excluded.has(id));
      if (!blocked.length) continue;
      exclude(t.id, `depends on ${blocked.join(', ')}, which ${blocked.length > 1 ? 'are' : 'is'} not in this plan`);
      changed = true;
    }
    if (!changed) break;
  }

  const declared = plannable.filter((t) => !excluded.has(t.id));
  const declaredById = new Map(declared.map((t) => [t.id, t]));
  const edgesOf = (t) => depsOf(t).filter((id) => declaredById.has(id));

  // PASS 1 — lanes from write-file overlap. Transitivity is the point and is easy
  // to get wrong by hand: if A shares a file with B, and B with C, then A and C
  // must run in the same lane even though they share nothing directly.
  const uf = unionFind(declared.map((t) => t.id));
  const owner = new Map(); // written file -> first task id that declared it
  for (const t of declared) {
    for (const f of t.files.map(normalise)) {
      if (owner.has(f)) uf.union(t.id, owner.get(f));
      else owner.set(f, t.id);
    }
  }

  // PASS 2 — merge lanes that depend on each other. Each round strictly reduces
  // the number of lanes, so this terminates; contracting the components of a
  // graph yields a graph without cycles, so it normally runs twice.
  for (;;) {
    const roots = [...new Set(declared.map((t) => uf.find(t.id)))];
    const edges = new Map(roots.map((r) => [r, new Set()]));
    for (const t of declared) {
      for (const d of edgesOf(t)) {
        const a = uf.find(t.id);
        const b = uf.find(d);
        if (a !== b) edges.get(a).add(b);
      }
    }
    const cyclic = stronglyConnected(roots, (r) => edges.get(r) ?? []).filter((c) => c.length > 1);
    if (!cyclic.length) break;
    for (const component of cyclic) {
      for (const r of component.slice(1)) uf.union(component[0], r);
    }
  }

  // Group, then order tasks inside each lane so a dependency always precedes its
  // dependent. Kahn's algorithm, taking the earliest task in document order among
  // those currently free — which keeps the result stable and readable.
  const groups = new Map();
  for (const t of declared) {
    const root = uf.find(t.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  }

  const sortedGroups = [...groups.values()]
    .map((group) => orderTasks(group, edgesOf))
    .sort((a, b) => order.get(a[0].id) - order.get(b[0].id));

  const laneOf = new Map();
  sortedGroups.forEach((group, i) => {
    const id = `lane-${String(i + 1).padStart(2, '0')}`;
    for (const t of group) laneOf.set(t.id, id);
  });

  // Lane-level dependencies, and from them the wave each lane belongs to. Waves
  // are levels rather than a greedy packing: a lane never starts in the same wave
  // as anything it depends on, and that is far easier to read off the plan than a
  // schedule optimised by a few percent.
  const laneDeps = new Map(sortedGroups.map((_, i) => [`lane-${String(i + 1).padStart(2, '0')}`, new Set()]));
  for (const t of declared) {
    for (const d of edgesOf(t)) {
      const a = laneOf.get(t.id);
      const b = laneOf.get(d);
      if (a !== b) laneDeps.get(a).add(b);
    }
  }

  const level = new Map();
  const levelOf = (laneId) => {
    if (level.has(laneId)) return level.get(laneId);
    let value = 0;
    for (const dep of laneDeps.get(laneId)) value = Math.max(value, levelOf(dep) + 1);
    level.set(laneId, value);
    return value;
  };

  const lanes = sortedGroups.map((group, i) => {
    const laneId = `lane-${String(i + 1).padStart(2, '0')}`;
    const files = [...new Set(group.flatMap((t) => t.files.map(normalise)))].sort();
    const reads = [...new Set(group.flatMap((t) => t.reads.map(normalise)))].sort().filter((f) => !files.includes(f));
    return {
      id: laneId,
      branch: `adp/${runId ?? 'run'}/lane-${String(i + 1).padStart(2, '0')}`,
      // Relative to the STATE directory, not to the repository. A worktree
      // created inside the project shows up as untracked debris in the user's
      // own `git status` — the tool leaving footprints in a tree it promised
      // not to touch. git does not care where a worktree lives.
      worktree: path.join('worktrees', String(runId ?? 'run'), `lane-${String(i + 1).padStart(2, '0')}`),
      after: [...laneDeps.get(laneId)].sort(),
      wave: levelOf(laneId),
      tasks: group.map((t) => ({
        id: t.id,
        feature: t.feature,
        title: t.title ?? '',
        files: t.files.map(normalise),
        reads: t.reads.map(normalise),
        dependsOn: t.dependsOn,
        refs: t.refs ?? [],
      })),
      files,
      reads,
    };
  });

  // Waves: lanes of the same level, chunked by the concurrency bound. Lanes
  // within a wave are disjoint AND independent, so a wave is safe by
  // construction and the bound is only about how much runs at once.
  const waves = [];
  for (const lvl of [...new Set(lanes.map((l) => l.wave))].sort((a, b) => a - b)) {
    const atLevel = lanes.filter((l) => l.wave === lvl).map((l) => l.id);
    for (let i = 0; i < atLevel.length; i += maxParallel) {
      waves.push(atLevel.slice(i, i + maxParallel));
    }
  }

  return {
    runId: runId ?? null,
    maxParallel,
    lanes,
    sequential: plannable
      .filter((t) => excluded.has(t.id))
      .map((t) => ({
        id: t.id,
        feature: t.feature,
        title: t.title ?? '',
        files: t.files.map(normalise),
        reason: excluded.get(t.id),
      })),
    waves,
    warnings: staleReads(declared, laneOf, lanes),
    skipped: all
      .filter((t) => !PLANNABLE.has(t.status))
      .map((t) => ({ id: t.id, status: t.status })),
  };
}

/** Kahn's algorithm, breaking ties by document order so the result is stable. */
function orderTasks(group, edgesOf) {
  const ids = new Set(group.map((t) => t.id));
  const position = new Map(group.map((t, i) => [t.id, i]));
  const remaining = new Map(group.map((t) => [t.id, new Set(edgesOf(t).filter((d) => ids.has(d)))]));

  const out = [];
  while (out.length < group.length) {
    const free = group
      .filter((t) => remaining.has(t.id) && remaining.get(t.id).size === 0)
      .sort((a, b) => position.get(a.id) - position.get(b.id));

    // Cycles were excluded before lanes were built, so this cannot happen. If it
    // ever does, emitting the rest in document order is better than looping
    // forever, and the plan is still printed for a human to look at.
    if (!free.length) {
      for (const t of group) if (remaining.has(t.id)) out.push(t);
      break;
    }

    const next = free[0];
    out.push(next);
    remaining.delete(next.id);
    for (const set of remaining.values()) set.delete(next.id);
  }
  return out;
}

/**
 * Reads that will not see what they appear to be reading.
 *
 * A lane is branched from HEAD, so a task reading a file that another task
 * writes in the same run sees the version from before the run — unless it
 * declared that it runs after the writer. That is not an error and is not
 * refused: reading the pre-run version is legitimate and often what was meant.
 * It is reported because the two cases look identical in the document and only
 * one of them is what the author intended.
 */
function staleReads(declared, laneOf, lanes) {
  const wave = new Map(lanes.map((l) => [l.id, l.wave]));
  const position = new Map();
  for (const lane of lanes) lane.tasks.forEach((t, i) => position.set(t.id, i));

  const writers = new Map(); // written file -> [task id]
  for (const t of declared) {
    for (const f of t.files.map(normalise)) {
      if (!writers.has(f)) writers.set(f, []);
      writers.get(f).push(t.id);
    }
  }

  const runsAfter = (a, b) => {
    const laneA = laneOf.get(a);
    const laneB = laneOf.get(b);
    if (laneA === laneB) return position.get(a) > position.get(b);
    return wave.get(laneA) > wave.get(laneB);
  };

  const out = [];
  for (const t of declared) {
    for (const f of t.reads.map(normalise)) {
      for (const writer of writers.get(f) ?? []) {
        if (writer === t.id) continue;
        if (runsAfter(t.id, writer)) continue;
        out.push({
          task: t.id,
          reads: f,
          writtenBy: writer,
          message:
            `${t.id} reads ${f}, which ${writer} writes in this run, and does not declare ` +
            `Depende: ${writer} — it will see the version from before the run.`,
        });
      }
    }
  }
  // Deduplicated by the pair, because a lane merged out of several tasks can
  // otherwise report the same relationship more than once.
  const seen = new Set();
  return out.filter((w) => {
    const key = `${w.task}|${w.reads}|${w.writtenBy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One-screen rendering, so the plan can be read before it is run. */
export function renderPlan(plan) {
  const out = [];
  const waveCount = new Set(plan.lanes.map((l) => l.wave)).size;
  out.push(
    `run ${plan.runId ?? '(unnamed)'} — ${plan.lanes.length} lane(s) in ${waveCount} stage(s), ` +
      `max ${plan.maxParallel} at a time`
  );
  out.push('');
  for (const lane of plan.lanes) {
    const after = lane.after.length ? `  (after ${lane.after.join(', ')})` : '';
    out.push(`${lane.id}  ${lane.branch}${after}`);
    for (const t of lane.tasks) out.push(`    ${t.id}  ${t.title}`);
    out.push(`    writes: ${lane.files.join(', ')}`);
    if (lane.reads.length) out.push(`    reads : ${lane.reads.join(', ')}`);
    out.push('');
  }
  if (plan.sequential.length) {
    out.push('sequential remainder (never parallelised):');
    for (const t of plan.sequential) out.push(`    ${t.id}  ${t.title}  — ${t.reason}`);
    out.push('');
  }
  if (plan.warnings?.length) {
    out.push('reads that will not see this run\'s changes:');
    for (const w of plan.warnings) out.push(`    ${w.message}`);
    out.push('');
  }
  if (plan.skipped.length) {
    out.push(`not planned: ${plan.skipped.map((t) => `${t.id} [${t.status}]`).join(', ')}`);
  }
  return out.join('\n');
}
