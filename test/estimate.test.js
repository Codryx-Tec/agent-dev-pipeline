// PRD-003-core: hours declared from a human-entered PF count, never
// machine-counted. Pure computation (computeEstimate/render*) tested
// directly; profile/table loading tested against a real temp project,
// same as init.test.js's own fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  computeEstimate,
  renderEstimateMd,
  renderEstimateCsv,
  loadProfile,
  loadHoursTable,
  profilePath,
  hoursTablePath,
  APP_TYPES,
  FAMILIARITY_LEVELS,
} from '../src/core/estimate.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-estimate-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const DEFAULT_TABLE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '..', 'payload', 'metrics', 'hours-per-fp.default.json'), 'utf8')
).rows;

const config = { specDir: '.spec' };

test('every default table row is one of the 4 app types x 3 familiarity levels @spec:AC-065', () => {
  assert.equal(DEFAULT_TABLE.length, APP_TYPES.length * FAMILIARITY_LEVELS.length);
  for (const row of DEFAULT_TABLE) {
    const [appType, familiarity] = row.profile.split('/');
    assert.ok(APP_TYPES.includes(appType), row.profile);
    assert.ok(FAMILIARITY_LEVELS.includes(familiarity), row.profile);
    assert.equal(row.source, 'cold-start');
    assert.ok(row.low <= row.likely && row.likely <= row.high, `${row.profile}: low<=likely<=high`);
  }
});

test('computeEstimate multiplies PF by the matching row @spec:AC-065', () => {
  const profile = { appType: 'business-crud', familiarity: 'delivered', stack: 'node', declared: true };
  const est = computeEstimate({ pf: 10, profile, hoursTable: DEFAULT_TABLE });
  assert.equal(est.rowUsed, 'business-crud/delivered');
  assert.equal(est.usedFallback, false);
  assert.equal(est.hours.low, 80); // 10 * 8
  assert.equal(est.hours.likely, 120); // 10 * 12
  assert.equal(est.hours.high, 180); // 10 * 18
});

test('an unrecognized profile combination falls back, and says so @spec:AC-065', () => {
  const table = DEFAULT_TABLE.filter((r) => r.profile !== 'infra/never');
  const profile = { appType: 'infra', familiarity: 'never', stack: 'c', declared: true };
  const est = computeEstimate({ pf: 5, profile, hoursTable: table });
  assert.equal(est.usedFallback, true);
  assert.equal(est.rowUsed, 'business-crud/delivered');
});

test('a non-positive or non-numeric PF is refused @spec:AC-065', () => {
  const profile = { appType: 'business-crud', familiarity: 'delivered' };
  assert.throws(() => computeEstimate({ pf: 0, profile, hoursTable: DEFAULT_TABLE }), /positive/);
  assert.throws(() => computeEstimate({ pf: NaN, profile, hoursTable: DEFAULT_TABLE }), /positive/);
});

test('real-time, infra and mathematical are flagged as poorly measured by APF; business-crud is not @spec:AC-066', () => {
  for (const appType of ['real-time', 'infra', 'mathematical']) {
    const est = computeEstimate({ pf: 1, profile: { appType, familiarity: 'delivered' }, hoursTable: DEFAULT_TABLE });
    assert.equal(est.lowFit, true, appType);
  }
  const est = computeEstimate({ pf: 1, profile: { appType: 'business-crud', familiarity: 'delivered' }, hoursTable: DEFAULT_TABLE });
  assert.equal(est.lowFit, false);
});

test('limiarPF is hoursPerMonth divided by the row\'s high figure @spec:AC-066', () => {
  const profile = { appType: 'business-crud', familiarity: 'delivered' };
  const est = computeEstimate({ pf: 1, profile, hoursTable: DEFAULT_TABLE, hoursPerMonth: 160 });
  assert.equal(est.limiarPF, Math.round(160 / 18));
});

test('renderEstimateMd says plainly this is not proof, and shows the applicability caveat when it applies @spec:AC-066', () => {
  const est = computeEstimate({ pf: 10, profile: { appType: 'infra', familiarity: 'delivered' }, hoursTable: DEFAULT_TABLE });
  const md = renderEstimateMd(est, 'demo');
  assert.match(md, /not proof/);
  assert.match(md, /measures this app type poorly/);
  assert.match(md, /Function Points \(declared\)/);
});

test('renderEstimateCsv is one header row and one data row @spec:AC-066', () => {
  const est = computeEstimate({ pf: 10, profile: { appType: 'business-crud', familiarity: 'delivered' }, hoursTable: DEFAULT_TABLE });
  const csv = renderEstimateCsv(est, 'demo').trim().split('\n');
  assert.equal(csv.length, 2);
  assert.match(csv[0], /^project,appType,familiarity,pf,lowHours,likelyHours,highHours,source$/);
  assert.match(csv[1], /^demo,business-crud,delivered,10,/);
});

test('loadProfile returns the labelled default when adp profile never ran @spec:AC-065', () => {
  fresh((root) => {
    const profile = loadProfile(root, config);
    assert.equal(profile.declared, false);
    assert.equal(profile.appType, 'business-crud');
  });
});

test('loadProfile reads back what was declared @spec:AC-065', () => {
  fresh((root) => {
    const p = profilePath(root, config);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ appType: 'infra', familiarity: 'master', stack: 'rust' }));
    const profile = loadProfile(root, config);
    assert.equal(profile.declared, true);
    assert.equal(profile.appType, 'infra');
  });
});

test('loadHoursTable is null when adp init never seeded it @spec:AC-065', () => {
  fresh((root) => {
    assert.equal(loadHoursTable(root, config), null);
  });
});

test('loadHoursTable reads the rows array back @spec:AC-065', () => {
  fresh((root) => {
    const p = hoursTablePath(root, config);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ rows: DEFAULT_TABLE }));
    const table = loadHoursTable(root, config);
    assert.equal(table.length, DEFAULT_TABLE.length);
  });
});
