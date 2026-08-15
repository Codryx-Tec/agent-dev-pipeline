// M6b (PRD-007, "os dois exemplos, porque são duas histórias diferentes").
// Not the engine's own behavior — a guard against the worked examples
// drifting the same way the top-level docs had (test/docs.test.js): a
// promise in prose that the shipped files no longer back up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('.exemplo/ only promises "break it" findings this engine actually implements @spec:AC-118', () => {
  const readme = read('.exemplo/README.md');
  // MVP_WIDENED and DOOR_UNDECLARED are named in SCOPE-0.6.0.md but not
  // implemented anywhere (.spec/BACKLOG.md) — the example must not claim
  // a break that cannot happen.
  assert.doesNotMatch(readme, /MVP_WIDENED/);
  assert.doesNotMatch(readme, /DOOR_UNDECLARED/);
  assert.match(readme, /PRD_WITH_SOLUTION/);
  assert.match(readme, /PRD_UNPLACED/);
  assert.match(readme, /BACKLOG_ITEM_WITH_CODE/);
});

test('.exemplo/\'s estimate and closure artifacts are internally consistent @spec:AC-118', () => {
  const estimate = JSON.parse(read('.exemplo/.spec/metrics/estimate.json'));
  const closures = read('.exemplo/.spec/metrics/closures.jsonl')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(estimate.source, 'cold-start', 'the shipped ESTIMATE.md is a snapshot taken before the close below');
  assert.equal(closures.length, 1);
  const [closure] = closures;
  assert.equal(closure.pf, estimate.pf);
  assert.equal(closure.estimate.likely, estimate.hours.likely);
  // deviationPct is (hours - likely) / likely * 100, rounded to one decimal.
  const expected = Math.round(((closure.hours - closure.estimate.likely) / closure.estimate.likely) * 1000) / 10;
  assert.equal(closure.deviationPct, expected);
});

test('.exemplo/\'s RFC resolves OPTION_DO_NOTHING_MISSING for both of its decisions @spec:AC-118', async () => {
  const { parseRfc } = await import('../src/parsers/rfc.js');
  const raw = read('.exemplo/.spec/rfc/RFC-001-class-enrolment.md');
  const parsed = parseRfc(raw, '.spec/rfc/RFC-001-class-enrolment.md');
  assert.equal(parsed.decisions.length, 2);
  for (const d of parsed.decisions) {
    assert.equal(d.hasDoNothing, true, `${d.id} should name a "do nothing" alternative`);
  }
});

test('.exemplo-legado/ ships in its raw, pre-adoption state @spec:AC-119', () => {
  const legadoRoot = path.join(ROOT, '.exemplo-legado');
  assert.equal(existsSync(path.join(legadoRoot, '.spec')), false, 'no .spec/ — the reader runs init themselves');
  assert.equal(existsSync(path.join(legadoRoot, '.git')), false, 'no .git/ — the reader runs git init themselves');
  assert.ok(existsSync(path.join(legadoRoot, 'START-HERE.md')));
  // The recognized-doc-shape files START-HERE.md's own walkthrough counts on.
  for (const rel of ['README.md', 'CHANGELOG.md', 'docs/adr/0001-flat-json-storage.md', 'docs/SPEC.md']) {
    assert.ok(existsSync(path.join(legadoRoot, rel)), `${rel} must exist for the recognition scan to find`);
  }
});

test('.exemplo-legado/\'s partial test suite matches what its own README and START-HERE.md claim @spec:AC-119', async () => {
  const { calculateSubtotal, applyTax, formatInvoice } = await import('../.exemplo-legado/src/invoice.js');
  assert.equal(typeof calculateSubtotal, 'function');
  assert.equal(typeof applyTax, 'function');
  assert.equal(typeof formatInvoice, 'function', 'formatInvoice must exist even though nothing tests it');
  const testSrc = read('.exemplo-legado/test/invoice.test.js');
  assert.doesNotMatch(
    testSrc,
    /formatInvoice\(/,
    'formatInvoice must stay uncalled by any test — that gap is the point'
  );
});
