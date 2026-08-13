// PRD-003-full-core: automated Function Point counting. Pure computation
// (summarize/weightFor/validateEntry) tested directly; disk-backed helpers
// against a real temp project, same shape as estimate.test.js/closure.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  FUNCTION_TYPES,
  COMPLEXITIES,
  validateEntry,
  hasSource,
  weightFor,
  summarize,
  confirmCount,
  loadDraft,
  loadWeights,
  loadConfirmed,
  countDraftPath,
  countConfirmedPath,
  fpWeightsPath,
  renderCountSummary,
} from '../src/core/count.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-count-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const config = { specDir: '.spec' };

const WEIGHTS = [
  { type: 'ALI', complexity: 'low', pf: 7 },
  { type: 'ALI', complexity: 'medium', pf: 10 },
  { type: 'ALI', complexity: 'high', pf: 15 },
  { type: 'EE', complexity: 'medium', pf: 4 },
];

// ------------------------------------------------------------- validateEntry

test('every function type and complexity is accepted @spec:AC-075', () => {
  for (const type of FUNCTION_TYPES) {
    for (const complexity of COMPLEXITIES) {
      assert.deepEqual(validateEntry({ name: 'x', type, complexity }), []);
    }
  }
});

test('an unknown type or complexity is a structural problem, not a silent pass @spec:AC-075', () => {
  assert.ok(validateEntry({ name: 'x', type: 'XYZ', complexity: 'low' }).length > 0);
  assert.ok(validateEntry({ name: 'x', type: 'EE', complexity: 'extreme' }).length > 0);
  assert.ok(validateEntry({ type: 'EE', complexity: 'low' }).length > 0, 'missing name');
});

// ----------------------------------------------------------------- hasSource

test('hasSource is false for absent, empty or whitespace-only source @spec:AC-076', () => {
  assert.equal(hasSource({}), false);
  assert.equal(hasSource({ source: '' }), false);
  assert.equal(hasSource({ source: '   ' }), false);
  assert.equal(hasSource({ source: 'PRD.md: "..."' }), true);
});

// ----------------------------------------------------------------- weightFor

test('weightFor looks up the exact type/complexity row @spec:AC-077', () => {
  assert.equal(weightFor({ type: 'ALI', complexity: 'medium' }, WEIGHTS), 10);
  assert.equal(weightFor({ type: 'EE', complexity: 'high' }, WEIGHTS), null, 'no row for EE/high in this fixture');
});

// ----------------------------------------------------------------- summarize

test('summarize totals only valid, sourced entries — FUNCTION_WITHOUT_SOURCE excluded, reported @spec:AC-077', () => {
  const entries = [
    { name: 'Create invoice', type: 'EE', complexity: 'medium', source: 'PRD.md: "creates an invoice"' },
    { name: 'Customer file', type: 'ALI', complexity: 'low', source: '' }, // no source
    { name: 'Bad type', type: 'NOPE', complexity: 'low', source: 'x' }, // invalid
  ];
  const s = summarize(entries, WEIGHTS);
  assert.equal(s.valid.length, 1);
  assert.equal(s.totalPf, 4);
  assert.equal(s.sourceless.length, 1);
  assert.equal(s.sourceless[0].name, 'Customer file');
  assert.equal(s.invalid.length, 1);
  assert.equal(s.invalid[0].entry.name, 'Bad type');
});

test('summarize with no entries totals zero @spec:AC-077', () => {
  const s = summarize([], WEIGHTS);
  assert.equal(s.totalPf, 0);
  assert.deepEqual(s.valid, []);
});

// ------------------------------------------------------------ renderCountSummary

test('renderCountSummary names every sourceless and invalid entry, not just the total @spec:AC-078', () => {
  const entries = [
    { name: 'Create invoice', type: 'EE', complexity: 'medium', source: 'PRD.md: "..."' },
    { name: 'No source here', type: 'ALI', complexity: 'low' },
  ];
  const text = renderCountSummary(summarize(entries, WEIGHTS));
  assert.match(text, /4 PF total/);
  assert.match(text, /Create invoice/);
  assert.match(text, /FUNCTION_WITHOUT_SOURCE/);
  assert.match(text, /No source here/);
});

// -------------------------------------------------------- disk-backed helpers

test('loadDraft is empty when the agent has not written one yet @spec:AC-079', () => {
  fresh((root) => {
    assert.deepEqual(loadDraft(root, config), []);
  });
});

test('loadDraft ignores a non-array file rather than crashing @spec:AC-079', () => {
  fresh((root) => {
    const p = countDraftPath(root, config);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ not: 'an array' }));
    assert.deepEqual(loadDraft(root, config), []);
  });
});

test('loadWeights is null when adp init never seeded fp-weights.json @spec:AC-079', () => {
  fresh((root) => {
    assert.equal(loadWeights(root, config), null);
  });
});

test('loadWeights reads the rows array back @spec:AC-079', () => {
  fresh((root) => {
    const p = fpWeightsPath(root, config);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ rows: WEIGHTS }));
    assert.deepEqual(loadWeights(root, config), WEIGHTS);
  });
});

test('loadConfirmed is null before adp estimate --confirm ever ran @spec:AC-080', () => {
  fresh((root) => {
    assert.equal(loadConfirmed(root, config), null);
  });
});

test('confirmCount writes only the valid, sourced entries and their total @spec:AC-080', () => {
  fresh((root) => {
    const entries = [
      { name: 'Create invoice', type: 'EE', complexity: 'medium', source: 'PRD.md: "..."' },
      { name: 'No source', type: 'ALI', complexity: 'low' },
    ];
    const record = confirmCount(root, config, { entries, table: WEIGHTS, confirmedBy: 'Ada <ada@example.com>' });
    assert.equal(record.entries.length, 1);
    assert.equal(record.totalPf, 4);
    assert.equal(record.confirmedBy, 'Ada <ada@example.com>');
    assert.ok(record.confirmedAt);

    const reloaded = loadConfirmed(root, config);
    assert.deepEqual(reloaded, record);
    const written = JSON.parse(readFileSync(countConfirmedPath(root, config), 'utf8'));
    assert.equal(written.totalPf, 4);
  });
});
