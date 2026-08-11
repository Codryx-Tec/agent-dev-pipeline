import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GATES, LABELS, allMappedCodes, evaluateGates, gateOf } from '../src/core/gates.js';
import { renderTerminal, renderPrompt } from '../src/core/report.js';
import { auditOf, approvedScope, MINIMAL_RFC, gate } from './helpers.js';
import { ATTEMPT_CAP } from '../src/core/prompts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Read every code the engine can actually emit, straight from the source. A
// hand-maintained list here would drift from reality — which is exactly the
// drift this whole tool exists to catch.
function emittedCodes() {
  const sources = ['../src/core/audit.js', '../src/core/principles.js'].map((f) =>
    readFileSync(path.join(HERE, f), 'utf-8')
  );
  const found = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/emit\(\s*'([A-Z_]+)'/g)) found.add(m[1]);
  }
  return found;
}

test('every code the audit can emit is mapped to exactly one gate @spec:AC-004', () => {
  const mapped = allMappedCodes();
  const unmapped = [...emittedCodes()].filter((c) => !mapped.has(c));
  assert.deepEqual(unmapped, [], 'an unmapped code belongs to no gate and is invisible on the board');
});

test('no code is claimed by two gates @spec:AC-004', () => {
  const seen = new Map();
  for (const g of GATES) {
    for (const code of g.codes) {
      assert.equal(seen.has(code), false, `${code} is claimed by ${seen.get(code)} and ${g.id}`);
      seen.set(code, g.id);
    }
  }
});

test('every mapped code has a human-readable label @spec:AC-024', () => {
  const missing = [...allMappedCodes()].filter((c) => !LABELS[c]);
  assert.deepEqual(missing, [], 'a code with no label forces the reader to know the catalogue');
});

test('gates after the first red one are blocked, never red @spec:AC-004', () => {
  const findings = [
    { code: 'PRD_MISSING', severity: 'error', message: 'x' },
    { code: 'SPEC_WITHOUT_US', severity: 'error', message: 'y' },
  ];
  const ev = evaluateGates(findings);
  assert.equal(gate(ev, 'G1').state, 'red');
  assert.equal(gate(ev, 'G4').state, 'blocked');
  assert.equal(ev.firstRed, 'G1');
  assert.equal(ev.exitCode, 2);
});

test('warnings alone never turn a gate red @spec:AC-004', () => {
  const ev = evaluateGates([{ code: 'AC_WITHOUT_TASK', severity: 'warning', message: 'x' }]);
  assert.equal(gate(ev, 'G4').state, 'green');
  assert.equal(ev.exitCode, 0);
});

test('gateOf resolves a known code and refuses an unknown one @spec:AC-024', () => {
  assert.equal(gateOf('AC_WITHOUT_TEST'), 'G5');
  assert.equal(gateOf('NOT_A_REAL_CODE'), null);
});

test('a finding renders its readable name before its stable code @spec:AC-024', () => {
  const { audit, gates } = auditOf({
    '.spec/SCOPE.md': approvedScope(),
    '.spec/features/f/PRD.md': '# PRD\n\n> rfcs: RFC-001\n',
    '.spec/rfc/RFC-001-t.md': MINIMAL_RFC,
    '.spec/features/f/DESIGN.md': '# DESIGN\n',
    '.spec/features/f/SPEC.md': '### US-001 — lonely\n\n## T-001 — x [pending]\n\n- Refs: US-001\n- Files: src/a.js\n',
  });
  const text = renderTerminal(audit, gates);
  assert.match(text, /user story without acceptance criterion \(US_WITHOUT_AC\)/);
});

test('a red gate produces a paste-ready prompt with its findings @spec:AC-023', () => {
  const ev = evaluateGates([
    { code: 'US_WITHOUT_AC', severity: 'error', message: 'US-001 has no criterion', file: 'SPEC.md', line: 3 },
  ]);
  const prompt = renderPrompt(gate(ev, 'G4'));
  assert.match(prompt, /Gate G4/);
  assert.match(prompt, /US_WITHOUT_AC/);
  assert.match(prompt, /SPEC\.md:3/);
  // The iteration cap belongs in the prompt itself: without it, an agent will
  // grind at the same finding forever instead of escalating. Asserted against
  // the constant rather than against the wording, so the text and the cap
  // cannot drift apart — the prompt is generated FROM that constant.
  assert.match(prompt, new RegExp(`${ATTEMPT_CAP} attempts`));
});

test('a clean project exits 0 with no red gate @spec:AC-018', () => {
  const { gates } = auditOf({
    '.spec/SCOPE.md': approvedScope(),
    '.spec/features/f/PRD.md': '# PRD\n\n> rfcs: RFC-001\n',
    '.spec/rfc/RFC-001-t.md': MINIMAL_RFC,
    '.spec/features/f/DESIGN.md': '# DESIGN\n',
    '.spec/features/f/SPEC.md':
      '### US-001 — x\n\n#### AC-001 — y\n\n- **Given** a\n- **When** b\n- **Then** c\n\n' +
      '## Assumptions\n\n- **ASM-001** — a *(status: confirmed)*\n\n' +
      '## Open questions\n\n- **Q-001** — a *(status: answered)*\n\n' +
      '## T-001 — x [pending]\n\n- Refs: AC-001\n- Files: src/a.js\n',
    'src/a.js': 'export const a = 1;\n',
    'test/a.test.js': "test('y @spec:AC-001', () => {});\n",
  });
  assert.equal(gates.exitCode, 0, 'a complete chain must be able to reach green');
});
