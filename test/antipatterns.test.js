// M3b — antipatterns as findings (SCOPE-0.6.0.md PRD-003b). Five of the
// eight codes named there: PRD_WITH_SOLUTION, CONTEXT_WITHOUT_NUMBERS,
// DOC_TOO_LONG, DOC_FOSSIL, AC_NOT_OBSERVABLE. STRAW_OPTION and
// OPTION_DO_NOTHING_MISSING need RFC grammar (per-alternative pros/cons,
// OPT-000) that doesn't exist yet; DUPLICATE_PROSE needs a similarity
// algorithm of its own — both deferred, not built here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import { auditOf, has, findingsFor, gate, approvedScope, makeProject } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';
import { auditProject } from '../src/core/audit.js';

const PRD_OK = `# PRD

> rfcs: RFC-001
> signals: multiple-teams

Prose only: what, for whom, why.
`;

const RFC_WITH_NUMBERS = `# RFC: t

## Purpose

Support tickets about this take 20 minutes to resolve.

### D-001 — A choice

**Alternatives considered**

1. *One.* first
2. *Two.* second

**Decision: alternative 1 — one.**
`;

const RFC_WITHOUT_NUMBERS = RFC_WITH_NUMBERS.replace(
  'Support tickets about this take 20 minutes to resolve.',
  'Our process has some problems and needs fixing.'
);

const SPEC_OK = `# SPEC

### US-001 — a story

#### AC-001 — a criterion

- **Given** a
- **When** b
- **Then** c

## Assumptions

- **ASM-001** — something assumed *(status: confirmed)*

## Open questions

- **Q-001** — something asked *(status: answered)*

## T-001 — do it [pending]

- Refs: AC-001
- Files: src/a.js
`;

const DESIGN_OK = `# DESIGN

## 1. Shape of the solution
`;

const base = (over = {}) => ({
  '.spec/SCOPE.md': approvedScope(),
  '.spec/features/f/PRD.md': PRD_OK,
  '.spec/rfc/RFC-001-t.md': RFC_WITH_NUMBERS,
  '.spec/features/f/SPEC.md': SPEC_OK,
  '.spec/features/f/DESIGN.md': DESIGN_OK,
  'src/a.js': 'export const a = 1;\n',
  'test/a.test.js': "test('does it @spec:AC-001', () => {});\n",
  ...over,
});

// ---------------------------------------------------------- PRD_WITH_SOLUTION

test('a PRD naming a real database is flagged, case-insensitively @spec:AC-067', () => {
  const prd = '# PRD\n\n> rfcs: RFC-001\n> signals: multiple-teams\n\nWe will store data in PostgreSQL.\n';
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd }));
  const finding = findingsFor(audit, 'PRD_WITH_SOLUTION')[0];
  assert.ok(finding);
  assert.match(finding.message, /PostgreSQL|technical solution/);
});

test('a PRD with clean, technology-free prose is left alone @spec:AC-067', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'PRD_WITH_SOLUTION'), false);
});

// ------------------------------------------------------ CONTEXT_WITHOUT_NUMBERS

test('an RFC whose context has no measurable figure is flagged @spec:AC-068', () => {
  const { audit, gates } = auditOf(base({ '.spec/rfc/RFC-001-t.md': RFC_WITHOUT_NUMBERS }));
  assert.ok(has(audit, 'CONTEXT_WITHOUT_NUMBERS'));
  assert.equal(gate(gates, 'G2').state, 'red');
});

test('an RFC context grounded in a number is left alone @spec:AC-068', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'CONTEXT_WITHOUT_NUMBERS'), false);
});

// ------------------------------------------------------------------ DOC_TOO_LONG

test('a PRD over the configured line ceiling is flagged, as a warning @spec:AC-069', () => {
  const { audit } = auditOf(base(), { config: { docLengthLimits: { prd: 3 } } });
  const finding = findingsFor(audit, 'DOC_TOO_LONG')[0];
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
});

test('a PRD under the ceiling is left alone @spec:AC-069', () => {
  const { audit } = auditOf(base(), { config: { docLengthLimits: { prd: 500 } } });
  assert.equal(has(audit, 'DOC_TOO_LONG'), false);
});

// --------------------------------------------------------------------- DOC_FOSSIL

test('a DESIGN.md older than the code it maps is flagged, past the tolerance window @spec:AC-070', () => {
  const root = makeProject(base());
  try {
    const now = Date.now();
    const designPath = path.join(root, '.spec/features/f/DESIGN.md');
    const codePath = path.join(root, 'src/a.js');
    // DESIGN written well before the code it maps — real drift, not copy jitter.
    utimesSync(designPath, new Date(now - 3600_000), new Date(now - 3600_000));
    utimesSync(codePath, new Date(now), new Date(now));
    const project = loadProject(loadConfig(root));
    const audit = auditProject(project);
    const finding = findingsFor(audit, 'DOC_FOSSIL')[0];
    assert.ok(finding);
    assert.equal(finding.severity, 'warning');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a small mtime gap inside the tolerance window is not flagged — copy jitter, not real drift @spec:AC-070', () => {
  const root = makeProject(base());
  try {
    const now = Date.now();
    const designPath = path.join(root, '.spec/features/f/DESIGN.md');
    const codePath = path.join(root, 'src/a.js');
    utimesSync(designPath, new Date(now), new Date(now));
    utimesSync(codePath, new Date(now + 2000), new Date(now + 2000)); // 2s later, well inside the 5-minute tolerance
    const project = loadProject(loadConfig(root));
    const audit = auditProject(project);
    assert.equal(has(audit, 'DOC_FOSSIL'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- AC_NOT_OBSERVABLE

test('a criterion with a vague adjective and no number is flagged @spec:AC-071', () => {
  const spec = SPEC_OK.replace('- **Then** c', '- **Then** the response is fast');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.ok(has(audit, 'AC_NOT_OBSERVABLE'));
});

test('a criterion with a number is not flagged, even with an adjective nearby @spec:AC-071', () => {
  const spec = SPEC_OK.replace('- **Then** c', '- **Then** the response is fast, in under 300ms');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.equal(has(audit, 'AC_NOT_OBSERVABLE'), false);
});

test('a criterion with neither a vague adjective nor a number is not flagged @spec:AC-071', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'AC_NOT_OBSERVABLE'), false);
});
