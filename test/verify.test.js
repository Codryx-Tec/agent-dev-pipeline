// Proof.
//
// These tests exist because `verify` is the one component whose bugs are
// invisible in the worst direction: a parser that quietly drops results, or
// counts a skip as a pass, produces a green board over unproven code. Every
// assertion below is about refusing to grant proof, not about granting it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { parseTap } from '../src/core/reporters/tap.js';
import { parseVitestJson } from '../src/core/reporters/vitest.js';
import { parseJUnit } from '../src/core/reporters/junit.js';
import { parseWith } from '../src/core/reporters/index.js';
import {
  runVerification,
  writeRecords,
  summarise,
  foldResults,
  criteriaIn,
  VerifyRefused,
} from '../src/core/verify.js';
import { grantTrust, TRUST_ENV } from '../src/core/trust.js';
import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';

// Fixture annotations are built at runtime, never written as contiguous text.
//
// The annotation scanner reads SOURCE FILES, and it cannot tell a fixture from
// the real thing. A criterion code spelled out in full inside a fixture does two
// kinds of damage: it reports as an orphan once that code is retired, and — far
// worse — it credits a real criterion with having a test that does not test it.
//
// Splitting the string means the scanner finds nothing while the parser under
// test still receives exactly the text it would meet in the wild. This comment
// deliberately contains no full annotation either, for the same reason.
const tag = (id) => '@spec:' + id;


// ---------------------------------------------------------------- reporters

test('TAP: a skipped test is never read as a pass @spec:AC-017', () => {
  // The trap: TAP reports a skipped test as `ok`. A parser that only looks at
  // ok/not ok records every skip as proof, which is the exact lie the product
  // exists to prevent.
  const { tests } = parseTap(
    [
      'TAP version 13',
      `ok 1 - a passing test ${tag('AC-001')}`,
      `not ok 2 - a failing test ${tag('AC-002')}`,
      `ok 3 - a skipped test ${tag('AC-003')} # SKIP not ready`,
      `ok 4 - a todo test ${tag('AC-004')} # TODO later`,
    ].join('\n')
  );
  assert.deepEqual(
    tests.map((t) => t.status),
    ['pass', 'fail', 'skip', 'skip']
  );
  // The directive must not survive into the title, or the annotation matcher
  // sees different text than a human reading the same line.
  assert.equal(tests[2].title, `a skipped test ${tag('AC-003')}`);
});

test('TAP: output that is not TAP is an error, not an empty pass @spec:AC-016', () => {
  // The dangerous failure: unparseable output yielding zero results reads
  // identically to "nothing failed".
  const { tests, error } = parseTap('✔ some spec reporter output\n✔ another line\n');
  assert.deepEqual(tests, []);
  assert.match(error, /no TAP result lines/);
});

test('vitest JSON: every non-passing status collapses to skip or fail @spec:AC-017', () => {
  const { tests } = parseVitestJson(
    JSON.stringify({
      testResults: [
        {
          assertionResults: [
            { fullName: `a ${tag('AC-001')}`, status: 'passed' },
            { fullName: `b ${tag('AC-002')}`, status: 'failed' },
            { fullName: `c ${tag('AC-003')}`, status: 'skipped' },
            { fullName: `d ${tag('AC-004')}`, status: 'pending' },
            { fullName: `e ${tag('AC-005')}`, status: 'todo' },
            { fullName: `f ${tag('AC-006')}`, status: 'something-new' },
          ],
        },
      ],
    })
  );
  assert.deepEqual(
    tests.map((t) => t.status),
    ['pass', 'fail', 'skip', 'skip', 'skip', 'skip']
  );
});

test('JUnit: failure, error and skipped are all distinguished from pass @spec:AC-017', () => {
  const { tests } = parseJUnit(
    `<testsuite>
      <testcase classname="m" name="a ${tag('AC-001')}"/>
      <testcase classname="m" name="b ${tag('AC-002')}"><failure>boom</failure></testcase>
      <testcase classname="m" name="c ${tag('AC-003')}"><error>boom</error></testcase>
      <testcase classname="m" name="d ${tag('AC-004')}"><skipped/></testcase>
     </testsuite>`
  );
  assert.deepEqual(
    tests.map((t) => t.status),
    ['pass', 'fail', 'fail', 'skip']
  );
  assert.equal(tests[0].title, `m a ${tag('AC-001')}`);
});

