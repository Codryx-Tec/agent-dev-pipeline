// M6b (PRD-007): "the documentation enters DOC_FOSSIL's own scope" — a rule
// the tool applies to itself only elsewhere in the repository (payload docs,
// via AC-050) unless something also reads the top-level ones. This is that
// something: each assertion below is a fact PRD-007 named as already stale
// once (a version pin, a removed alias instruction, an old test count, a
// pre-0.6.0 file name) — catching it here means the next drift is a failing
// test, not a stale claim nobody notices until a reader trips over it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('README.md documents the ./adp wrapper, not a hand-written alias, as the default @spec:AC-117', () => {
  const readme = read('README.md');
  assert.match(readme, /\.\/adp/, 'the wrapper must be shown as the way to run commands');
  assert.doesNotMatch(
    readme,
    /alias adp=/,
    'a bare shell alias must not be presented as the default install step — that is what the wrapper replaced'
  );
});

test('README.md and INSTALL.md know about DEFERRALS.md, --strict and the seven gates @spec:AC-117', () => {
  for (const doc of ['README.md', 'INSTALL.md']) {
    const text = read(doc);
    assert.match(text, /DEFERRALS\.md/, `${doc} must mention declared deferral`);
    assert.match(text, /--strict/, `${doc} must mention audit --strict`);
    assert.match(text, /G0–G6|G0-G6/, `${doc} must describe seven gates, not six`);
  }
});

test('no top-level doc still pins an 0.4.x version or claims a stale test count @spec:AC-117', () => {
  for (const doc of ['README.md', 'README.pt-BR.md', 'INSTALL.md', 'ARCHITECTURE.md']) {
    const text = read(doc);
    assert.doesNotMatch(text, /@0\.4\.\d/, `${doc} must not pin an 0.4.x version as current`);
    assert.doesNotMatch(text, /\b(56|139|197) tests?\b/i, `${doc} must not claim a stale test count`);
  }
});

test('ARCHITECTURE.md describes the current four-document chain, not the pre-0.6.0 layout @spec:AC-117', () => {
  const arch = read('ARCHITECTURE.md');
  assert.match(arch, /DESIGN\.md/);
  assert.match(arch, /SPEC\.md/);
  assert.doesNotMatch(
    arch,
    /skill\/SKILL\.md/,
    'the singular pre-payload-restructure skill path must not be described as current'
  );
});

test('CI verifies and audits this repository\'s own .spec/ fresh, on every push @spec:AC-120', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /bin\/adp\.js verify/, 'CI must run this repository\'s own verify, not only .exemplo/\'s');
  assert.match(ci, /bin\/adp\.js audit --ci/, 'CI must audit this repository\'s own .spec/, not only .exemplo/\'s');
  // The step must run BEFORE the audit line, in source order, or the audit
  // would read a proof record from a previous run — or none at all.
  assert.ok(ci.indexOf('bin/adp.js verify') < ci.indexOf('bin/adp.js audit --ci'));
  const gitignore = read('.gitignore');
  assert.match(
    gitignore,
    /^\.spec\/verification\/\*\.json$/m,
    'a committed proof record is proof of the parent commit, not this one — it must be gitignored, not checked in'
  );
});

test('CHANGELOG.md names the exit-code and file-path breaks explicitly, old to new @spec:AC-117', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /G0–G5|G0-G5/);
  assert.match(changelog, /G0–G6|G0-G6/);
  assert.match(changelog, /TDD\.md/);
  assert.match(changelog, /DESIGN\.md/);
});
