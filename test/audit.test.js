import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditOf, has, findingsFor, gate, APPROVED_SCOPE, MINIMAL_RFC } from './helpers.js';

const PRD_OK = `# PRD

### US-001 — a story

#### AC-001 — a criterion

- **Given** a
- **When** b
- **Then** c
`;

const TDD_OK = `# TDD

## T-001 — do it [pending]

- Refs: AC-001
- Files: src/a.js
`;

const base = (over = {}) => ({
  '.spec/SCOPE.md': APPROVED_SCOPE,
  '.spec/features/f/PRD.md': PRD_OK,
  '.spec/features/f/RFC.md': MINIMAL_RFC,
  '.spec/features/f/TDD.md': TDD_OK,
  'src/a.js': 'export const a = 1;\n',
  'test/a.test.js': "test('does it @spec:AC-001', () => {});\n",
  ...over,
});

test('an unapproved scope turns G0 red and blocks everything after it @spec:AC-004', () => {
  const { gates } = auditOf(base({ '.spec/SCOPE.md': '**Scope status:** Draft\n' }));
  assert.equal(gate(gates, 'G0').state, 'red');
  for (const id of ['G1', 'G2', 'G3', 'G4', 'G5']) {
    assert.equal(gate(gates, id).state, 'blocked', `${id} must be blocked, not red`);
    assert.equal(gate(gates, id).blockedBy, 'G0');
  }
  assert.equal(gates.exitCode, 1, 'the exit code IS the failing gate number');
});

test('a story with no criterion is a finding @spec:AC-005', () => {
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': '### US-001 — lonely\n' }));
  assert.ok(has(audit, 'US_WITHOUT_AC'));
  assert.match(findingsFor(audit, 'US_WITHOUT_AC')[0].message, /US-001/);
});

test('an incomplete criterion names the missing clause @spec:AC-006', () => {
  const prd = '### US-001 — x\n\n#### AC-001 — y\n\n- **Given** a\n- **When** b\n';
  const { audit } = auditOf(base({ '.spec/features/f/PRD.md': prd }));
  assert.match(findingsFor(audit, 'AC_INCOMPLETE')[0].message, /then/);
});

test('a decision with fewer than two alternatives is a finding @spec:AC-007', () => {
  const rfc = MINIMAL_RFC.replace('2. *Two.* second\n', '');
  const { audit, gates } = auditOf(base({ '.spec/features/f/RFC.md': rfc }));
  assert.ok(has(audit, 'DECISION_WITHOUT_ALTERNATIVE'));
  assert.equal(gate(gates, 'G2').state, 'red');
});

test('a missing assumptions or questions section is a finding @spec:AC-008', () => {
  const rfc = MINIMAL_RFC.replace('## Assumptions', '## Notes');
  const { audit } = auditOf(base({ '.spec/features/f/RFC.md': rfc }));
  assert.ok(has(audit, 'SECTION_MISSING'));
});

test('an open assumption warns during the work and errors once the feature claims done @spec:AC-009', () => {
  const rfcOpen = MINIMAL_RFC.replace('*(status: confirmed)*', '*(status: open)*');

  const during = auditOf(base({ '.spec/features/f/RFC.md': rfcOpen }));
  assert.equal(findingsFor(during.audit, 'ASM_OPEN')[0].severity, 'warning');

  const done = auditOf(
    base({
      '.spec/features/f/RFC.md': rfcOpen,
      '.spec/features/f/PRD.md': `# PRD\n\n> status: implemented\n${PRD_OK}`,
    })
  );
  assert.equal(findingsFor(done.audit, 'ASM_OPEN')[0].severity, 'error');
});

test('a criterion covered by no task is a finding @spec:AC-010', () => {
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': '## T-001 — x [pending]\n\n- Refs: US-999\n' }));
  assert.ok(has(audit, 'AC_WITHOUT_TASK'));
});

test('a task referencing an undefined code is a finding @spec:AC-011', () => {
  const tdd = TDD_OK.replace('- Refs: AC-001', '- Refs: AC-001, AC-777');
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': tdd }));
  assert.match(findingsFor(audit, 'REF_BROKEN')[0].message, /AC-777/);
});

test('a task with no declared files is reported as never parallelizable @spec:AC-012', () => {
  const tdd = TDD_OK.replace('- Files: src/a.js\n', '');
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': tdd }));
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
  const tdd = TDD_OK.replace('[pending]', '[done]');
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': tdd }));
  assert.ok(has(audit, 'TASK_DONE_WITHOUT_PROOF'));
});

test('a task with real PASS proof is accepted as done @spec:AC-014', () => {
  const verification = JSON.stringify({
    feature: 'f',
    results: { 'AC-001': { status: 'pass', testName: 'does it' } },
  });
  const { audit } = auditOf(
    base({
      '.spec/features/f/TDD.md': TDD_OK.replace('[pending]', '[done]'),
      '.spec/verification/f.json': verification,
    })
  );
  assert.equal(has(audit, 'TASK_DONE_WITHOUT_PROOF'), false);
});

test('a task whose refs reach no criterion is named @spec:AC-049', () => {
  // `US-001` resolves, so REF_BROKEN stays quiet and the task looks fine. But
  // proof is granted per criterion, and the proof check filters this reference
  // out silently — so the task can never be proven and nothing said so.
  const tdd = TDD_OK.replace('- Refs: AC-001', '- Refs: US-001');
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': tdd }));

  assert.equal(has(audit, 'REF_BROKEN'), false, 'the reference does resolve');
  const found = findingsFor(audit, 'REF_WITHOUT_AC');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /T-001 references US-001/);
  assert.match(found[0].message, /grant it proof/);
});

test('a task carrying at least one criterion is left alone @spec:AC-049', () => {
  // Referencing the story for context alongside a criterion is normal, and it
  // costs nothing — the finding fires only when proof is impossible.
  const tdd = TDD_OK.replace('- Refs: AC-001', '- Refs: US-001, AC-001');
  const { audit } = auditOf(base({ '.spec/features/f/TDD.md': tdd }));
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
  const { audit } = auditOf(
    base({ '.spec/features/g/PRD.md': PRD_OK, '.spec/features/g/RFC.md': MINIMAL_RFC })
  );
  assert.ok(has(audit, 'ID_DUPLICATE'), 'codes are unique project-wide, not per document');
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
