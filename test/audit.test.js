import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditOf, has, findingsFor, gate, approvedScope, MINIMAL_RFC } from './helpers.js';

// > signals: multiple-teams keeps this fixture at rfc-first ceremony, so G2
// and G3 stay evaluated (M2b) — without a declared signal, no ceremony
// requires an RFC or a DESIGN, and every test in this file that exercises
// them would silently stop testing what it says it tests.
const PRD_OK = `# PRD

> rfcs: RFC-001
> signals: multiple-teams

Prose only: what, for whom, why.
`;

const SPEC_OK = `# SPEC

### US-001 — a story

#### AC-001 — a criterion

- **Given** a
- **When** b
- **Then** c

## Assumptions

- **ASM-001** — something assumed *(status: confirmed)*

## Open questions

- **Q-001** — something asked *(status: answered, Door: two-way)*

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
  '.spec/rfc/RFC-001-t.md': MINIMAL_RFC,
  '.spec/features/f/SPEC.md': SPEC_OK,
  '.spec/features/f/DESIGN.md': DESIGN_OK,
  'src/a.js': 'export const a = 1;\n',
  'test/a.test.js': "test('does it @spec:AC-001', () => {});\n",
  ...over,
});

test('an unapproved scope turns G0 red and blocks everything after it @spec:AC-004', () => {
  const { gates } = auditOf(base({ '.spec/SCOPE.md': '**Scope status:** Draft\n' }));
  assert.equal(gate(gates, 'G0').state, 'red');
  for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
    assert.equal(gate(gates, id).state, 'blocked', `${id} must be blocked, not red`);
    assert.equal(gate(gates, id).blockedBy, 'G0');
  }
  assert.equal(gates.exitCode, 1, 'the exit code IS the failing gate number');
});

test('a story with no criterion is a finding @spec:AC-005', () => {
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': '### US-001 — lonely\n' }));
  assert.ok(has(audit, 'US_WITHOUT_AC'));
  assert.match(findingsFor(audit, 'US_WITHOUT_AC')[0].message, /US-001/);
});

test('an incomplete criterion names the missing clause @spec:AC-006', () => {
  const spec = '### US-001 — x\n\n#### AC-001 — y\n\n- **Given** a\n- **When** b\n';
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.match(findingsFor(audit, 'AC_INCOMPLETE')[0].message, /then/);
});

test('a decision with fewer than two alternatives is a finding @spec:AC-007', () => {
  const rfc = MINIMAL_RFC.replace('2. *Two.* second\n', '').replace('3. *Do nothing.* keep the current process\n', '');
  const { audit, gates } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.ok(has(audit, 'DECISION_WITHOUT_ALTERNATIVE'));
  assert.equal(gate(gates, 'G2').state, 'red');
});

test('a PRD declaring no RFC is a finding @spec:AC-007', () => {
  const prd = '# PRD\n\n> signals: multiple-teams\n\nProse only.\n';
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd }));
  assert.match(findingsFor(audit, 'RFC_MISSING')[0].message, /declares no RFC/);
});

test('a PRD referencing an RFC that does not exist is a finding @spec:AC-007', () => {
  const prd = '# PRD\n\n> rfcs: RFC-404\n> signals: multiple-teams\n\nProse only.\n';
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd }));
  assert.match(findingsFor(audit, 'RFC_MISSING')[0].message, /RFC-404, which does not exist/);
});

test('a light-ceremony feature with no declared signal is never checked for a missing RFC @spec:AC-058', () => {
  const prd = '# PRD\n\nProse only.\n';
  const { audit, gates } = auditOf(base({ '.spec/features/f/PRD.md': prd }));
  assert.equal(has(audit, 'RFC_MISSING'), false);
  assert.equal(gate(gates, 'G2').state, 'n/a');
});

test('a PRD not named in the MVP checklist is unplaced @spec:AC-061', () => {
  const { audit } = auditOf(base({ '.spec/SCOPE.md': approvedScope([]) }));
  assert.match(findingsFor(audit, 'PRD_UNPLACED')[0].message, /not declared in .*MVP checklist/);
});

test('a PRD named in the MVP checklist is placed, whatever its checkbox state @spec:AC-061', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'PRD_UNPLACED'), false);
});

test('a feature with no PRD at all is never reported as unplaced — PRD_MISSING already says so @spec:AC-061', () => {
  const { audit } = auditOf(
    base({ '.spec/features/g/SPEC.md': SPEC_OK, '.spec/SCOPE.md': approvedScope(['f']) })
  );
  assert.ok(has(audit, 'PRD_MISSING'));
  assert.equal(has(audit, 'PRD_UNPLACED'), false);
});

test('a backlog item carrying a real tracking code is flagged, and stays a warning @spec:AC-061', () => {
  const { audit, gates } = auditOf(base({ '.spec/BACKLOG.md': '- extend AC-002 to cover refunds\n' }));
  const finding = findingsFor(audit, 'BACKLOG_ITEM_WITH_CODE')[0];
  assert.match(finding.message, /AC-002/);
  assert.equal(finding.severity, 'warning');
  assert.equal(gate(gates, 'G1').state, 'green', 'a warning must not turn the gate red');
});

test('no BACKLOG.md at all is a normal, clean state — nothing has been deferred yet @spec:AC-061', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'BACKLOG_ITEM_WITH_CODE'), false);
});

test('one RFC shared by two PRDs is checked once, not once per PRD @spec:AC-007', () => {
  // Feature g deliberately has no SPEC.md/DESIGN.md — irrelevant findings
  // about it (SPEC_MISSING etc.) don't affect what this test asserts.
  const { audit } = auditOf(
    base({
      '.spec/rfc/RFC-001-t.md': MINIMAL_RFC.replace('2. *Two.* second\n', '').replace('3. *Do nothing.* keep the current process\n', ''), // broken: only 1 alternative
      '.spec/features/g/PRD.md': PRD_OK,
    })
  );
  assert.equal(
    findingsFor(audit, 'DECISION_WITHOUT_ALTERNATIVE').length,
    1,
    'the RFC is one file; both PRDs pointing at it must not double the finding'
  );
});

// SCOPE-0.6.0.md §2.4 — opt-in only: appending a scored decision to
// MINIMAL_RFC's own D-001 leaves that decision untouched (no `**Decision
// criteria:**`/`**Options considered**` markers there) while giving these
// tests a second, opted-in decision to check.
const SCORED_RFC_GOOD = `${MINIMAL_RFC}
### D-005 — Where to cache session state

**Decision criteria:** W-001, W-002, W-003

**Options considered**

- **OPT-000 — Do nothing.** Keep sessions in memory, single instance only.
- **OPT-001 — Redis with TTL.** Requires: redis
- **OPT-002 — Postgres advisory locks.** Requires: postgres

**Scoring matrix**

| Option | W-001 | W-002 | W-003 | Total |
|---|---|---|---|---|
| OPT-000 | 2 | 5 | 5 | 12 |
| OPT-001 | 7 | 6 | 3 | 16 |
| OPT-002 | 6 | 5 | 6 | 17 |

**Recommendation:** OPT-002 — highest score, and the team already runs
Postgres in production.

**Decision: OPT-002 — Postgres advisory locks.**
`;

