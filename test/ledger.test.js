// M5-monitor-core: latestRunId is what lets the monitor find "the current
// run" without the caller already knowing its id.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { append, latestRunId } from '../src/core/ledger.js';

function fresh(fn) {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'adp-ledger-'));
  try {
    return fn({ stateDir });
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

test('latestRunId is null when nothing has ever run @spec:AC-098', () => {
  fresh((config) => {
    assert.equal(latestRunId(config), null);
  });
});

test('latestRunId is the one run, when there is only one @spec:AC-098', () => {
  fresh((config) => {
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    assert.equal(latestRunId(config), '2026-01-01T00-00-00');
  });
});

test('latestRunId picks the most recent of several runs, regardless of write order @spec:AC-098', () => {
  fresh((config) => {
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    append(config, { runId: '2026-03-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    append(config, { runId: '2026-02-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    assert.equal(latestRunId(config), '2026-03-01T00-00-00');
  });
});
