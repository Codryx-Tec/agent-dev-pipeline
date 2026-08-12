// What the page is allowed to know.
//
// One function, project → a plain object. No I/O of its own beyond the read that
// `loadProject` already does, and no path back: nothing here can write.
//
// The fingerprint exists so the page can ask "has anything changed?" without the
// server reparsing every document. Stat-ing a few dozen files is cheap; parsing
// them is not, and a dashboard polling every few seconds must not become the
// most expensive process on the machine (ASM-006).

import { createHash } from 'crypto';
import { statSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { loadProject } from '../core/project.js';
import { auditProject } from '../core/audit.js';
import { evaluateGates, GATES } from '../core/gates.js';
import { projectCeremony } from '../core/ceremony.js';

/** Files whose modification time decides whether the state could have changed. */
function watchedPaths(config) {
  const root = config.rootDir ?? process.cwd();
  const out = [path.join(root, config.scopeFile ?? '.spec/SCOPE.md')];
  if (config.constitutionFile) out.push(path.join(root, config.constitutionFile));
  return out;
}

/**
 * A cheap signature of "could anything have changed?".
 *
 * Deliberately over-sensitive rather than precise: a false "changed" costs one
 * reparse, while a false "unchanged" shows the user stale state and calls it
 * current. The asymmetry decides the design.
 */
export function fingerprint(config, featuresDir) {
  const h = createHash('sha256');
  const seen = [];

  for (const p of watchedPaths(config)) {
    try {
      const s = statSync(p);
      seen.push(`${p}:${s.mtimeMs}:${s.size}`);
    } catch {
      seen.push(`${p}:absent`);
    }
  }

  // Feature documents: the things that actually move during a working session.
  const root = config.rootDir ?? process.cwd();
  const fdir = path.join(root, featuresDir ?? config.featuresDir ?? '.spec/features');
  if (existsSync(fdir)) {
    let entries = [];
    try {
      entries = readdirSync(fdir);
    } catch {
      entries = [];
    }
    for (const name of entries.sort()) {
      for (const doc of ['PRD.md', 'RFC.md', 'TDD.md']) {
        const p = path.join(fdir, name, doc);
        try {
          const s = statSync(p);
          seen.push(`${p}:${s.mtimeMs}:${s.size}`);
        } catch {
          /* a missing document is itself a state the audit reports */
        }
      }
    }
  }

  h.update(seen.join('|'));
  return h.digest('hex').slice(0, 16);
}

/** Build everything the page renders. Pure with respect to the filesystem. */
export function buildState(config) {
  const project = loadProject(config);
  const audit = auditProject(project, { ci: false });
  const strict = auditProject(project, { ci: true });
  const ceremony = projectCeremony(project.features);
  const evaluation = evaluateGates(audit.findings, { ceremony });

  const gates = evaluation.gates.map((g) => {
    const meta = GATES.find((x) => x.id === g.id);
    return {
      id: g.id,
      title: g.title ?? meta?.title ?? g.id,
      state: g.state,
      errors: g.errors ?? 0,
      warnings: g.warnings ?? 0,
      blockedBy: g.blockedBy ?? null,
      reason: g.reason ?? null,
      findings: (g.findings ?? []).map(shapeFinding),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    fingerprint: fingerprint(config, config.featuresDir),
    root: project.rootDir,
    configPath: config.configPath ?? null,
    scope: {
      present: project.scope?.present ?? false,
      status: project.scope?.status ?? null,
      decision: project.scope?.decision ?? 'pending',
      mvp: project.scope?.mvp ?? [],
    },
    backlog: {
      present: project.backlog?.present ?? false,
      items: project.backlog?.items?.length ?? 0,
    },
    gates,
    firstRed: evaluation.firstRed,
    exitCode: evaluation.exitCode,
    strictExitCode: evaluateGates(strict.findings, { ceremony }).exitCode,
    totals: {
      errors: audit.errors,
      warnings: audit.warnings,
      ...(audit.summary ?? {}),
      testFiles: project.testFiles.length,
      srcFiles: project.srcFiles.length,
      principles: project.constitution?.principles?.length ?? 0,
    },
    features: project.features.map((f) => shapeFeature(f, project, ceremony)),
    errors: project.errors ?? [],
  };
}

function shapeFinding(f) {
  return {
    code: f.code,
    severity: f.severity ?? 'error',
    message: f.message ?? '',
    file: f.file ?? null,
    line: f.line ?? null,
  };
}

function shapeFeature(f, project, ceremony) {
  const tasks = (f.spec?.tasks ?? []).map((t) => ({
    code: t.id,
    title: t.title ?? '',
    status: t.status ?? 'pending',
    statusValid: t.statusValid !== false,
    refs: t.refs ?? [],
    files: t.files ?? [],
    line: t.line ?? null,
  }));

  const record = project.verification?.[f.name] ?? null;
  const criteria = (f.spec?.acs ?? []).map((c) => ({
    code: c.id,
    title: c.title ?? '',
    complete: c.complete !== false,
    missingClauses: c.missingClauses ?? [],
    line: c.line ?? null,
    // "proven" is the engine's word, never the document's: a criterion is proven
    // when a verification record says a test PASSED, not when someone typed it.
    // With no record at all, nothing is proven — the absence of evidence is
    // read as absence of proof, which is the only safe direction. The record's
    // real shape is `results[id].status` (verify.js) — `criteria`/`verdict`
    // never existed there; this always read as 0 proven for every real record.
    proven: record?.results?.[c.id]?.status === 'pass',
  }));

  const featureCeremony = ceremony?.perFeature?.get(f.name) ?? null;

  return {
    name: f.name,
    dir: f.dir,
    hasPrd: f.hasPrd,
    // RFC is no longer a fixed sibling file (Q-001) — "has one" means the PRD
    // links at least one, whether or not that link resolves (the audit
    // already reports RFC_MISSING for a broken one).
    hasRfc: f.rfcRefs.length > 0,
    hasSpec: f.hasSpec,
    hasDesign: f.hasDesign,
    ceremony: featureCeremony
      ? { level: featureCeremony.level, signals: featureCeremony.signals }
      : null,
    // M2c-core: is this feature named in SCOPE.md's MVP checklist?
    inMvp: project.scope?.mvp?.includes(f.name) ?? false,
    stories: (f.spec?.stories ?? []).map((s) => ({
      code: s.id,
      title: s.title ?? '',
      line: s.line ?? null,
      acs: (s.acs ?? []).map((a) => a.id),
    })),
    criteria,
    tasks,
    counts: {
      stories: (f.spec?.stories ?? []).length,
      orphanAcs: (f.spec?.orphanAcs ?? []).length,
      criteria: criteria.length,
      proven: criteria.filter((c) => c.proven).length,
      tasks: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
    },
  };
}