test('a well-formed scored decision raises none of the §2.4 findings @spec:AC-124', () => {
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': SCORED_RFC_GOOD }));
  assert.equal(has(audit, 'CRITERIA_AFTER_OPTIONS'), false);
  assert.equal(has(audit, 'RECOMMENDATION_AGAINST_SCORE'), false);
  assert.equal(has(audit, 'CONTEXT_NUMBER_WITHOUT_SOURCE'), false);
});

test('a decision that predates §2.4 stays untouched by it — no opt-in markers, no scored findings @spec:AC-124', () => {
  const { audit } = auditOf(base());
  assert.equal(has(audit, 'CRITERIA_AFTER_OPTIONS'), false);
});

test('declaring Decision criteria after Options considered is a finding @spec:AC-124', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '**Decision criteria:** W-001, W-002, W-003\n\n**Options considered**',
    '**Options considered**'
  ).replace(
    '**Scoring matrix**',
    '**Decision criteria:** W-001, W-002, W-003\n\n**Scoring matrix**'
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(findingsFor(audit, 'CRITERIA_AFTER_OPTIONS')[0].message, /D-005/);
});

test('a scoring matrix with no Decision criteria at all is a finding @spec:AC-124', () => {
  const rfc = SCORED_RFC_GOOD.replace('**Decision criteria:** W-001, W-002, W-003\n\n', '');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.ok(has(audit, 'CRITERIA_AFTER_OPTIONS'));
});

