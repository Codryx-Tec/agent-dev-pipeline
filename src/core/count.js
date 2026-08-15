// Automated Function Point counting — the AI-proposes/human-confirms slice
// of SCOPE-0.6.0.md PRD-003.
//
// The draft is where the AI proposes, and it is a FILE, not a new command —
// the same pattern `> signals:` in PRD.md already uses: a human or agent
// writes structured data directly, and the engine only validates and
// computes. `.spec/metrics/count-draft.json` is an array the calling agent
// writes by hand while reading the PRD/SCOPE, one entry per counted
// function, each citing the exact line that justifies it.
//
// Complexity (low/medium/high) is asserted directly, not derived from CPM
// 4.3.1's formal DET/RET/FTR counts — the same posture ceremony signals and
// MVP placement already take: trust a declared judgment call, cited, over a
// formula this pass does not build. `source` is the accountability
// mechanism; an entry without one is excluded from the total and reported,
// never silently dropped and never silently counted.
//
// Nothing here is a gate. `PROFILE_UNDECLARED`/`ESTIMATE_UNCONFIRMED`/
// `ESTIMATE_STALE`/`FUNCTION_WITHOUT_SOURCE` in SCOPE-0.6.0.md's own table
// are printed findings, not audit.js/gates.js findings — the same
// declarative, non-blocking posture already chosen three times this session
// for the rest of this family (adp report's decision field, adp estimate
// itself, adp close). "O motor não veta o projeto."

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';

export const FUNCTION_TYPES = ['ALI', 'AIE', 'EE', 'CE', 'SE'];
export const COMPLEXITIES = ['low', 'medium', 'high'];

export function countDraftPath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'count-draft.json');
}

export function countConfirmedPath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'count-confirmed.json');
}

export function fpWeightsPath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'fp-weights.json');
}

/** The draft array, or [] when the agent hasn't written one yet. */
export function loadDraft(rootDir, config) {
  const p = countDraftPath(rootDir, config);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadWeights(rootDir, config) {
  const p = fpWeightsPath(rootDir, config);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')).rows ?? [];
  } catch {
    return null;
  }
}

/** The confirmed count, or null when `adp estimate --confirm` never ran. */
export function loadConfirmed(rootDir, config) {
  const p = countConfirmedPath(rootDir, config);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Structural problems with one draft entry — an empty array means it's valid. */
export function validateEntry(entry) {
  const problems = [];
  if (typeof entry.name !== 'string' || !entry.name.trim()) problems.push('missing "name"');
  if (!FUNCTION_TYPES.includes(entry.type)) {
    problems.push(`"type" must be one of ${FUNCTION_TYPES.join(', ')}`);
  }
  if (!COMPLEXITIES.includes(entry.complexity)) {
    problems.push(`"complexity" must be one of ${COMPLEXITIES.join(', ')}`);
  }
  return problems;
}

/** True when the entry cites something a human could go check. */
export function hasSource(entry) {
  return typeof entry.source === 'string' && entry.source.trim().length > 0;
}

export function weightFor(entry, table) {
  const row = table.find((r) => r.type === entry.type && r.complexity === entry.complexity);
  return row ? row.pf : null;
}

/**
 * Structural validation plus the PF total — FUNCTION_WITHOUT_SOURCE's
 * behavior (excluded from the total, reported) applied here, not as a gate
 * finding. `invalid` entries (bad type/complexity) are reported separately
 * and also excluded — a total is only as honest as every row that fed it.
 */
export function summarize(entries, table) {
  const valid = [];
  const invalid = [];
  const sourceless = [];
  let totalPf = 0;

  for (const entry of entries) {
    const problems = validateEntry(entry);
    if (problems.length) {
      invalid.push({ entry, problems });
      continue;
    }
    const pf = weightFor(entry, table);
    if (!hasSource(entry)) {
      sourceless.push({ ...entry, pf });
      continue;
    }
    valid.push({ ...entry, pf });
    totalPf += pf;
  }

  return { valid, invalid, sourceless, totalPf };
}

/** `git config user.name <email>`, falling back when git or the config is absent. */
export function currentAttribution(cwd) {
  const get = (key) => {
    const proc = spawnSync('git', ['config', key], { cwd, encoding: 'utf8' });
    return proc.status === 0 ? proc.stdout.trim() : '';
  };
  const name = get('user.name') || process.env.USER || 'unknown';
  const email = get('user.email');
  return email ? `${name} <${email}>` : name;
}

/** Printed by both `--review` and `--confirm`, so the human sees the exact same thing before saying yes. */
export function renderCountSummary(summary) {
  const out = [];
  out.push(`${summary.valid.length} function(s) counted, ${summary.totalPf} PF total:`);
  out.push('');
  for (const e of summary.valid) {
    out.push(`  [${e.type} ${e.complexity}, ${e.pf} PF] ${e.name} — ${e.source}`);
  }
  if (summary.sourceless.length) {
    out.push('');
    out.push(`FUNCTION_WITHOUT_SOURCE — excluded from the total, no source cited:`);
    for (const e of summary.sourceless) {
      out.push(`  [${e.type} ${e.complexity}] ${e.name}`);
    }
  }
  if (summary.invalid.length) {
    out.push('');
    out.push('invalid entries, excluded from the total:');
    for (const { entry, problems } of summary.invalid) {
      out.push(`  ${entry.name ?? '(unnamed)'} — ${problems.join('; ')}`);
    }
  }
  return out.join('\n');
}

export function confirmCount(rootDir, config, { entries, table, confirmedBy }) {
  const { valid, totalPf } = summarize(entries, table);
  const record = {
    entries: valid,
    totalPf,
    confirmedBy,
    confirmedAt: new Date().toISOString(),
  };
  const p = countConfirmedPath(rootDir, config);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(record, null, 2) + '\n');
  return record;
}
