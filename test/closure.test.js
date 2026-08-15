// PRD-003c-core: closing the estimation loop locally. recordClosure/
// recalibrateRow/calibrationLabel are pure; closurePath/appendClosure/
// loadClosures/saveHoursTable touch a real temp project, mirroring
// ledger.js's own tolerance for a torn trailing line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  recordClosure,
  recalibrateRow,
  calibrationLabel,
  closurePath,
  appendClosure,
  loadClosures,
  saveHoursTable,
  capabilitiesExercised,
} from '../src/core/closure.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-closure-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const config = { specDir: '.spec' };

const ESTIMATE = {
  pf: 40,
  rowUsed: 'business-crud/delivered',
  source: 'cold-start',
  hours: { low: 320, likely: 480, high: 720 },
};

// ----------------------------------------------------------------- recordClosure

test('recordClosure computes observed h/PF and deviation against the estimate @spec:AC-072', () => {
  const c = recordClosure({ hours: 600, note: 'took longer', estimate: ESTIMATE });
  assert.equal(c.pf, 40);
  assert.equal(c.observedHoursPerFp, 15); // 600 / 40
  assert.equal(c.deviationPct, 25); // (600-480)/480 * 100
  assert.equal(c.note, 'took longer');
});

test('recordClosure works with no prior estimate — hours recorded alone @spec:AC-072', () => {
  const c = recordClosure({ hours: 100, note: null, estimate: null });
  assert.equal(c.pf, null);
  assert.equal(c.observedHoursPerFp, null);
  assert.equal(c.deviationPct, null);
  assert.equal(c.rowUsed, null);
});

test('recordClosure refuses a non-positive or non-numeric hours @spec:AC-072', () => {
  assert.throws(() => recordClosure({ hours: 0, estimate: null }), /positive/);
  assert.throws(() => recordClosure({ hours: NaN, estimate: null }), /positive/);
});

test('recordClosure defaults capabilities to empty when no caller supplies it @spec:AC-140', () => {
  const c = recordClosure({ hours: 100, estimate: null });
  assert.deepEqual(c.capabilities, { exercised: [], gaps: [] });
});

test('recordClosure carries whatever capabilitiesExercised() computed @spec:AC-140', () => {
  const c = recordClosure({ hours: 100, estimate: null, capabilities: { exercised: ['redis'], gaps: ['redis'] } });
  assert.deepEqual(c.capabilities, { exercised: ['redis'], gaps: ['redis'] });
});

// ------------------------------------------------------ capabilitiesExercised

const SCORED_RFC = (decidedOpt) => `# RFC: t

### D-005 — Where to cache session state

**Decision criteria:** W-001

**Options considered**

- **OPT-000 — Do nothing.** No new capability needed.
- **OPT-001 — Redis with TTL.** Requires: redis
- **OPT-002 — Postgres advisory locks.** Requires: postgres, sql

**Scoring matrix**

| Option | W-001 | Total |
|---|---|---|
| OPT-000 | 1 | 1 |
| OPT-001 | 5 | 5 |
| OPT-002 | 7 | 7 |

**Recommendation:** ${decidedOpt} — reason given.

**Decision: ${decidedOpt} — chosen.**
`;

test('capabilitiesExercised reads Requires: only from the DECIDED option, not every option considered @spec:AC-140', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.spec', 'rfc'), { recursive: true });
    writeFileSync(path.join(root, '.spec', 'rfc', 'RFC-001-t.md'), SCORED_RFC('OPT-001'));
    const result = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set());
    assert.deepEqual(result.exercised, ['redis']);
  });
});

test('capabilitiesExercised marks a tag as a gap only when it is outside the declared profile @spec:AC-140', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.spec', 'rfc'), { recursive: true });
    writeFileSync(path.join(root, '.spec', 'rfc', 'RFC-001-t.md'), SCORED_RFC('OPT-002'));
    const noneDeclared = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set());
    assert.deepEqual(noneDeclared.exercised.sort(), ['postgres', 'sql']);
    assert.deepEqual(noneDeclared.gaps.sort(), ['postgres', 'sql']);

    const partiallyDeclared = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set(['postgres']));
    assert.deepEqual(partiallyDeclared.gaps, ['sql']);

    const fullyDeclared = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set(['postgres', 'sql']));
    assert.deepEqual(fullyDeclared.gaps, []);
  });
});

test('capabilitiesExercised ignores an option that was considered but not chosen @spec:AC-140', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.spec', 'rfc'), { recursive: true });
    // OPT-000 (no Requires:) is what got decided — OPT-001/OPT-002's own
    // Requires: tags must never leak in just because they were on the table.
    writeFileSync(path.join(root, '.spec', 'rfc', 'RFC-001-t.md'), SCORED_RFC('OPT-000'));
    const result = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set());
    assert.deepEqual(result.exercised, []);
    assert.deepEqual(result.gaps, []);
  });
});

