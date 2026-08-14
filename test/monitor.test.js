// The read-only monitor.
//
// The tests that matter here are the refusals. A dashboard that renders nicely
// is pleasant; a dashboard that cannot touch your project is the thing that was
// actually promised, and a promise nobody checks is a comment.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { rmSync } from 'fs';
import { createMonitor, startMonitor, renderPage } from '../src/server/server.js';
import { buildState } from '../src/server/state.js';
import { loadConfig } from '../src/config.js';
import { append } from '../src/core/ledger.js';
import { renderBaselineMd } from '../src/parsers/baseline.js';
import { buildPrompt } from '../src/core/prompts.js';
import http from 'http';

// Node's fetch (undici) silently DROPS a hand-set Host header, so a rebinding
// test written with fetch passes for the wrong reason — it never sends the
// header it is testing. node:http lets us set it, so the check is real.
function rawGet(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

let base;
let server;

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-monitor-'));
  mkdirSync(path.join(root, '.spec', 'features', 'demo'), { recursive: true });
  writeFileSync(
    path.join(root, '.spec', 'SCOPE.md'),
    '# Scope\n\n> status: Approved\n\nA scope.\n'
  );
  writeFileSync(path.join(root, '.spec', 'CONSTITUTION.md'), '# Constitution\n');
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'PRD.md'), '# PRD\n\n> rfcs: RFC-001\n');
  mkdirSync(path.join(root, '.spec', 'rfc'), { recursive: true });
  writeFileSync(
    path.join(root, '.spec', 'rfc', 'RFC-001-demo.md'),
    '### D-001 — x\n\n**Alternatives considered**\n\n1. *A.* a\n2. *B.* b\n\n**Decision: alternative 1 — a.**\n'
  );
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'DESIGN.md'), '# DESIGN\n');
  writeFileSync(
    path.join(root, '.spec', 'features', 'demo', 'SPEC.md'),
    '# SPEC\n\n### US-001 — A story\n\n#### AC-001 — A criterion\n\n' +
      '- **Given** a thing\n- **When** something\n- **Then** a result\n'
  );
  return root;
}

before(async () => {
  const root = fixture();
  const config = { ...loadConfig(root), rootDir: root };
  // Port 0: the OS picks a free one, so the suite never collides with a real
  // monitor or with a parallel run of itself.
  const started = await startMonitor(config, { port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});

after(() => {
  if (server) server.close();
});

test('the page is served self-contained, with no external reference @spec:AC-034', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<style>/, 'CSS must be inlined');
  assert.match(html, /<script>/, 'JS must be inlined');
  assert.doesNotMatch(html, /\{\{CSS\}\}|\{\{JS\}\}/, 'no placeholder may survive');
  // Any src=/href= pointing off-document would be a network request the page
  // promised never to make.
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(refs.filter((r) => !r.startsWith('#')), [], `external refs: ${refs}`);
});

test('every write method is refused @spec:AC-035', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await fetch(base + '/api/state', { method });
    assert.equal(res.status, 405, `${method} must be refused`);
    const body = await res.json();
    assert.match(body.error, /read-only/);
  }
});

test('a write is refused even at a path that does not exist @spec:AC-035', async () => {
  // The refusal must come from the method, not from routing. If it came from
  // routing, adding a route later would silently open a write path.
  const res = await fetch(base + '/anything/at/all', { method: 'POST' });
  assert.equal(res.status, 405);
});

test('a non-loopback Host header is refused @spec:AC-036', async () => {
  // Binding to 127.0.0.1 does not stop a page on the internet from resolving a
  // hostname to 127.0.0.1 and reading this API through the visitor's browser.
  const port = Number(new URL(base).port);
  const evil = await rawGet(port, '/api/state', { Host: 'evil.example' });
  assert.equal(evil.status, 403, 'a foreign Host must be refused');

  // ...and the loopback names must still work, or the guard is just an outage.
  for (const host of ['127.0.0.1:' + port, 'localhost:' + port]) {
    const ok = await rawGet(port, '/api/state', { Host: host });
    assert.equal(ok.status, 200, `Host: ${host} must be accepted`);
  }
});

test('the state reports gates and features @spec:AC-034', async () => {
  const res = await fetch(base + '/api/state');
  assert.equal(res.status, 200);
  const state = await res.json();
  assert.equal(state.gates.length, 7);
  assert.ok(state.gates.every((g) => ['green', 'red', 'blocked', 'n/a'].includes(g.state)));
  assert.equal(state.features.length, 1);
  assert.equal(state.features[0].name, 'demo');
  assert.ok(typeof state.fingerprint === 'string' && state.fingerprint.length > 0);
});

test('an unchanged project is reported without reparsing @spec:AC-037', async () => {
  const first = await (await fetch(base + '/api/state')).json();
  const again = await (
    await fetch(base + '/api/state?since=' + encodeURIComponent(first.fingerprint))
  ).json();
  assert.equal(again.unchanged, true);
  assert.equal(again.fingerprint, first.fingerprint);
});

test('nothing is proven without a verification record @spec:AC-034', async () => {
  // The absence of evidence must read as absence of proof. A page that showed
  // a criterion as proven because a document said so would be the exact lie the
  // whole tool exists to prevent.
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.features[0].counts.proven, 0);
  assert.ok(state.features[0].criteria.every((c) => c.proven === false));
});

