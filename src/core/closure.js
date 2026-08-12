// Closing the estimation loop — the local slice of SCOPE-0.6.0.md PRD-003c.
//
// `adp estimate` computes hours from a market-seeded, cold-start table.
// Nothing updates it from what actually happened — every estimate stays
// "opinion imported from a market figure," forever, unless something
// records the real outcome. `adp close --hours <n>` is that something.
//
// What this is NOT: cross-project history. PRD-003c's fuller design keeps
// `hours-history.jsonl` outside any single repository, anonymized by
// default, shared across projects via `adp metrics import/export`. This
// file only ever reads and writes inside ONE project's own `.spec/` — the
// closures recorded here recalibrate this project's own table, and travel
// no further. Real, separate privacy-design surface, deliberately not
// opened here.
//
// "Horas declaradas são declaração, não prova" — same category as
// `verification(gate)` in the constitution. Nothing here is a gate.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

export function closurePath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'closures.jsonl');
}

export function appendClosure(rootDir, config, record) {
  const p = closurePath(rootDir, config);
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(record) + '\n');
}

/**
 * Every closure recorded so far. A torn trailing line — a process killed
 * mid-append — is skipped, not fatal, the same tolerance `ledger.js` already
 * applies to its own append-only log for the same reason.
 */
export function loadClosures(rootDir, config) {
  const p = closurePath(rootDir, config);
  if (!existsSync(p)) return [];
  const closures = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      closures.push(JSON.parse(line));
    } catch {
      /* a torn trailing line is expected, not corruption worth failing over */
    }
  }
  return closures;
}

/**
 * Build one closure record. `hours` is the one field nothing else can
 * supply. Everything tied to the estimate (PF, the row it used, the
 * declared range) is carried along so the record means something on its
 * own, even if `hours-per-fp.json` changes shape later.
 */
export function recordClosure({ hours, note, estimate }) {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('--hours must be a positive number');
  }
  const pf = estimate?.pf ?? null;
  const observedHoursPerFp = pf ? Math.round((hours / pf) * 10) / 10 : null;
  const deviationPct =
    estimate?.hours?.likely
      ? Math.round(((hours - estimate.hours.likely) / estimate.hours.likely) * 1000) / 10
      : null;

  return {
    closedAt: new Date().toISOString(),
    pf,
    rowUsed: estimate?.rowUsed ?? null,
    estimate: estimate ? { low: estimate.hours.low, likely: estimate.hours.likely, high: estimate.hours.high, source: estimate.source } : null,
    hours,
    observedHoursPerFp,
    deviationPct,
    note: note ?? null,
  };
}

/**
 * Recalibrate one hours-per-fp.json row from the observed h/PF figures
 * recorded against it so far (this closure included). A simplified
 * version of PRD-003c's regime table — real percentiles need more than a
 * handful of points to mean anything, so this blends toward the observed
 * data rather than claiming a P50/P75/P90 split with 3 observations:
 *
 *   1 observation  — `likely` nudges 30% toward it; `low`/`high` hold.
 *   2 observations — `likely` becomes a 50/50 blend with their mean.
 *   3–5            — `likely` becomes their mean; `low`/`high` widen
 *                     (never shrink) to include the observed min/max.
 *   6+             — `low`/`likely`/`high` become the observed set's own
 *                     min/mean/max — the row is this team's data now, not
 *                     the market's.
 */
export function recalibrateRow(row, observedHoursPerFpList) {
  const n = observedHoursPerFpList.length;
  if (n === 0) return row;

  const round1 = (x) => Math.round(x * 10) / 10;
  const mean = observedHoursPerFpList.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...observedHoursPerFpList);
  const max = Math.max(...observedHoursPerFpList);

  let low = row.low;
  let likely = row.likely;
  let high = row.high;

  if (n === 1) {
    likely = row.likely * 0.7 + observedHoursPerFpList[0] * 0.3;
  } else if (n === 2) {
    likely = row.likely * 0.5 + mean * 0.5;
  } else if (n <= 5) {
    likely = mean;
    low = Math.min(row.low, min);
    high = Math.max(row.high, max);
  } else {
    low = min;
    likely = mean;
    high = max;
  }

  return {
    ...row,
    low: round1(low),
    likely: round1(likely),
    high: round1(high),
    source: 'measured',
    observations: n,
    updatedAt: new Date().toISOString(),
  };
}

/** The label `adp report`/`adp close` print — never a bare number alone. */
export function calibrationLabel(observations) {
  if (!observations) return 'no calibration';
  if (observations <= 2) return `no calibration — ${observations} observation(s)`;
  if (observations <= 5) return 'partial calibration';
  return 'calibrated';
}

/**
 * Write the table back, keeping whatever top-level fields it already had
 * (`_comment`, seeded from `payload/metrics/hours-per-fp.default.json`) —
 * only `rows` changes.
 */
export function saveHoursTable(rootDir, config, rows) {
  const p = path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'hours-per-fp.json');
  let existing = {};
  if (existsSync(p)) {
    try {
      existing = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      /* an unreadable table is replaced wholesale rather than blocking a close */
    }
  }
  writeFileSync(p, JSON.stringify({ ...existing, rows }, null, 2) + '\n');
}