test('an unknown reporter is refused rather than guessed @spec:AC-016', () => {
  const { tests, error } = parseWith('nonsense', 'anything');
  assert.deepEqual(tests, []);
  assert.match(error, /unknown reporter/);
});

// ---------------------------------------------------------------- folding

test('a criterion claimed by several tests needs all of them to pass @spec:AC-016', () => {
  // Taking the best result would let a failing test hide behind a passing
  // neighbour — the same lie as counting a skip as proof.
  const results = foldResults([
    { title: `one ${tag('AC-001')}`, status: 'pass' },
    { title: `two ${tag('AC-001')}`, status: 'fail' },
    { title: `three ${tag('AC-002')}`, status: 'pass' },
    { title: `four ${tag('AC-002')}`, status: 'skip' },
    { title: `five ${tag('AC-003')}`, status: 'pass' },
  ]);
  assert.equal(results['AC-001'].status, 'fail', 'fail must beat pass');
  assert.equal(results['AC-002'].status, 'skip', 'skip must beat pass');
  assert.equal(results['AC-003'].status, 'pass');
});

test('one test may prove more than one criterion @spec:AC-016', () => {
  assert.deepEqual(criteriaIn(`does two things ${tag('AC-001')} ${tag('AC-002')}`), ['AC-001', 'AC-002']);
  assert.deepEqual(criteriaIn('no annotation here'), []);
});

// ---------------------------------------------------------------- end to end

function project(files, config = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-verify-'));
  mkdirSync(path.join(root, '.spec', 'features', 'demo'), { recursive: true });
  mkdirSync(path.join(root, 'test'), { recursive: true });
  writeFileSync(path.join(root, '.spec', 'SCOPE.md'), '# S\n\n**Scope status:** Approved\n');
  writeFileSync(path.join(root, '.spec', 'CONSTITUTION.md'), '# C\n');
  writeFileSync(
    path.join(root, '.spec', 'features', 'demo', 'PRD.md'),
    '# PRD\n\n### US-001 — S\n\n#### AC-001 — One\n\n- **Given** g\n- **When** w\n- **Then** t\n\n' +
      '#### AC-002 — Two\n\n- **Given** g\n- **When** w\n- **Then** t\n'
  );
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'RFC.md'), '# RFC\n');
  writeFileSync(path.join(root, '.spec', 'features', 'demo', 'TDD.md'), '# TDD\n');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  writeFileSync(
    path.join(root, 'adp.config.json'),
    JSON.stringify({ reporter: 'tap', testGlobs: ['test/**'], srcGlobs: ['src/**'], ...config })
  );
  const cfg = loadConfig(root);
  return { root, config: cfg, project: loadProject(cfg) };
}

test('the test command is executed and its results become proof @spec:AC-016', () => {
  const p = project(
    { 'test/a.test.js': `// ${tag('AC-001')}\n` },
    {
      testCommand:
        `node -e "console.log('TAP version 13'); console.log('ok 1 - alpha ${tag('AC-001')}'); console.log('not ok 2 - beta ${tag('AC-002')}')"`,
    }
  );
  const result = runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } });

  assert.equal(result.parseError, null);
  assert.equal(result.results['AC-001'].status, 'pass');
  assert.equal(result.results['AC-002'].status, 'fail');

  const written = writeRecords(p.project, p.config, result);
  const file = path.join(p.root, '.spec', 'verification', 'demo.json');
  assert.ok(existsSync(file), 'a record must be written per feature');

  const record = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(record.feature, 'demo');
  assert.equal(record.reporter, 'tap');
  assert.ok(record.verifiedAt, 'the record must be stamped with a time');
  assert.ok(record.codeMtime != null, 'the record must carry a code mtime so proof can go stale');

  const s = summarise(p.project, written);
  assert.equal(s.proven, 1);
  assert.equal(s.failed, 1);
});

test('a skipped test yields skip, and skip is not proof @spec:AC-017', () => {
  const p = project(
    { 'test/a.test.js': `// ${tag('AC-001')}\n` },
    {
      testCommand: `node -e "console.log('ok 1 - alpha ${tag('AC-001')} # SKIP')"`,
    }
  );
  const result = runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } });
  assert.equal(result.results['AC-001'].status, 'skip');
  const s = summarise(p.project, writeRecords(p.project, p.config, result));
  assert.equal(s.proven, 0, 'a skip must never count as proven');
  assert.equal(s.skipped, 1);
});

