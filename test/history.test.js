// PRD-003c-history-core: cross-project calibration history. Pure
// computation (observationsFor/renderComposition/validateImportedRecord/
// parseImportFile) tested directly; disk-backed helpers against a real
// temp project, same shape as closure.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  projectHash,
  historyPath,
  appendHistory,
  loadHistory,
  historyRecord,
  observationsFor,
  renderComposition,
  validateImportedRecord,
  parseImportFile,
  renderHistoryCsv,
} from '../src/core/history.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-history-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------- projectHash

test('projectHash is stable for the same project and never the literal path @spec:AC-082', () => {
  fresh((root) => {
    const a = projectHash(root);
    const b = projectHash(root);
    assert.equal(a, b);
    assert.doesNotMatch(a, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(a, /^sha256:[0-9a-f]{64}$/);
  });
});

test('projectHash differs for two different projects @spec:AC-082', () => {
  fresh((rootA) =>
    fresh((rootB) => {
      assert.notEqual(projectHash(rootA), projectHash(rootB));
    })
  );
});

// -------------------------------------------------------------- historyRecord

test('historyRecord never carries a project, feature or person name field @spec:AC-083', () => {
  const record = historyRecord({
    profile: 'business-crud/delivered',
    pf: 10,
    hours: 100,
    observedHoursPerFp: 10,
    deviationPct: 0,
    projectHash: 'sha256:abc',
    toolVersion: '0.6.0',
  });
  const keys = Object.keys(record);
  assert.deepEqual(
    keys.sort(),
    ['closedAt', 'deviationPct', 'hours', 'imported', 'observedHoursPerFp', 'pf', 'profile', 'projectHash', 'schemaVersion', 'toolVersion'].sort()
  );
  assert.equal(record.imported, false);
});

// ------------------------------------------------------- disk-backed helpers

test('loadHistory is empty when nothing has been closed yet @spec:AC-084', () => {
  fresh((stateDir) => {
    assert.deepEqual(loadHistory({ stateDir }), []);
  });
});

test('appendHistory then loadHistory round-trips @spec:AC-084', () => {
  fresh((stateDir) => {
    const record = historyRecord({
      profile: 'business-crud/delivered', pf: 10, hours: 100, observedHoursPerFp: 10,
      deviationPct: 0, projectHash: 'sha256:abc', toolVersion: '0.6.0',
    });
    appendHistory({ stateDir }, record);
    const loaded = loadHistory({ stateDir });
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].observedHoursPerFp, 10);
  });
});

test('a torn trailing line is skipped, not fatal @spec:AC-084', () => {
  fresh((stateDir) => {
    appendHistory({ stateDir }, historyRecord({
      profile: 'business-crud/delivered', pf: 10, hours: 100, observedHoursPerFp: 10,
      deviationPct: 0, projectHash: 'sha256:abc', toolVersion: '0.6.0',
    }));
    const p = historyPath({ stateDir });
    appendFileSync(p, '{"profile": "torn mid-writ');
    assert.equal(loadHistory({ stateDir }).length, 1);
  });
});

test('config.metrics.historyPath overrides the default state-dir location @spec:AC-085', () => {
  fresh((customDir) => {
    const customPath = path.join(customDir, 'shared-history.jsonl');
    const cfg = { metrics: { historyPath: customPath } };
    appendHistory(cfg, historyRecord({
      profile: 'business-crud/delivered', pf: 10, hours: 100, observedHoursPerFp: 10,
      deviationPct: 0, projectHash: 'sha256:abc', toolVersion: '0.6.0',
    }));
    assert.equal(historyPath(cfg), customPath);
    assert.equal(loadHistory(cfg).length, 1);
  });
});

// ------------------------------------------------------------ observationsFor

const RECORDS = [
  { profile: 'business-crud/delivered', observedHoursPerFp: 10, projectHash: 'own', imported: false },
  { profile: 'business-crud/delivered', observedHoursPerFp: 12, projectHash: 'other-project', imported: false },
  { profile: 'business-crud/delivered', observedHoursPerFp: 15, projectHash: 'other-project-2', imported: true },
  { profile: 'infra/never', observedHoursPerFp: 30, projectHash: 'own', imported: false }, // different profile
];

