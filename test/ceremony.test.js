import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLevel,
  describeFeatureCeremony,
  projectCeremony,
  computeCeremonySignals,
  SIGNALS,
  LEVELS,
} from '../src/core/ceremony.js';

test('no declared signal computes to light @spec:AC-058', () => {
  assert.equal(computeLevel([]), 'light');
});

test('money-or-pii wins regardless of what else is declared @spec:AC-058', () => {
  assert.equal(computeLevel(['money-or-pii']), 'full');
  assert.equal(computeLevel(['multiple-teams', 'money-or-pii']), 'full');
  assert.equal(computeLevel(['hard-to-reverse', 'new-tech', 'money-or-pii']), 'full');
});

test('multiple-teams reaches rfc-first when money-or-pii is absent @spec:AC-058', () => {
  assert.equal(computeLevel(['multiple-teams']), 'rfc-first');
  assert.equal(computeLevel(['multiple-teams', 'new-tech']), 'rfc-first');
});

test('any lone softer signal reaches medium, not light — the divergence from the worked example @spec:AC-058', () => {
  assert.equal(computeLevel(['hard-to-reverse']), 'medium');
  assert.equal(computeLevel(['new-tech']), 'medium');
  assert.equal(computeLevel(['large-estimate']), 'medium');
});

test('every recognized signal name maps to one of the four levels', () => {
  for (const s of SIGNALS) assert.ok(LEVELS.includes(computeLevel([s])));
});

test('describeFeatureCeremony ties requiresRfc/requiresDesign to the computed level @spec:AC-059', () => {
  assert.deepEqual(describeFeatureCeremony(null), {
    level: 'light', signals: [], requiresRfc: false, requiresDesign: false,
  });
  assert.deepEqual(describeFeatureCeremony({ signals: ['hard-to-reverse'] }), {
    level: 'medium', signals: ['hard-to-reverse'], requiresRfc: false, requiresDesign: true,
  });
  assert.deepEqual(describeFeatureCeremony({ signals: ['multiple-teams'] }), {
    level: 'rfc-first', signals: ['multiple-teams'], requiresRfc: true, requiresDesign: true,
  });
});

test('projectCeremony reads n/a-applicability as "does any feature need it" @spec:AC-060', () => {
  const features = [
    { name: 'a', prd: { signals: [] } },
    { name: 'b', prd: { signals: [] } },
  ];
  const p = projectCeremony(features);
  assert.equal(p.g2Applicable, false);
  assert.equal(p.g3Applicable, false);
  assert.match(p.reason.G2, /no feature/);
});

test('one rfc-first feature among several light ones keeps G2 applicable, project-wide @spec:AC-060', () => {
  const features = [
    { name: 'small-fix', prd: { signals: [] } },
    { name: 'payment-flow', prd: { signals: ['multiple-teams'] } },
  ];
  const p = projectCeremony(features);
  assert.equal(p.g2Applicable, true);
  assert.equal(p.g3Applicable, true);
  assert.match(p.reason.G2, /payment-flow/);
  assert.equal(p.perFeature.get('small-fix').requiresRfc, false);
  assert.equal(p.perFeature.get('payment-flow').requiresRfc, true);
});

// SCOPE-0.6.0.md §2.4: a capability gap auto-lights `new-tech`, on top of
// whatever `> signals:` a PRD declares by hand.
test('describeFeatureCeremony ORs computed signals into the declared list @spec:AC-128', () => {
  const info = describeFeatureCeremony({ signals: [] }, ['new-tech']);
  assert.equal(info.level, 'medium');
  assert.deepEqual(info.signals, ['new-tech']);
  // a signal declared both ways is not counted twice
  const merged = describeFeatureCeremony({ signals: ['new-tech'] }, ['new-tech']);
  assert.deepEqual(merged.signals, ['new-tech']);
});

const scoredRfc = (requires) => ({
  rfc: { decisions: [{ scored: { options: [{ id: 'OPT-001', requires }] } }] },
});

test('computeCeremonySignals lights new-tech from a scored option outside the team profile @spec:AC-128', () => {
  const rfcs = new Map([['RFC-001', scoredRfc(['redis'])]]);
  const features = [{ name: 'f', rfcRefs: ['RFC-001'] }];
  const byFeature = computeCeremonySignals(features, rfcs, new Set());
  assert.deepEqual(byFeature.get('f'), ['new-tech']);
});

test('computeCeremonySignals stays empty once the profile covers every Requires: tag @spec:AC-128', () => {
  const rfcs = new Map([['RFC-001', scoredRfc(['redis'])]]);
  const features = [{ name: 'f', rfcRefs: ['RFC-001'] }];
  const byFeature = computeCeremonySignals(features, rfcs, new Set(['redis']));
  assert.deepEqual(byFeature.get('f'), []);
});

test('computeCeremonySignals ignores unscored decisions and unlinked RFCs @spec:AC-128', () => {
  const rfcs = new Map([['RFC-001', { rfc: { decisions: [{ scored: null }] } }]]);
  const features = [
    { name: 'f', rfcRefs: ['RFC-001'] },
    { name: 'g', rfcRefs: ['RFC-404'] },
  ];
  const byFeature = computeCeremonySignals(features, rfcs, new Set());
  assert.deepEqual(byFeature.get('f'), []);
  assert.deepEqual(byFeature.get('g'), []);
});