test('verify refuses to run an unapproved command @spec:AC-031 @principle:P-009', () => {
  const p = project({}, { testCommand: 'echo nope' });
  assert.throws(
    () => runVerification(p.project, p.config, { env: {} }),
    (err) => err instanceof VerifyRefused && err.reason === 'not-trusted'
  );
});

test('an approved command runs without the environment override @principle:P-009', () => {
  const p = project(
    { 'test/a.test.js': `// ${tag('AC-001')}\n` },
    { testCommand: `node -e "console.log('ok 1 - a ${tag('AC-001')}')"` }
  );
  grantTrust(p.root, p.config.testCommand, p.config);
  const result = runVerification(p.project, p.config, { env: {} });
  assert.equal(result.trustReason, 'stored');
  assert.equal(result.results['AC-001'].status, 'pass');
});

test('a project with no test command is refused, not silently passed @spec:AC-016', () => {
  const p = project({}, {});
  assert.throws(
    () => runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } }),
    (err) => err instanceof VerifyRefused && err.reason === 'no-command'
  );
});

test('a run that produced unreadable output records no proof @spec:AC-016', () => {
  const p = project(
    { 'test/a.test.js': `// ${tag('AC-001')}\n` },
    { testCommand: `node -e "console.log('✔ not tap at all')"` }
  );
  const result = runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } });
  assert.ok(result.parseError, 'unreadable output must be an error');
  assert.deepEqual(result.results, {}, 'and must grant no proof');
});

test('proof is read from the reporter output file when one is configured @spec:AC-016', () => {
  // stdout is a shared channel — one console.log inside a test corrupts it.
  // A results file is the robust path, so it must take precedence.
  const p = project(
    { 'test/a.test.js': `// ${tag('AC-001')}\n` },
    {
      reporter: 'junit',
      reporterOutputFile: 'results.xml',
      testCommand: `node -e "require('fs').writeFileSync('results.xml','<testsuite><testcase name=\\"a ${tag('AC-001')}\\"/></testsuite>'); console.log('noise on stdout')"`,
    }
  );
  const result = runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } });
  assert.equal(result.parseError, null);
  assert.equal(result.results['AC-001'].status, 'pass');
});

test('a missing reporter output file is an error, not an empty pass @spec:AC-016', () => {
  const p = project(
    {},
    {
      reporter: 'junit',
      reporterOutputFile: 'never-written.xml',
      testCommand: `node -e "console.log('did nothing')"`,
    }
  );
  const result = runVerification(p.project, p.config, { env: { ...process.env, [TRUST_ENV]: '1' } });
  assert.match(result.parseError, /was not written/);
  assert.deepEqual(result.results, {});
});

test('proof is stamped with the git revision, not only a modification time @spec:AC-016', async () => {
  // The mtime alone is local to one machine: clone the repository or extract a
  // tarball and every mtime becomes "now", so perfectly good proof would read as
  // stale everywhere but the machine that took it.
  const { isProofStale } = await import('../src/core/audit.js');

  const clean = { gitRev: 'abc123', gitDirty: false, codeMtime: 1000 };
  assert.equal(
    isProofStale({ gitRev: 'abc123', codeMtime: 999999 }, clean),
    false,
    'same commit is the same code — a newer mtime after a clone must not fool it'
  );
  assert.equal(isProofStale({ gitRev: 'def456', codeMtime: 1000 }, clean), true, 'a different commit is stale');

  // A dirty tree means the hash describes something other than what was tested,
  // so the finer signal has to take over.
  const dirty = { gitRev: 'abc123', gitDirty: true, codeMtime: 1000 };
  assert.equal(isProofStale({ gitRev: 'abc123', codeMtime: 2000 }, dirty), true);
  assert.equal(isProofStale({ gitRev: 'abc123', codeMtime: 1000 }, dirty), false);

  // No git at all: mtime is all there is.
  const noGit = { gitRev: null, gitDirty: null, codeMtime: 1000 };
  assert.equal(isProofStale({ gitRev: null, codeMtime: 2000 }, noGit), true);
});
