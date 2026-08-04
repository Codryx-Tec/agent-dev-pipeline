// The whole chain, offline, end to end.
//
// This is the strongest claim the README makes — *a project can go from empty
// folder to a proven, audited feature without any network access and without a
// GitHub account* — and until now it was the only claim with no test behind it.
//
// HOW "NO NETWORK" IS ASSERTED. Not by hoping. Every outbound primitive Node
// offers is replaced with one that throws and records: `net.Socket.connect`,
// `dns.lookup`, `dns.resolve`, `http.request`, `https.request`, and `fetch`. If
// any line of the engine reaches for the network during the run, the test fails
// naming the call. An assertion that merely runs with the wifi off would pass on
// a laptop and prove nothing in CI.
//
// The fixture is `.exemplo/`, copied into a temporary git repository with no
// remote. Using the shipped example rather than a hand-built one means this test
// also fails the day the example stops being a valid project — which is exactly
// when someone would otherwise discover it, months later, by trying it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, existsSync, rmSync, readFileSync, utimesSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import dns from 'dns';
import http from 'http';
import https from 'https';

import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';
import { auditProject } from '../src/core/audit.js';
import { evaluateGates, GATES } from '../src/core/gates.js';
import { runVerification, writeRecords, summarise } from '../src/core/verify.js';
import { TRUST_ENV } from '../src/core/trust.js';
import { git, isGitRepo } from '../src/core/executor.js';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The environment the chain runs under, with this test runner's fingerprints
 * wiped off.
 *
 * `NODE_TEST_CONTEXT` is set by `node --test` and inherited by any child. A
 * nested `node --test` sees it and switches from TAP to a serialised protocol
 * meant for a parent runner — so the example's suite would emit something the
 * TAP adapter cannot read, and this test would fail for a reason that has
 * nothing to do with being offline. Worth knowing beyond this file: an inherited
 * environment can change a test runner's output format, which is one more reason
 * `reporterOutputFile` is the more robust way to read results.
 */
function cleanEnv(extra = {}) {
  const env = { ...process.env, [TRUST_ENV]: '1', ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/**
 * Replace every way out of the process with a tripwire.
 *
 * Returns a restore function and the list of attempts, so the failure message
 * can name what was called rather than just asserting a count.
 */
function severTheNetwork() {
  const attempts = [];
  const trip = (name) => (...args) => {
    attempts.push(`${name}(${String(args[0] ?? '').slice(0, 60)})`);
    throw new Error(`network call attempted: ${name}`);
  };

  const saved = {
    connect: net.Socket.prototype.connect,
    lookup: dns.lookup,
    resolve: dns.resolve,
    httpRequest: http.request,
    httpsRequest: https.request,
    fetch: globalThis.fetch,
  };

  net.Socket.prototype.connect = trip('net.Socket.connect');
  dns.lookup = trip('dns.lookup');
  dns.resolve = trip('dns.resolve');
  http.request = trip('http.request');
  https.request = trip('https.request');
  globalThis.fetch = trip('fetch');

  return {
    attempts,
    restore() {
      net.Socket.prototype.connect = saved.connect;
      dns.lookup = saved.lookup;
      dns.resolve = saved.resolve;
      http.request = saved.httpRequest;
      https.request = saved.httpsRequest;
      globalThis.fetch = saved.fetch;
    },
  };
}

function offlineRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-offline-'));
  cpSync(path.join(ROOT, '.exemplo'), root, { recursive: true });
  // Any proof left in the working copy would let this test pass without ever
  // running the suite — the one shortcut that would make it meaningless.
  rmSync(path.join(root, '.spec', 'verification', 'class-enrolment.json'), { force: true });

  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'offline@example.com']);
  git(root, ['config', 'user.name', 'Offline']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'the example, offline']);
  return root;
}