test('a scored decision with fewer than 3 options is a finding, even though 2 satisfies the generic rule @spec:AC-124', () => {
  const rfc = SCORED_RFC_GOOD.replace('- **OPT-002 — Postgres advisory locks.** Requires: postgres\n', '')
    .replace('| OPT-002 | 6 | 5 | 6 | 17 |\n', '')
    .replace('**Recommendation:** OPT-002 — highest score, and the team already runs\nPostgres in production.', '**Recommendation:** OPT-001 — the only real contender.')
    .replace('**Decision: OPT-002 — Postgres advisory locks.**', '**Decision: OPT-001 — Redis with TTL.**');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(
    findingsFor(audit, 'CRITERIA_AFTER_OPTIONS').map((f) => f.message).join(' | '),
    /at least 3/
  );
});

test('a scored decision missing OPT-000 is a finding — the baseline is not optional @spec:AC-124', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '- **OPT-000 — Do nothing.** Keep sessions in memory, single instance only.\n',
    ''
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(
    findingsFor(audit, 'CRITERIA_AFTER_OPTIONS').map((f) => f.message).join(' | '),
    /OPT-000/
  );
});

test('a gap in the scoring matrix is a finding @spec:AC-124', () => {
  const rfc = SCORED_RFC_GOOD.replace('| OPT-002 | 6 | 5 | 6 | 17 |', '| OPT-002 | 6 |  | 6 | 17 |');
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(findingsFor(audit, 'CRITERIA_AFTER_OPTIONS')[0].message, /OPT-002.*W-002/);
});

test('a recommendation against the top score with no justification is a finding @spec:AC-125', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '**Recommendation:** OPT-002 — highest score, and the team already runs\nPostgres in production.',
    '**Recommendation:** OPT-000 —'
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(findingsFor(audit, 'RECOMMENDATION_AGAINST_SCORE')[0].message, /OPT-000.*OPT-002/);
});

test('a recommendation against the top score WITH real justification prose clears @spec:AC-125', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '**Recommendation:** OPT-002 — highest score, and the team already runs\nPostgres in production.',
    '**Recommendation:** OPT-001 — OPT-002 scores marginally higher, but nobody\non the team has run Postgres advisory locks in production before, and the\ntiming risk outweighs the one-point gap.'
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'RECOMMENDATION_AGAINST_SCORE'), false);
});

test('a numeric claim in an option with no cited source is a finding, narrow to opted-in decisions @spec:AC-126', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '- **OPT-001 — Redis with TTL.** Requires: redis',
    '- **OPT-001 — Redis with TTL.** Requires: redis. Cuts latency by 80% for our users.'
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.match(findingsFor(audit, 'CONTEXT_NUMBER_WITHOUT_SOURCE')[0].message, /OPT-001/);
});

test('a numeric claim with a cited source clears @spec:AC-126', () => {
  const rfc = SCORED_RFC_GOOD.replace(
    '- **OPT-001 — Redis with TTL.** Requires: redis',
    '- **OPT-001 — Redis with TTL.** Requires: redis. Cuts latency by 80% (source: https://example.com/bench).'
  );
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': rfc }));
  assert.equal(has(audit, 'CONTEXT_NUMBER_WITHOUT_SOURCE'), false);
});

test('an OPT-xxx Requires: tag outside the declared team profile is a finding @spec:AC-127', () => {
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': SCORED_RFC_GOOD }));
  const messages = findingsFor(audit, 'OPTION_BEYOND_TEAM').map((f) => f.message).join(' | ');
  assert.match(messages, /OPT-001.*redis/);
  assert.match(messages, /OPT-002.*postgres/);
});

