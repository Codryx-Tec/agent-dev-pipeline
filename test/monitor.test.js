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
import { createMonitor, startMonitor, renderPage } from '../src/server/server.js';
import { loadConfig } from '../src/config.js';
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
  writeFileSync(
    path.join(root, '.spec', 'features', 'demo', 'PRD.md'),
    '# PRD\n\n### US-001 — A story\n\n#### AC-001 — A criterion\n\n' +
      '- **Given** a thing\n- **When** something\n- **Then** a result\n'
  );
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'RFC.md'), '# RFC\n');
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'TDD.md'), '# TDD\n');
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
  assert.equal(state.gates.length, 6);
  assert.ok(state.gates.every((g) => ['green', 'red', 'blocked'].includes(g.state)));
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
