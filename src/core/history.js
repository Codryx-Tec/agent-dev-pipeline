// Cross-project calibration history — the shared slice of
// SCOPE-0.6.0.md PRD-003c. `closure.js` recalibrates one project's own
// table from its own closures; this file is what lets a team's fourth
// project start where the first three left off, instead of every project
// beginning at cold start forever.
//
// "O histórico é a verdade; a tabela é cache" — the shared file here is
// what actually feeds `recalibrateRow()` now; `.spec/metrics/closures.jsonl`
// (closure.js) still exists for its own project's audit trail and the
// deviation printout at `adp close` time, but no longer feeds the table.
//
// ONE DELIBERATE DEVIATION from PRD-003c's own text: the source design
// stores project/feature/person identity and strips it at export, by
// default. This file never stores that identity in the first place — a
// record carries only a `projectHash` (dedup, not identification), never a
// project or feature name, never a person. "Nada disso é necessário para
// calibrar" is the source document's own line; not writing a field is
// strictly safer than writing it and stripping it later, and a bug in the
// stripping step can leak — a field that was never written cannot.
//
// Same append-only, torn-line-tolerant shape `ledger.js`/`closure.js`
// already use for their own logs, copied rather than shared: five lines is
// not worth a dependency between three unrelated files.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { resolveStateDir, projectKey } from './trust.js';

export const SCHEMA_VERSION = 1;

/** `config.metrics.historyPath` overrides the default state-dir location — same override shape `config.stateDir` already has. */
export function historyPath(config = {}) {
  if (config.metrics?.historyPath) return path.resolve(config.metrics.historyPath);
  return path.join(resolveStateDir(config), 'metrics', 'hours-history.jsonl');
}

/** A stable, non-reversible identity for dedup — never the literal path. */
export function projectHash(rootDir) {
  return `sha256:${createHash('sha256').update(projectKey(rootDir)).digest('hex')}`;
}

export function appendHistory(config, record) {
  const p = historyPath(config);
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(record) + '\n');
}

/** Every history record so far. A torn trailing line is skipped, not fatal. */
export function loadHistory(config) {
  const p = historyPath(config);
  if (!existsSync(p)) return [];
  const records = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      /* a torn trailing line is expected, not corruption worth failing over */
    }
  }
  return records;
}

/** One minimal, anonymized record — no project, feature or person name, ever. */
export function historyRecord({ profile, pf, hours, observedHoursPerFp, deviationPct, projectHash: hash, toolVersion }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    closedAt: new Date().toISOString(),
    profile,
    pf,
    hours,
    observedHoursPerFp,
    deviationPct,
    toolVersion,
    projectHash: hash,
    imported: false,
  };
}

/**
 * Observations for one profile row, split for the composition line: `own`
 * (this project's own history entries), `other` (everyone else's — a
 * different local project sharing the same file, or something imported),
 * `imported` (the subset of `other` explicitly brought in via `adp metrics
 * import`). `values` is the plain h/PF number array `recalibrateRow()`
 * already takes.
 */
export function observationsFor(records, profileKey, thisProjectHash) {
  const matching = records.filter((r) => r.profile === profileKey && Number.isFinite(r.observedHoursPerFp));
  const own = matching.filter((r) => r.projectHash === thisProjectHash).length;
  const imported = matching.filter((r) => r.imported).length;
  return {
    values: matching.map((r) => r.observedHoursPerFp),
    own,
    other: matching.length - own,
    imported,
  };
}

/** Renders the composition line, or '' when there is nothing to report. */
export function renderComposition({ values, own, other, imported }) {
  if (!values.length) return '';
  const n = values.length;
  const suffix = imported > 0 ? ` (${imported} imported)` : '';
  return `${n} observation${n === 1 ? '' : 's'} — ${own} from this project, ${other} other${suffix}`;
}

const REQUIRED_FIELDS = ['schemaVersion', 'profile', 'observedHoursPerFp', 'projectHash'];

/** Structural problems with one imported record — [] means it's usable. */
export function validateImportedRecord(record) {
  const problems = [];
  if (typeof record !== 'object' || record === null) return ['not an object'];
  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null) problems.push(`missing "${field}"`);
  }
  if (record.schemaVersion !== undefined && record.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`unknown schemaVersion ${record.schemaVersion} (this tool reads ${SCHEMA_VERSION})`);
  }
  if (record.observedHoursPerFp !== undefined && !Number.isFinite(record.observedHoursPerFp)) {
    problems.push('"observedHoursPerFp" must be a number');
  }
  return problems;
}

/**
 * Reads an external `.jsonl`, keeps only structurally valid lines, and
 * forces `imported: true` regardless of what the source file claims —
 * provenance is not the importer's to assert.
 */
export function parseImportFile(content) {
  const kept = [];
  const skipped = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      skipped.push({ line, problems: ['not valid JSON'] });
      continue;
    }
    const problems = validateImportedRecord(record);
    if (problems.length) {
      skipped.push({ line, problems });
      continue;
    }
    kept.push({ ...record, imported: true });
  }
  return { kept, skipped };
}

export function renderHistoryCsv(records) {
  const header = 'closedAt,profile,pf,hours,observedHoursPerFp,deviationPct,imported,toolVersion,projectHash';
  const rows = records.map((r) =>
    [
      r.closedAt,
      r.profile,
      r.pf ?? '',
      r.hours ?? '',
      r.observedHoursPerFp ?? '',
      r.deviationPct ?? '',
      r.imported,
      r.toolVersion ?? '',
      r.projectHash,
    ].join(',')
  );
  return [header, ...rows].join('\n') + '\n';
}