test('nobody ever running adp profile reads as no declared capabilities, not an error @spec:AC-127', () => {
  const { audit } = auditOf(base({ '.spec/rfc/RFC-001-t.md': SCORED_RFC_GOOD }));
  assert.equal(findingsFor(audit, 'OPTION_BEYOND_TEAM')[0].severity, 'warning');
});

test('a declared capability that covers every Requires: tag clears OPTION_BEYOND_TEAM @spec:AC-127', () => {
  const { audit } = auditOf(
    base({
      '.spec/rfc/RFC-001-t.md': SCORED_RFC_GOOD,
      '.spec/metrics/profile.json': JSON.stringify({ capabilities: ['redis', 'postgres'] }),
    })
  );
  assert.equal(has(audit, 'OPTION_BEYOND_TEAM'), false);
});

test('a partial capability match still flags the option still missing one @spec:AC-127', () => {
  const { audit } = auditOf(
    base({
      '.spec/rfc/RFC-001-t.md': SCORED_RFC_GOOD,
      '.spec/metrics/profile.json': JSON.stringify({ capabilities: ['redis'] }),
    })
  );
  const messages = findingsFor(audit, 'OPTION_BEYOND_TEAM').map((f) => f.message).join(' | ');
  assert.equal(findingsFor(audit, 'OPTION_BEYOND_TEAM').length, 1);
  assert.match(messages, /OPT-002.*postgres/);
});

test('a missing assumptions or questions section is a finding @spec:AC-008', () => {
  const spec = SPEC_OK.replace('## Assumptions', '## Notes');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.ok(has(audit, 'SECTION_MISSING'));
});

test('an open assumption warns during the work and errors once the feature claims done @spec:AC-009', () => {
  const specOpen = SPEC_OK.replace('*(status: confirmed)*', '*(status: open)*');

  const during = auditOf(base({ '.spec/features/f/SPEC.md': specOpen }));
  assert.equal(findingsFor(during.audit, 'ASM_OPEN')[0].severity, 'warning');

  const done = auditOf(
    base({
      '.spec/features/f/SPEC.md': specOpen,
      '.spec/features/f/PRD.md': `# PRD\n\n> status: implemented\n${PRD_OK}`,
    })
  );
  assert.equal(findingsFor(done.audit, 'ASM_OPEN')[0].severity, 'error');
});

test('a criterion covered by no task is a finding @spec:AC-010', () => {
  const spec = SPEC_OK.replace('- Refs: AC-001\n- Files: src/a.js\n', '- Refs: US-999\n');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.ok(has(audit, 'AC_WITHOUT_TASK'));
});

test('a task referencing an undefined code is a finding @spec:AC-011', () => {
  const spec = SPEC_OK.replace('- Refs: AC-001', '- Refs: AC-001, AC-777');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.match(findingsFor(audit, 'REF_BROKEN')[0].message, /AC-777/);
});

test('a task with no declared files is reported as never parallelizable @spec:AC-012', () => {
  const spec = SPEC_OK.replace('- Files: src/a.js\n', '');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.match(findingsFor(audit, 'TASK_WITHOUT_FILES')[0].message, /never be parallelized/);
});

test('a criterion with no annotated test is a finding @spec:AC-016', () => {
  const { audit } = auditOf(base({ 'test/a.test.js': "test('unrelated', () => {});\n" }));
  assert.ok(has(audit, 'AC_WITHOUT_TEST'));
});

test('a skipped test is recorded as no proof, never as proof @spec:AC-017', () => {
  const verification = JSON.stringify({
    feature: 'f',
    results: { 'AC-001': { status: 'skip', testName: 'x' } },
  });
  const { audit } = auditOf(base({ '.spec/verification/f.json': verification }));
  assert.match(findingsFor(audit, 'AC_WITHOUT_PROOF')[0].message, /SKIPPED/);
});

test('a task cannot declare itself done without proof @spec:AC-014', () => {
  const spec = SPEC_OK.replace('[pending]', '[done]');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.ok(has(audit, 'TASK_DONE_WITHOUT_PROOF'));
});

