// M3b — antipatterns as findings (SCOPE-0.6.0.md PRD-003b). All eight codes
// named there now: PRD_WITH_SOLUTION, CONTEXT_WITHOUT_NUMBERS, DOC_TOO_LONG,
// DOC_FOSSIL, AC_NOT_OBSERVABLE from earlier in M3b; STRAW_OPTION,
// OPTION_DO_NOTHING_MISSING and DUPLICATE_PROSE close out the set
// (M3b-remainder). STRAW_OPTION only checks the create-rfc dialect (the
// native one has no Pros/Cons structure to compare); OPTION_DO_NOTHING_MISSING
// checks both by name match, and stays a plain warning rather than the
// source text's "erro (G2)" — see rfc.js/audit.js for why.

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

// ------------------------------------------------------------------ STRAW_OPTION

const optionsRfc = ({ opt2Cons = '- Costs more\n- Takes longer to set up\n- Needs a new on-call rotation\n' } = {}) => `# RFC: t

## Options Considered

### Option 1: Real choice ⭐ (Recommended)

**Pros**:
- Fast
- Cheap

**Cons**:
- Locks us into one vendor
- Needs a migration later

### Option 2: Weaker choice

**Pros**:
- Simple

**Cons**:
${opt2Cons}
## Outcome

**Decision**: Option 1 was chosen
`;

test('an option with no declared cons at all is flagged, next to a favorite with real cons @spec:AC-091', () => {
  const rfc = `# RFC: t

## Options Considered

### Option 1: Real choice ⭐ (Recommended)

**Pros**:
- Fast

**Cons**:
- Locks us into one vendor
- Needs a migration later

### Option 2: Straw choice

**Pros**:
- Sounds nice

## Outcome

**Decision**: Option 1 was chosen
`;
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  const finding = findingsFor(audit, 'STRAW_OPTION')[0];
  assert.ok(finding);
  assert.match(finding.message, /Straw choice/);
  assert.equal(finding.severity, 'warning');
});

test('an option with cons far shorter than the favorite\'s is flagged @spec:AC-091', () => {
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': optionsRfc({ opt2Cons: '- Meh\n' }) }));
  assert.ok(has(audit, 'STRAW_OPTION'));
});

test('an option with comparably real cons is not flagged @spec:AC-091', () => {
  const { audit } = auditOf(
    base({ '.spec/rfc/RFC-001-t.md': optionsRfc({ opt2Cons: '- Also locks us in, just to a smaller vendor\n- Support is slower to respond\n' }) })
  );
  assert.equal(has(audit, 'STRAW_OPTION'), false);
});

test('with no favorite marked recommended, nothing is flagged — no baseline to compare against @spec:AC-091', () => {
  const rfc = optionsRfc().replace(' ⭐ (Recommended)', '').replace('**Decision**: Option 1 was chosen', '**Decision**: Option 2 was chosen');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'STRAW_OPTION'), false);
});

test('when the favorite itself declares no cons, nothing is flagged — the structure is not in use @spec:AC-091', () => {
  const rfc = `# RFC: t

## Options Considered

### Option 1: Real choice ⭐ (Recommended)

**Pros**:
- Fast

### Option 2: Other choice

**Pros**:
- Simple

## Outcome

**Decision**: Option 1 was chosen
`;
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'STRAW_OPTION'), false);
});

test('the native dialect is never checked for straw options — it has no Pros/Cons structure @spec:AC-091', () => {
  const { audit } = auditOf(base()); // RFC_WITH_NUMBERS, native dialect
  assert.equal(has(audit, 'STRAW_OPTION'), false);
});

// ----------------------------------------------------------- OPTION_DO_NOTHING_MISSING

test('a native-dialect decision with no do-nothing alternative is flagged, as a warning @spec:AC-092', () => {
  const { audit, gates } = auditOf(base()); // RFC_WITH_NUMBERS has no do-nothing alternative
  const finding = findingsFor(audit, 'OPTION_DO_NOTHING_MISSING')[0];
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.equal(gate(gates, 'G2').state, 'green', 'a warning must not turn the gate red');
});

test('a native-dialect decision naming a do-nothing alternative is not flagged @spec:AC-092', () => {
  const rfc = RFC_WITH_NUMBERS.replace('2. *Two.* second', '2. *Two.* second\n3. *Do nothing.* keep the current process');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'OPTION_DO_NOTHING_MISSING'), false);
});

test('a Portuguese "não fazer nada" alternative also counts @spec:AC-092', () => {
  const rfc = RFC_WITH_NUMBERS.replace('2. *Two.* second', '2. *Two.* second\n3. *Não fazer nada.* manter como está');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'OPTION_DO_NOTHING_MISSING'), false);
});

test('a create-rfc-dialect decision with no do-nothing option is flagged @spec:AC-092', () => {
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': optionsRfc() }));
  assert.ok(has(audit, 'OPTION_DO_NOTHING_MISSING'));
});

test('a create-rfc-dialect "Do Nothing" option is not flagged @spec:AC-092', () => {
  const rfc = optionsRfc().replace('### Option 2: Weaker choice', '### Option 2: Do Nothing');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'OPTION_DO_NOTHING_MISSING'), false);
});

// -------------------------------------------------------------------- DUPLICATE_PROSE

const SHARED_PARAGRAPH =
  'The onboarding flow must collect the company legal name, the tax identification number, ' +
  'the primary contact email, and a billing address before the account can be activated for use.';

test('a substantial passage repeated between PRD and DESIGN is flagged @spec:AC-093', () => {
  const prd = `# PRD\n\n> rfcs: RFC-001\n> signals: multiple-teams\n\n${SHARED_PARAGRAPH}\n`;
  const design = `# DESIGN\n\n## 1. Shape of the solution\n\n${SHARED_PARAGRAPH}\n`;
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd, '.spec/features/f/DESIGN.md': design }));
  const finding = findingsFor(audit, 'DUPLICATE_PROSE')[0];
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
});

test('related but substantially different prose is not flagged @spec:AC-093', () => {
  const prd = `# PRD\n\n> rfcs: RFC-001\n> signals: multiple-teams\n\n${SHARED_PARAGRAPH}\n`;
  const design = `# DESIGN\n\n## 1. Shape of the solution\n\nThe billing service validates the tax id against ` +
    `an external registry and rejects the request with a specific error code when the format does not match.\n`;
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd, '.spec/features/f/DESIGN.md': design }));
  assert.equal(has(audit, 'DUPLICATE_PROSE'), false);
});

test('a short shared line under the word-count floor is not flagged — boilerplate, not real duplication @spec:AC-093', () => {
  const shared = 'This document is prose only, no stories, no criteria.\n';
  const prd = `# PRD\n\n> rfcs: RFC-001\n> signals: multiple-teams\n\n${shared}`;
  const design = `# DESIGN\n\n## 1. Shape of the solution\n\n${shared}`;
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd, '.spec/features/f/DESIGN.md': design }));
  assert.equal(has(audit, 'DUPLICATE_PROSE'), false);
});
