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
import { execFileSync } from 'child_process';
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

// What `npm pack` would actually publish, asked once and shared by the locks
// below. This is the only place in the suite that answers the question the
// allowlist merely expresses an intention about.
function publishedFiles() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out)[0].files.map((f) => f.path);
}

test('every published file was named by the allowlist @principle:P-005', () => {
  // CI ran `npm pack --dry-run` and threw the output away, which passes whatever
  // is in the tarball — a check that buys confidence without giving any. While
  // preparing 0.4.1 a generated proof file was found sitting in the pack output,
  // because `files` outranks .gitignore; it was caught by reading that output by
  // hand, which is exactly the part that does not scale.
  //
  // The expectation is deliberately a rule and not a list of 106 paths: a list
  // would fail on every new source file, and a lock that cries wolf gets
  // deleted. What must hold is narrower and permanent — nothing ships that the
  // allowlist did not ask for.
  const roots = pkg.files.filter((f) => !f.startsWith('!'));
  // npm publishes these whatever `files` says, so they are not evidence of a leak.
  const unconditional = new Set(['package.json', 'README.md', 'LICENSE', 'LICENCE']);

  const stray = publishedFiles().filter((p) => {
    if (unconditional.has(p)) return false;
    return !roots.some((r) => (r.endsWith('/') ? p.startsWith(r) : p === r));
  });

  assert.deepEqual(stray, [], `published but not named in files[]:\n  ${stray.join('\n  ')}`);
});

test('generated and secret-shaped files never reach the tarball @principle:P-005', () => {
  // The allowlist check above cannot catch these on its own: each one lives
  // inside a directory that is legitimately published. They are the things
  // whose presence is silent and whose cost is not.
  const forbidden = [
    [/(^|\/)\.spec\/verification\/.*\.json$/, 'proof is generated per run and stale once committed'],
    [/(^|\/)node_modules\//, 'a vendored tree is never intended'],
    [/\.tgz$/, 'a tarball inside the tarball'],
    [/(^|\/)\.env(\.|$)/, 'environment files carry credentials'],
    [/\.(pem|key|p12|pfx)$/, 'private key material'],
    [/(^|\/)id_(rsa|ed25519|ecdsa)(\.|$)/, 'ssh key material'],
    [/(^|\/)\.npmrc$/, 'may contain a registry auth token'],
    [/Zone\.Identifier/, 'WSL debris'],
    [/(^|\/)\.DS_Store$/, 'macOS debris'],
  ];

  const files = publishedFiles();
  const found = [];
  for (const [pattern, why] of forbidden) {
    for (const f of files.filter((p) => pattern.test(p))) found.push(`${f} — ${why}`);
  }

  assert.deepEqual(found, [], `must not be published:\n  ${found.join('\n  ')}`);
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
