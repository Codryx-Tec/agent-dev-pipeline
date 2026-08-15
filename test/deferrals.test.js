// M5b: DEFERRALS.md — the honest kind of "living with a real finding"
// (SCOPE-0.6.0.md §12.1, "camada 2"). parseDeferrals tested directly; the
// six rules and --strict tested through the real audit engine, the same
// posture baseline.test.js takes toward its own ratchet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeferrals } from '../src/parsers/deferrals.js';
import { auditOf, approvedScope, MINIMAL_RFC, findingsFor, has, gate } from './helpers.js';

// ---------------------------------------------------------- parseDeferrals

test('parseDeferrals reads every field of a DEF-xxx block @spec:AC-102', () => {
  const md = `# Deferrals

## DEF-001 — orphan src file

- Finding: FILE_ORPHAN
- Scope: src/orphan.js
- Owner: alice
- Reason: legacy, cleaned up next sprint
- Opened: 2026-08-01
- Until: 2026-09-01
`;
  const parsed = parseDeferrals(md, 'DEFERRALS.md');
  assert.equal(parsed.present, true);
  assert.equal(parsed.items.length, 1);
  const d = parsed.items[0];
  assert.equal(d.id, 'DEF-001');
  assert.equal(d.title, 'orphan src file');
  assert.equal(d.finding, 'FILE_ORPHAN');
  assert.equal(d.scope, 'src/orphan.js');
  assert.equal(d.owner, 'alice');
  assert.equal(d.reason, 'legacy, cleaned up next sprint');
  assert.equal(d.opened, '2026-08-01');
  assert.equal(d.until, '2026-09-01');
  assert.equal(d.renewals, 0);
});

test('a second Until: line is a renewal, and the LAST one is the active deadline @spec:AC-102', () => {
  const md = `## DEF-001 — t

- Finding: FILE_ORPHAN
- Scope: src/a.js
- Owner: alice
- Reason: r
- Opened: 2026-08-01
- Until: 2026-09-01
- Until: 2026-12-01
`;
  const [d] = parseDeferrals(md, 'DEFERRALS.md').items;
  assert.deepEqual(d.untilDates, ['2026-09-01', '2026-12-01']);
  assert.equal(d.until, '2026-12-01', 'the active deadline is the last line, not the first');
  assert.equal(d.renewals, 1);
});

test('no DEFERRALS.md at all parses as absent, not an empty list mistaken for zero debt @spec:AC-102', () => {
  const parsed = parseDeferrals(null, 'DEFERRALS.md');
  assert.equal(parsed.present, false);
  assert.deepEqual(parsed.items, []);
});

test('two DEF-xxx blocks are read independently @spec:AC-102', () => {
  const md = `## DEF-001 — a

- Finding: FILE_ORPHAN
- Scope: src/a.js
- Owner: alice
- Reason: r
- Opened: 2026-08-01
- Until: 2026-09-01

## DEF-002 — b

- Finding: TEST_ORPHAN
- Scope: test/legacy/**
- Owner: bob
- Reason: r2
- Opened: 2026-08-02
- Until: 2026-09-02
`;
  const parsed = parseDeferrals(md, 'DEFERRALS.md');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[1].id, 'DEF-002');
  assert.equal(parsed.items[1].owner, 'bob');
});

// -------------------------------------------------------------- fixtures

// A clean-ish chain (borrowed from gates.test.js's own clean-project fixture)
// plus one file mapped by no task, so FILE_ORPHAN — a G6, CI-escalating
// warning — always has something real to defer.
function chain(extraFiles = {}) {
  return {
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
    'src/orphan.js': 'export const b = 1;\n',
    'test/a.test.js': "test('y @spec:AC-001', () => {});\n",
    ...extraFiles,
  };
}

const NOW = new Date('2026-08-14T00:00:00Z');

function deferralsMd(block) {
  return `# Deferrals\n\n${block}`;
}

// -------------------------------------------------------------- suppression

test('a valid deferral suppresses its matching finding from the error/warning count @spec:AC-103', () => {
  const { audit, gates } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — orphan src file\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: cleaned up next sprint\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW });

  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.ok(finding);
  assert.equal(finding.deferred, true);
  assert.equal(finding.deferredBy, 'DEF-001');
  assert.equal(audit.deferredCount, 1);
  assert.equal(gate(gates, 'G6').deferred, 1);
});

test('--ci still honors a valid deferral — the whole point is a pipeline that stays green on purpose @spec:AC-104', () => {
  const files = chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — orphan src file\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: cleaned up next sprint\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  });

  const withoutDeferral = auditOf(chain(), { ci: true, now: NOW });
  assert.equal(gate(withoutDeferral.gates, 'G6').errors > 0, true, 'sanity: FILE_ORPHAN really does escalate under --ci');

  const withDeferral = auditOf(files, { ci: true, now: NOW });
  assert.equal(gate(withDeferral.gates, 'G6').errors, 0);
  assert.equal(gate(withDeferral.gates, 'G6').deferred, 1);
});