test('capabilitiesExercised with no .spec/rfc directory at all reports empty, not an error @spec:AC-140', () => {
  fresh((root) => {
    const result = capabilitiesExercised(root, { rfcDir: '.spec/rfc' }, new Set());
    assert.deepEqual(result, { exercised: [], gaps: [] });
  });
});

// -------------------------------------------------------------- recalibrateRow

const ROW = { profile: 'business-crud/delivered', low: 8, likely: 12, high: 18, source: 'cold-start', observations: 0, updatedAt: null, updatedBy: null };

test('0 observations leaves the row untouched @spec:AC-073', () => {
  const row = recalibrateRow(ROW, []);
  assert.deepEqual(row, ROW);
});

test('1 observation nudges likely 30% toward it, low/high hold @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [15]);
  assert.equal(row.likely, 12.9); // 12*0.7 + 15*0.3
  assert.equal(row.low, 8);
  assert.equal(row.high, 18);
  assert.equal(row.source, 'measured');
  assert.equal(row.observations, 1);
});

test('2 observations blend likely 50/50 with their mean @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [15, 10]);
  assert.equal(row.likely, 12.3); // 12*0.5 + mean(15,10)*0.5 = 6 + 6.25 = 12.25 -> 12.3
});

test('an n=1 outlier that would otherwise push likely past high widens the band instead — low <= likely <= high always holds @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [100]); // way past ROW.high (18)
  assert.equal(row.likely, 38.4); // 12*0.7 + 100*0.3, unchanged math
  assert.ok(row.low <= row.likely, `low ${row.low} must be <= likely ${row.likely}`);
  assert.ok(row.likely <= row.high, `likely ${row.likely} must be <= high ${row.high}`);
  assert.equal(row.high, 100); // widened to include the observation itself
});

test('an n=2 outlier below the floor widens low downward too @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [100, 0.5]);
  assert.ok(row.low <= row.likely && row.likely <= row.high);
  assert.equal(row.low, 0.5);
  assert.equal(row.high, 100);
});

test('3-5 observations set likely to the mean and widen low/high to include the extremes @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [15, 13, 20]);
  assert.equal(row.likely, 16); // mean(15,13,20)
  assert.equal(row.low, 8); // min(8, 13) unchanged — table floor already below observed
  assert.equal(row.high, 20); // max(18, 20) widened
});

test('3-5 observations never shrink the range, only widen it @spec:AC-073', () => {
  // every observation inside the existing [8,18] band — low/high must not move
  const row = recalibrateRow(ROW, [10, 11, 12]);
  assert.equal(row.low, 8);
  assert.equal(row.high, 18);
});

test('6+ observations become the observed set\'s own min/mean/max @spec:AC-073', () => {
  const row = recalibrateRow(ROW, [15, 13, 20, 11, 9, 22]);
  assert.equal(row.low, 9);
  assert.equal(row.high, 22);
  assert.equal(row.likely, 15); // mean(15,13,20,11,9,22) = 90/6
});

// ------------------------------------------------------------- calibrationLabel

test('calibrationLabel names each regime @spec:AC-073', () => {
  assert.equal(calibrationLabel(0), 'no calibration');
  assert.equal(calibrationLabel(1), 'no calibration — 1 observation(s)');
  assert.equal(calibrationLabel(2), 'no calibration — 2 observation(s)');
  assert.equal(calibrationLabel(3), 'partial calibration');
  assert.equal(calibrationLabel(5), 'partial calibration');
  assert.equal(calibrationLabel(6), 'calibrated');
  assert.equal(calibrationLabel(20), 'calibrated');
});

// -------------------------------------------------------- disk-backed helpers

test('loadClosures is empty when adp close never ran @spec:AC-074', () => {
  fresh((root) => {
    assert.deepEqual(loadClosures(root, config), []);
  });
});

test('appendClosure then loadClosures round-trips @spec:AC-074', () => {
  fresh((root) => {
    const c = recordClosure({ hours: 100, estimate: null });
    appendClosure(root, config, c);
    const closures = loadClosures(root, config);
    assert.equal(closures.length, 1);
    assert.equal(closures[0].hours, 100);
  });
});

test('a torn trailing line is skipped, not fatal — same tolerance as the ledger @spec:AC-074', () => {
  fresh((root) => {
    const p = closurePath(root, config);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(recordClosure({ hours: 50, estimate: null })) + '\n');
    appendFileSync(p, '{"hours": 30, "closedAt": "2026-0'); // torn mid-write
    const closures = loadClosures(root, config);
    assert.equal(closures.length, 1);
    assert.equal(closures[0].hours, 50);
  });
});

test('saveHoursTable preserves top-level fields like _comment, only rows change @spec:AC-074', () => {
  fresh((root) => {
    const p = path.join(root, '.spec', 'metrics', 'hours-per-fp.json');
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ _comment: 'seed', rows: [ROW] }));
    saveHoursTable(root, config, [{ ...ROW, likely: 99 }]);
    const written = JSON.parse(readFileSync(p, 'utf8'));
    assert.equal(written._comment, 'seed');
    assert.equal(written.rows[0].likely, 99);
  });
});