test('a task with real PASS proof is accepted as done @spec:AC-014', () => {
  const verification = JSON.stringify({
    feature: 'f',
    results: { 'AC-001': { status: 'pass', testName: 'does it' } },
  });
  const { audit } = auditOf(
    base({
      '.spec/features/f/SPEC.md': SPEC_OK.replace('[pending]', '[done]'),
      '.spec/verification/f.json': verification,
    })
  );
  assert.equal(has(audit, 'TASK_DONE_WITHOUT_PROOF'), false);
});

test('a task whose refs reach no criterion is named @spec:AC-049', () => {
  // `US-001` resolves, so REF_BROKEN stays quiet and the task looks fine. But
  // proof is granted per criterion, and the proof check filters this reference
  // out silently — so the task can never be proven and nothing said so.
  const spec = SPEC_OK.replace('- Refs: AC-001', '- Refs: US-001');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));

  assert.equal(has(audit, 'REF_BROKEN'), false, 'the reference does resolve');
  const found = findingsFor(audit, 'REF_WITHOUT_AC');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /T-001 references US-001/);
  assert.match(found[0].message, /grant it proof/);
});

test('a task carrying at least one criterion is left alone @spec:AC-049', () => {
  // Referencing the story for context alongside a criterion is normal, and it
  // costs nothing — the finding fires only when proof is impossible.
  const spec = SPEC_OK.replace('- Refs: AC-001', '- Refs: US-001, AC-001');
  const { audit } = auditOf(base({ '.spec/features/f/SPEC.md': spec }));
  assert.equal(has(audit, 'REF_WITHOUT_AC'), false);
});

test('code changed after the last proof is reported @spec:AC-027', () => {
  const verification = JSON.stringify({
    feature: 'f',
    codeMtime: 1,
    results: { 'AC-001': { status: 'pass' } },
  });
  const { audit } = auditOf(base({ '.spec/verification/f.json': verification }));
  assert.ok(has(audit, 'PROOF_STALE'));
});

test('a test pointing at a removed criterion is a finding @spec:AC-028', () => {
  const { audit } = auditOf(base({ 'test/a.test.js': `test('x ${'@spec:' + 'AC-404'}', () => {});\n` }));
  assert.match(findingsFor(audit, 'TEST_ORPHAN')[0].message, /AC-404/);
});

test('a MUST principle with no verification is a finding @spec:AC-029', () => {
  const { audit } = auditOf(base({ '.spec/CONSTITUTION.md': '## P-001 [MUST] no proof here\n' }));
  assert.ok(has(audit, 'PRINCIPLE_WITHOUT_VERIFICATION'));
});

test('a declared forbidden pattern is executed against its glob @spec:AC-030', () => {
  const constitution = '## P-001 [MUST] no hard-coded passwords\n\n- verification(forbidden): `password\\s*=` in `src/**`\n';
  const clean = auditOf(base({ '.spec/CONSTITUTION.md': constitution }));
  assert.equal(has(clean.audit, 'PRINCIPLE_VIOLATED'), false);

  const dirty = auditOf(
    base({ '.spec/CONSTITUTION.md': constitution, 'src/a.js': 'const password = "hunter2";\n' })
  );
  const violation = findingsFor(dirty.audit, 'PRINCIPLE_VIOLATED')[0];
  assert.ok(violation, 'the pattern must actually run, not merely be declared');
  assert.equal(violation.file, 'src/a.js');
  assert.equal(violation.line, 1);
});

test('a required pattern absent from its glob is a violation @spec:AC-030', () => {
  const constitution = '## P-001 [MUST] vault only\n\n- verification(required): `import hvac` in `src/**`\n';
  const { audit } = auditOf(base({ '.spec/CONSTITUTION.md': constitution }));
  assert.ok(has(audit, 'PRINCIPLE_VIOLATED'));
});

test('a verification whose glob matches nothing is reported as inert @spec:AC-030', () => {
  const constitution = '## P-001 [MUST] x\n\n- verification(forbidden): `nope` in `backend/**`\n';
  const { audit } = auditOf(base({ '.spec/CONSTITUTION.md': constitution }));
  assert.match(findingsFor(audit, 'GLOB_WITHOUT_FILES')[0].message, /inert/);
});