test('observationsFor filters by profile and splits own/other/imported @spec:AC-086', () => {
  const obs = observationsFor(RECORDS, 'business-crud/delivered', 'own');
  assert.deepEqual(obs.values.sort(), [10, 12, 15]);
  assert.equal(obs.own, 1);
  assert.equal(obs.other, 2);
  assert.equal(obs.imported, 1);
});

test('observationsFor with no matching profile returns an empty set @spec:AC-086', () => {
  const obs = observationsFor(RECORDS, 'mathematical/master', 'own');
  assert.deepEqual(obs.values, []);
  assert.equal(obs.own, 0);
  assert.equal(obs.other, 0);
});

// ---------------------------------------------------------- renderComposition

test('renderComposition is empty when there are no observations @spec:AC-087', () => {
  assert.equal(renderComposition({ values: [], own: 0, other: 0, imported: 0 }), '');
});

test('renderComposition always sums own + other to the total, imported noted only when > 0 @spec:AC-087', () => {
  const text = renderComposition({ values: [10, 12], own: 0, other: 2, imported: 0 });
  assert.equal(text, '2 observations — 0 from this project, 2 other');
  assert.doesNotMatch(text, /imported/);

  const withImported = renderComposition({ values: [10, 12, 15], own: 1, other: 2, imported: 1 });
  assert.equal(withImported, '3 observations — 1 from this project, 2 other (1 imported)');
});

test('renderComposition uses the singular for exactly one observation @spec:AC-087', () => {
  assert.equal(renderComposition({ values: [10], own: 1, other: 0, imported: 0 }), '1 observation — 1 from this project, 0 other');
});

// ------------------------------------------------------ validateImportedRecord

test('a well-formed record has no problems @spec:AC-088', () => {
  assert.deepEqual(
    validateImportedRecord({ schemaVersion: 1, profile: 'business-crud/delivered', observedHoursPerFp: 10, projectHash: 'sha256:x' }),
    []
  );
});

test('a record missing a required field is rejected @spec:AC-088', () => {
  assert.ok(validateImportedRecord({ profile: 'x' }).length > 0);
});

test('a record from a future schema version is rejected, not silently accepted @spec:AC-088', () => {
  const problems = validateImportedRecord({ schemaVersion: 99, profile: 'x', observedHoursPerFp: 1, projectHash: 'y' });
  assert.ok(problems.some((p) => p.includes('schemaVersion')));
});

// ---------------------------------------------------------------- parseImportFile

test('parseImportFile forces imported:true regardless of what the source claims @spec:AC-089', () => {
  const line = JSON.stringify({ schemaVersion: 1, profile: 'business-crud/delivered', observedHoursPerFp: 10, projectHash: 'sha256:x', imported: false });
  const { kept, skipped } = parseImportFile(line);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].imported, true);
  assert.equal(skipped.length, 0);
});

test('parseImportFile skips malformed and invalid lines, keeps the rest @spec:AC-089', () => {
  const good = JSON.stringify({ schemaVersion: 1, profile: 'x', observedHoursPerFp: 10, projectHash: 'y' });
  const content = [good, 'not json at all', JSON.stringify({ profile: 'missing fields' })].join('\n');
  const { kept, skipped } = parseImportFile(content);
  assert.equal(kept.length, 1);
  assert.equal(skipped.length, 2);
});

// ------------------------------------------------------------- renderHistoryCsv

test('renderHistoryCsv is one header row plus one row per record @spec:AC-090', () => {
  const csv = renderHistoryCsv([
    { closedAt: '2026-01-01T00:00:00Z', profile: 'business-crud/delivered', pf: 10, hours: 100, observedHoursPerFp: 10, deviationPct: 0, imported: false, toolVersion: '0.6.0', projectHash: 'sha256:x' },
  ]).trim().split('\n');
  assert.equal(csv.length, 2);
  assert.match(csv[0], /^closedAt,profile,pf,hours,observedHoursPerFp,deviationPct,imported,toolVersion,projectHash$/);
  assert.match(csv[1], /^2026-01-01T00:00:00Z,business-crud\/delivered,10,100,10,0,false,0\.6\.0,sha256:x$/);
});
