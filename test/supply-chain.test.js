// Supply-chain invariants.
//
// These are not tests of behaviour — they are locks. Each one holds a property
// that is currently true, costs nothing to keep, and would be expensive to
// notice the loss of. A dependency added in a hurry, a postinstall script added
// "just for setup", a payload file that drifted from its manifest: none of those
// break a feature test, and all of them widen the attack surface of a package
// that writes executable hooks into other people's repositories.
//
// They run in CI on every push and again before publish.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyPayload, assertInside } from '../src/core/integrity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the package declares no runtime dependencies @principle:P-004', () => {
  // Zero dependencies is the single strongest defence this package has: there
  // is nothing to typosquat, nothing to compromise transitively, and nothing
  // whose maintainer can be socially engineered. Nothing enforced it before
  // this test — the property was true by habit.
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'dependencies must stay empty');
  assert.deepEqual(pkg.peerDependencies ?? {}, {}, 'peerDependencies must stay empty');
  assert.deepEqual(
    pkg.optionalDependencies ?? {},
    {},
    'optionalDependencies must stay empty — optional is still installed by default'
  );
});

test('the lockfile agrees that there are no dependencies @principle:P-004', () => {
  const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const installed = Object.keys(lock.packages ?? {}).filter((k) => k !== '');
  assert.deepEqual(installed, [], `lockfile lists packages: ${installed.join(', ')}`);
});

test('no lifecycle script runs on the installing machine @principle:P-005', () => {
  // preinstall/install/postinstall run automatically for anyone who installs the
  // package — that is arbitrary code execution on every user's machine, and it
  // is how a compromised package usually cashes out. prepare/prepublishOnly run
  // on the PUBLISHER's machine and are fine.
  const forbidden = ['preinstall', 'install', 'postinstall'];
  const present = forbidden.filter((s) => s in (pkg.scripts ?? {}));
  assert.deepEqual(present, [], `install-time scripts are forbidden: ${present.join(', ')}`);
});

test('the published file list is an allowlist, not an exclusion @principle:P-005', () => {
  // `files` is an allowlist: anything not named is not published. The failure
  // mode of the alternative (.npmignore) is silent and one-directional — a new
  // directory of secrets ships unless someone remembers to exclude it.
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'package.json needs a files allowlist');
  assert.ok(pkg.files.includes('payload/'), 'payload/ must ship or init has nothing to copy');
  assert.ok(!existsSync(path.join(ROOT, '.npmignore')), '.npmignore would override the files allowlist');
});

test('the payload matches its manifest @spec:AC-039 @principle:P-006', () => {
  const result = verifyPayload(path.join(ROOT, 'payload'));
  assert.notEqual(
    result.status,
    'absent',
    'payload/MANIFEST.json is missing — run: node scripts/build-manifest.js'
  );
  assert.equal(
    result.status,
    'ok',
    `payload does not match its manifest:\n${result.problems
      .map((p) => `  ${p.reason} ${p.file}`)
      .join('\n')}`
  );
});

test('the manifest covers every executable hook @spec:AC-039 @principle:P-006', () => {
  // The hooks are the sharpest thing in the payload: the harness executes them.
  // A manifest that happened to skip them would still report OK.
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'payload', 'MANIFEST.json'), 'utf8'));
  const hooks = Object.keys(manifest.files).filter((f) => f.endsWith('.sh'));
  assert.ok(hooks.length >= 3, `expected the shell hooks to be covered, found ${hooks.length}`);
});

test('a write escaping the project directory is refused @spec:AC-040 @principle:P-007', () => {
  const root = '/tmp/some-project';
  assert.doesNotThrow(() => assertInside(root, '/tmp/some-project/.spec/SCOPE.md'));
  assert.doesNotThrow(() => assertInside(root, path.join(root, 'a', 'b', 'c.md')));

  for (const escape of [
    '/tmp/some-project/../../etc/passwd',
    '/tmp/some-project/.spec/../../../.ssh/authorized_keys',
    '/etc/passwd',
    '/tmp/some-project-sibling/file.md', // prefix match is not containment
  ]) {
    assert.throws(() => assertInside(root, escape), /refusing to write outside/, escape);
  }
});

test('no Zone.Identifier debris reaches the payload @principle:P-006', () => {
  // WSL writes these beside downloaded files. They are not payload, they carry
  // no useful content, and they would be copied into every user's project.
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'payload', 'MANIFEST.json'), 'utf8'));
  const debris = Object.keys(manifest.files).filter((f) => f.includes('Zone.Identifier'));
  assert.deepEqual(debris, [], `debris in payload: ${debris.join(', ')}`);
});