test('a pathological regex degrades into a finding instead of hanging the gate @spec:AC-030', () => {
  const constitution = '## P-001 [MUST] x\n\n- verification(forbidden): `(a+)+$` in `src/**`\n';
  const { audit } = auditOf(
    base({ '.spec/CONSTITUTION.md': constitution, 'src/a.js': 'a'.repeat(40) + 'b' })
  );
  // Either it completes quickly or it is killed by the subprocess timeout; what
  // must never happen is the audit hanging. Both outcomes leave the gate usable.
  assert.ok(audit.findings.length > 0);
});

test('an invalid regex is reported even when the glob matches nothing @spec:AC-030', () => {
  const constitution = '## P-001 [MUST] x\n\n- verification(forbidden): `[unclosed` in `nowhere/**`\n';
  const { audit } = auditOf(base({ '.spec/CONSTITUTION.md': constitution }));
  assert.ok(has(audit, 'VERIFICATION_MALFORMED'));
});

test('duplicate traceability codes are caught across documents @spec:AC-005', () => {
  const { audit } = auditOf(base({ '.spec/features/g/SPEC.md': SPEC_OK }));
  assert.ok(has(audit, 'ID_DUPLICATE'), 'codes are unique project-wide, not per document');
});

// ------------------------------------------------ §2.3, the conditional RFC

const SPEC_WITH_QUESTION = (questionLine) => `# SPEC

### US-001 — a story

#### AC-001 — a criterion

- **Given** a
- **When** b
- **Then** c

## Assumptions

- **ASM-001** — something assumed *(status: confirmed)*

## Open questions

${questionLine}

## T-001 — do it [pending]

- Refs: AC-001
- Files: src/a.js
`;

test('a question with no Door: is DOOR_UNDECLARED, regardless of status @spec:AC-122', () => {
  const openNoDoor = auditOf(base({
    '.spec/features/f/SPEC.md': SPEC_WITH_QUESTION('- **Q-001** — a *(status: open)*'),
  }));
  assert.ok(has(openNoDoor.audit, 'DOOR_UNDECLARED'));

  const answeredNoDoor = auditOf(base({
    '.spec/features/f/SPEC.md': SPEC_WITH_QUESTION('- **Q-001** — a *(status: answered)*'),
  }));
  assert.ok(
    has(answeredNoDoor.audit, 'DOOR_UNDECLARED'),
    'an answered question still owes a door — the field is about the decision, not its current status'
  );
});

test('an open one-way-door question is RFC_REQUIRED @spec:AC-122', () => {
  const { audit, gates } = auditOf(base({
    '.spec/features/f/SPEC.md': SPEC_WITH_QUESTION('- **Q-001** — a *(status: open, Door: one-way)*'),
  }));
  assert.ok(has(audit, 'RFC_REQUIRED'));
  assert.equal(has(audit, 'DOOR_UNDECLARED'), false);
  assert.equal(gate(gates, 'G2').state, 'red');
});

test('an open two-way-door question is not RFC_REQUIRED @spec:AC-122', () => {
  const { audit } = auditOf(base({
    '.spec/features/f/SPEC.md': SPEC_WITH_QUESTION('- **Q-001** — a *(status: open, Door: two-way)*'),
  }));
  assert.equal(has(audit, 'RFC_REQUIRED'), false);
});

test('an answered one-way-door question is not RFC_REQUIRED — closing it is what discharges the obligation @spec:AC-122', () => {
  const { audit } = auditOf(base({
    '.spec/features/f/SPEC.md': SPEC_WITH_QUESTION('- **Q-001** — a *(status: answered, Door: one-way)*'),
  }));
  assert.equal(has(audit, 'RFC_REQUIRED'), false);
});

test('CI mode escalates the softer findings to errors @spec:AC-010', () => {
  // src/b.js is mapped by no task, so FILE_ORPHAN fires: a warning while you
  // work, an error at the gate.
  const files = base({ 'src/b.js': 'export const b = 2;\n' });
  const soft = auditOf(files);
  const strict = auditOf(files, { ci: true });
  const orphan = (a) => findingsFor(a, 'FILE_ORPHAN')[0];
  assert.equal(orphan(soft.audit) && orphan(soft.audit).severity, 'warning');
  assert.equal(orphan(strict.audit) && orphan(strict.audit).severity, 'error');
});