test('the full chain closes with no remote and no network @spec:AC-018', () => {
  const root = offlineRepo();

  // The precondition the criterion names: a repository with no remote at all.
  assert.equal(isGitRepo(root), true);
  assert.equal(git(root, ['remote'], { allowFail: true }).stdout, '', 'there must be no remote');

  const severed = severTheNetwork();
  let result;
  try {
    const config = loadConfig(root);

    // 1. The documents parse, offline.
    const before = loadProject(config);
    assert.equal(before.scope.status, 'Approved');
    assert.ok(before.features.length >= 1);

    // 2. Nothing is proven yet — proof is earned here, not shipped.
    const dry = evaluateGates(auditProject(before, { ci: true }).findings);
    assert.equal(dry.firstRed, 'G4', 'without proof, G4 must be the first red gate');

    // 3. Verification runs the real suite as a child process.
    const verification = runVerification(before, config, { env: cleanEnv() });
    assert.equal(verification.parseError, null);
    assert.equal(verification.exitCode, 0, 'the example suite must pass');

    writeRecords(before, config, verification);
    assert.ok(
      existsSync(path.join(root, '.spec', 'verification', 'class-enrolment.json')),
      'proof must be written to disk'
    );

    // 4. Re-read from disk and audit. Every gate is evaluated, none skipped.
    const after = loadProject(loadConfig(root));
    const audit = auditProject(after, { ci: true });
    result = evaluateGates(audit.findings);

    assert.equal(result.gates.length, GATES.length, 'every gate must be evaluated');
    assert.ok(
      result.gates.every((g) => ['green', 'red', 'blocked'].includes(g.state)),
      'every gate must reach a state'
    );

    // 5. The verdict is an exit code, and here it is a clean one — under the
    //    STRICT posture, which is the bar that actually means something.
    assert.equal(typeof result.exitCode, 'number');
    assert.equal(
      result.exitCode,
      0,
      `the offline chain must close clean; first red was ${result.firstRed}`
    );

    const s = summarise(after, writeRecords(after, loadConfig(root), verification));
    assert.equal(s.unproven, 0, 'every criterion must be proven by the end');
  } finally {
    severed.restore();
  }

  // 6. And nothing reached for the network on the way.
  assert.deepEqual(
    severed.attempts,
    [],
    `the chain must not touch the network; attempted: ${severed.attempts.join(', ')}`
  );
});

test('the chain never invokes the GitHub CLI @spec:AC-018', () => {
  const root = offlineRepo();
  const config = loadConfig(root);

  // local-only is the default and is what makes the offline claim true: an
  // external service's rate limit must never be what stops you proving that
  // work is done (D-008).
  assert.equal(config.delivery, 'local-only');

  // A decoy rather than a stripped PATH. Removing `gh` and keeping `git` is not
  // portable — on this machine they share /usr/sbin — and "works without gh
  // installed" is the weaker claim anyway. This asserts the stronger one: given
  // every opportunity to call it, the chain does not.
  const bin = mkdtempSync(path.join(tmpdir(), 'adp-decoy-'));
  for (const name of ['gh', 'hub']) {
    const spy = path.join(bin, name);
    writeFileSync(spy, `#!/bin/sh\necho "$@" >> "${path.join(bin, 'CALLED')}"\nexit 0\n`);
    chmodSync(spy, 0o755);
  }

  const severed = severTheNetwork();
  try {
    const env = cleanEnv({ PATH: `${bin}:${process.env.PATH}` });
    const project = loadProject(config);
    const verification = runVerification(project, config, { env });
    assert.equal(verification.parseError, null);
    assert.equal(verification.exitCode, 0);
    writeRecords(project, config, verification);
    auditProject(loadProject(loadConfig(root)), { ci: true });
  } finally {
    severed.restore();
  }

  assert.equal(
    existsSync(path.join(bin, 'CALLED')),
    false,
    'the chain reached for a delivery CLI it was told it did not need'
  );
  assert.deepEqual(severed.attempts, []);
});

test('proof survives a fresh checkout, where every mtime is new @spec:AC-018', () => {
  // The failure this guards against is subtle and would only ever be noticed by
  // a user: proof recorded on one machine reading as stale on another, because
  // extraction rewrites every modification time. The git revision is what makes
  // it portable.
  const root = offlineRepo();
  const config = loadConfig(root);
  const project = loadProject(config);

  const verification = runVerification(project, config, { env: cleanEnv() });
  writeRecords(project, config, verification);

  const record = JSON.parse(
    readFileSync(path.join(root, '.spec', 'verification', 'class-enrolment.json'), 'utf8')
  );
  assert.ok(record.gitRev, 'the record must carry the revision it was taken at');
  assert.equal(record.gitDirty, false, 'and whether that revision described what was tested');

  // Touch everything, as an extraction would.
  const now = Date.now();
  for (const rel of ['src/enrolment.js', 'test/enrolment.test.js']) {
    utimesSync(path.join(root, rel), new Date(now + 60_000), new Date(now + 60_000));
  }

  const after = loadProject(loadConfig(root));
  const audit = auditProject(after, { ci: true });
  const stale = audit.findings.filter((f) => f.code === 'PROOF_STALE');
  assert.deepEqual(
    stale,
    [],
    'a newer mtime at the same commit must not invalidate proof'
  );
});