test('an occupied port fails loudly and starts nothing @spec:AC-038', async () => {
  const root = fixture();
  const config = { ...loadConfig(root), rootDir: root };
  const first = await startMonitor(config, { port: 0 });
  try {
    await assert.rejects(
      () => startMonitor(config, { port: first.port }),
      /already in use/,
      'a taken port must reject rather than pick another'
    );
  } finally {
    first.server.close();
  }
});

test('the response carries no-store and anti-embedding headers @spec:AC-036', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
});

test('renderPage works without a server @spec:AC-034', () => {
  const html = renderPage();
  assert.match(html, /agent-dev-pipeline/);
  assert.ok(html.length > 5000, 'the assembled page should carry its CSS and JS');
});

// ------------------------------------------------- M5-monitor-core: new fields

function freshBuildStateProject(fn) {
  const root = fixture();
  const stateDir = mkdtempSync(path.join(tmpdir(), 'adp-monitor-state-'));
  try {
    const config = { ...loadConfig(root), rootDir: root, stateDir };
    return fn(root, config);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
}

test('run is null when adp run has never executed here @spec:AC-099', () => {
  freshBuildStateProject((root, config) => {
    const state = buildState(config);
    assert.equal(state.run, null);
  });
});

test('run reports a live lane while it is still going, and lanes/tasks from the ledger @spec:AC-099', () => {
  freshBuildStateProject((root, config) => {
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', taskId: 'T-001', type: 'task-started' });
    const state = buildState(config);
    assert.ok(state.run);
    assert.equal(state.run.live, true);
    assert.equal(state.run.lanes.length, 1);
    assert.equal(state.run.lanes[0].state, 'lane-started');
    assert.equal(state.run.tasks.length, 1);
    assert.equal(state.run.tasks[0].state, 'task-started');
  });
});

test('run reports live:false once every lane reaches a terminal state @spec:AC-099', () => {
  freshBuildStateProject((root, config) => {
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', type: 'lane-started' });
    append(config, { runId: '2026-01-01T00-00-00', laneId: 'lane-01', type: 'lane-merged' });
    const state = buildState(config);
    assert.equal(state.run.live, false);
  });
});

test('firstRedPrompt matches adp prompt\'s own text for whichever gate is first red @spec:AC-100', () => {
  freshBuildStateProject((root, config) => {
    // The shared fixture is not fully clean (its RFC predates
    // CONTEXT_WITHOUT_NUMBERS, its SCOPE.md predates the real grammar) —
    // fine for the other tests in this file, which don't care which gate
    // is red. This one only needs a REAL red gate to exist and its prompt
    // to match buildPrompt()'s own output for that gate — buildPrompt(null)
    // returning null for a clean project is already that function's own
    // contract, not new behavior this test needs to re-prove.
    const state = buildState(config);
    const redGate = state.gates.find((g) => g.state === 'red');
    assert.ok(redGate, 'the shared fixture is expected to have at least one red gate');
    assert.ok(state.firstRedPrompt);
    assert.match(state.firstRedPrompt, new RegExp(`Gate ${redGate.id}`));
    assert.equal(state.firstRedPrompt, buildPrompt(redGate));
  });
});

test('baseline reports present:false with a zero count when there is no BASELINE.md @spec:AC-101', () => {
  freshBuildStateProject((root, config) => {
    const state = buildState(config);
    assert.equal(state.baseline.present, false);
    assert.equal(state.baseline.fileCount, 0);
  });
});

test('baseline reports the file count, never the file list itself @spec:AC-101', () => {
  freshBuildStateProject((root, config) => {
    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit: 'abc123', generatedAt: new Date().toISOString(), files: ['src/a.js', 'src/b.js'] })
    );
    const state = buildState(config);
    assert.equal(state.baseline.present, true);
    assert.equal(state.baseline.fileCount, 2);
    assert.equal(state.baseline.commit, 'abc123');
    assert.equal(Object.prototype.hasOwnProperty.call(state.baseline, 'files'), false);
  });
});

test('estimate.lastClosure is null before any adp close, and the declared hours after @spec:AC-101', () => {
  freshBuildStateProject((root, config) => {
    const before = buildState(config);
    assert.equal(before.estimate, null);

    mkdirSync(path.join(root, '.spec', 'metrics'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'metrics', 'closures.jsonl'),
      JSON.stringify({ closedAt: '2026-01-01T00:00:00.000Z', hours: 42, pf: null, note: null }) + '\n'
    );
    const after = buildState(config);
    assert.equal(after.estimate.lastClosure.hours, 42);
  });
});

test('the server exports no write handler at all @spec:AC-035', () => {
  // A structural check, not a behavioural one: if someone adds a route that
  // reads a request body, this catches it before the refusal test would.
  const src = readFileSync(
    new URL('../src/server/server.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(src, /req\.on\(\s*['"]data['"]/, 'the server must never read a request body');
  assert.doesNotMatch(src, /writeFileSync|appendFileSync|unlinkSync|mkdirSync/, 'the server must never write to disk');
});