test('--strict ignores DEFERRALS.md entirely and shows the real state @spec:AC-105', () => {
  const files = chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — orphan src file\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: cleaned up next sprint\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  });
  const { audit, gates } = auditOf(files, { ci: true, strict: true, now: NOW });
  assert.equal(gate(gates, 'G6').errors > 0, true, '--strict must not honor even a perfectly valid deferral');
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, undefined);
  assert.equal(audit.deferredCount, 0);
  assert.equal(has(audit, 'DEFERRAL_WITHOUT_OWNER'), false, 'strict skips validating the file too — it is as if it were absent');
});

// -------------------------------------------------------------- the six rules

test('a deferral with no Owner is DEFERRAL_WITHOUT_OWNER, and defers nothing @spec:AC-106', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Reason: r\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_WITHOUT_OWNER'));
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, undefined);
});

test('a deferral with no Reason is also DEFERRAL_WITHOUT_OWNER @spec:AC-106', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_WITHOUT_OWNER'));
});

test('a deferral with no Until: line is DEFERRAL_WITHOUT_DEADLINE @spec:AC-107', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-08-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_WITHOUT_DEADLINE'));
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, undefined);
});

test('an Until: beyond the maxDays ceiling is DEFERRAL_TOO_LONG, and grants no protection @spec:AC-108', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-08-01\n- Until: 2027-06-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_TOO_LONG'));
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, undefined);
});

test('deferring a code that is not G5/G6 is DEFERRAL_NOT_ELIGIBLE @spec:AC-109', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: SCOPE_NOT_APPROVED\n- Scope: f\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_NOT_ELIGIBLE'));
});

test('deferring a never-deferrable G5 code (AC_WITHOUT_PROOF) is also DEFERRAL_NOT_ELIGIBLE @spec:AC-109', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: AC_WITHOUT_PROOF\n- Scope: f\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_NOT_ELIGIBLE'));
  // AC_WITHOUT_PROOF must still fire at full strength — "não se adia a
  // recusa sobre a qual tudo se apoia."
  const finding = findingsFor(audit, 'AC_WITHOUT_PROOF')[0];
  assert.ok(finding);
  assert.equal(finding.deferred, undefined);
});

test('a scope matching more than deferrals.maxMatches findings is DEFERRAL_TOO_BROAD @spec:AC-110', () => {
  const { audit } = auditOf(chain({
    'src/orphan2.js': 'export const c = 1;\n',
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan*.js\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-08-01\n- Until: 2026-09-01\n`
    ),
  }), { now: NOW, config: { deferrals: { maxMatches: 1 } } });
  assert.ok(has(audit, 'DEFERRAL_TOO_BROAD'));
  for (const f of findingsFor(audit, 'FILE_ORPHAN')) assert.equal(f.deferred, undefined);
});

test('an expired deferral reverts its finding to full severity and reports DEFERRAL_EXPIRED @spec:AC-111', () => {
  const { audit, gates } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n` +
        `- Owner: alice\n- Reason: r\n- Opened: 2026-01-01\n- Until: 2026-02-01\n`
    ),
  }), { ci: true, now: NOW });
  assert.ok(has(audit, 'DEFERRAL_EXPIRED'));
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, undefined, 'expired protects nothing — the finding is back at full severity');
  assert.equal(gate(gates, 'G6').errors > 0, true, 'under --ci an expired deferral must not keep FILE_ORPHAN from escalating');
});

test('a third renewal is DEFERRAL_RENEWED_REPEATEDLY, but still defers — it is a warning, not a refusal @spec:AC-112', () => {
  const { audit } = auditOf(chain({
    '.spec/DEFERRALS.md': deferralsMd(
      `## DEF-001 — t\n\n- Finding: FILE_ORPHAN\n- Scope: src/orphan.js\n- Owner: alice\n- Reason: r\n` +
        `- Opened: 2026-01-01\n- Until: 2026-03-01\n- Until: 2026-05-01\n- Until: 2026-07-01\n- Until: 2026-10-01\n`
    ),
  }), { now: NOW });
  assert.ok(has(audit, 'DEFERRAL_RENEWED_REPEATEDLY'));
  const finding = findingsFor(audit, 'FILE_ORPHAN').find((f) => f.file === 'src/orphan.js');
  assert.equal(finding.deferred, true, 'a renewed-too-often deferral is a smell, not by itself grounds to stop protecting the finding');
});
