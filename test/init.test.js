import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initProject, newFeature, newRfc, detectAgent, AGENT_SKILL_DIRS, LOCKFILE_NAME } from '../src/core/init.js';
import { createHash } from 'crypto';
import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';
import { auditProject } from '../src/core/audit.js';
import { evaluateGates } from '../src/core/gates.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-init-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('init scaffolds a project and installs the agent skill @spec:AC-001', () => {
  fresh((root) => {
    const report = initProject(root, { project: 'Demo', owner: 'TI' });
    for (const rel of [
      '.spec/SCOPE.md',
      '.spec/CONSTITUTION.md',
      'adp.config.json',
      '.claude/skills/adp/SKILL.md',
    ]) {
      assert.ok(existsSync(path.join(root, rel)), `${rel} must exist after init`);
    }
    assert.equal(report.kept.length, 0);
    // the whole payload, not just the specification directory
    for (const rel of [
      'AGENTS.md',
      'docs/USAGE.md',
      '.spec/CHANGELOG.md',
      '.claude/agents/techlead.md',
      '.claude/skills/create-rfc/SKILL.md',
    ]) {
      assert.ok(existsSync(path.join(root, rel)), `${rel} must be installed by init`);
    }
    const scope = readFileSync(path.join(root, '.spec', 'SCOPE.md'), 'utf-8');
    assert.match(scope, /Demo/);
    assert.match(scope, /TI/);
    assert.equal(scope.includes('{{'), false, 'no placeholder may survive into the written file');
  });
});

test('a scaffolded scope starts unapproved, so G0 is red on purpose @spec:AC-001', () => {
  fresh((root) => {
    initProject(root);
    const audit = auditProject(loadProject(loadConfig(root)));
    const gates = evaluateGates(audit.findings);
    assert.equal(gates.firstRed, 'G0');
    assert.equal(gates.exitCode, 1);
  });
});

test('re-running init destroys nothing and reports what it kept @spec:AC-002', () => {
  fresh((root) => {
    initProject(root);
    const edited = '# my own scope\n\n**Scope status:** Approved\n';
    writeFileSync(path.join(root, '.spec', 'SCOPE.md'), edited);

    const second = initProject(root);

    assert.equal(
      readFileSync(path.join(root, '.spec', 'SCOPE.md'), 'utf-8'),
      edited,
      'an edited file must survive byte for byte'
    );
    assert.equal(second.created.length, 0);
    assert.ok(second.kept.includes('.spec/SCOPE.md'));
  });
});

test('init recreates only what was deleted @spec:AC-002', () => {
  fresh((root) => {
    initProject(root);
    rmSync(path.join(root, '.spec', 'CONSTITUTION.md'));
    const second = initProject(root);
    assert.deepEqual(second.created, ['.spec/CONSTITUTION.md']);
    assert.ok(second.kept.length > 0);
  });
});

test('the agent is detected from the directories already present @spec:AC-001', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.cursor'), { recursive: true });
    const report = initProject(root);
    assert.equal(report.agent, 'cursor');
    assert.ok(existsSync(path.join(root, AGENT_SKILL_DIRS.cursor, 'adp', 'SKILL.md')));
  });
});

test('an ambiguous project says so instead of guessing silently @spec:AC-001', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.claude'), { recursive: true });
    mkdirSync(path.join(root, '.cursor'), { recursive: true });
    const report = initProject(root);
    assert.match(report.notes.join(' '), /more than one agent directory/);
  });
});

test('an unknown agent name is refused, not silently ignored @spec:AC-001', () => {
  assert.throws(() => detectAgent('/tmp', 'emacs'), /unknown agent/);
});

test('minimal installs the engine contract and nothing else @spec:AC-001', () => {
  fresh((root) => {
    const report = initProject(root, { minimal: true });
    assert.ok(existsSync(path.join(root, '.claude/skills/adp/SKILL.md')));
    assert.equal(existsSync(path.join(root, '.claude/skills/create-rfc/SKILL.md')), false);
    assert.equal(existsSync(path.join(root, 'AGENTS.md')), false);
    assert.equal(existsSync(path.join(root, 'docs/USAGE.md')), false);
    assert.equal(report.minimal, true);
  });
});

test('a non-Claude agent gets the skills but not the role agents @spec:AC-001', () => {
  fresh((root) => {
    const report = initProject(root, { agent: 'cursor' });
    assert.ok(existsSync(path.join(root, '.cursor/skills/adp/SKILL.md')));
    assert.equal(existsSync(path.join(root, '.claude/agents/techlead.md')), false);
    assert.match(report.notes.join(' '), /Claude Code features/);
  });
});

test('a stale singular .claude/skill directory is called out @spec:AC-002', () => {
  fresh((root) => {
    mkdirSync(path.join(root, '.claude', 'skill', 'legacy'), { recursive: true });
    const report = initProject(root);
    assert.match(report.notes.join(' '), /only reads `\.claude\/skills\/`/);
  });
});

test('init writes a lockfile whose hashes match the payload it just installed @spec:AC-051', () => {
  fresh((root) => {
    initProject(root, { project: 'Demo', owner: 'TI' });
    const lockPath = path.join(root, '.spec', LOCKFILE_NAME);
    assert.ok(existsSync(lockPath), 'the lockfile must exist after init');

    const lockfile = JSON.parse(readFileSync(lockPath, 'utf-8'));
    assert.equal(lockfile.algorithm, 'sha256');
    assert.equal(lockfile.fileCount, Object.keys(lockfile.files).length);
    assert.ok(lockfile.fileCount > 0);

    for (const [projectRel, expected] of Object.entries(lockfile.files)) {
      const actual = createHash('sha256').update(readFileSync(path.join(root, projectRel))).digest('hex');
      assert.equal(actual, expected, `${projectRel} hash must match what was just written`);
    }
  });
});

test('re-running init never touches an existing lockfile @spec:AC-051', () => {
  fresh((root) => {
    initProject(root);
    const lockPath = path.join(root, '.spec', LOCKFILE_NAME);
    const before = readFileSync(lockPath, 'utf-8');

    const second = initProject(root);

    assert.equal(readFileSync(lockPath, 'utf-8'), before);
    assert.ok(second.kept.includes(`.spec/${LOCKFILE_NAME}`));
  });
});

test('the lockfile excludes SCOPE.md, since its content is per-project @spec:AC-051', () => {
  fresh((root) => {
    initProject(root, { project: 'Demo', owner: 'TI' });
    const lockfile = JSON.parse(readFileSync(path.join(root, '.spec', LOCKFILE_NAME), 'utf-8'));
    assert.equal(Object.prototype.hasOwnProperty.call(lockfile.files, '.spec/SCOPE.md'), false);
  });
});

test('--agent none installs no skill @spec:AC-001', () => {
  fresh((root) => {
    const report = initProject(root, { agent: 'none' });
    assert.equal(report.agent, 'none');
    assert.equal(report.created.some((f) => f.includes('SKILL.md')), false);
  });
});

test('new refuses a feature name the grammar cannot carry @spec:AC-002', () => {
  fresh((root) => {
    initProject(root);
    assert.throws(() => newFeature(root, 'Hello World'), /lower-case/);
    assert.throws(() => newFeature(root, ''), /lower-case/);
  });
});

test('new creates PRD and SPEC by default; DESIGN.md is not due at light ceremony @spec:AC-002 @spec:AC-058', () => {
  fresh((root) => {
    initProject(root);
    const first = newFeature(root, 'alpha');
    assert.equal(first.created.length, 2, 'no signals declared means light ceremony (M2b) — DESIGN.md is skipped');
    assert.deepEqual(first.created.sort(), ['.spec/features/alpha/PRD.md', '.spec/features/alpha/SPEC.md']);
    assert.equal(first.ceremony.level, 'light');
    // A ceremony note is expected; codes-in-use is not — first feature ever.
    assert.equal(first.notes.filter((n) => /codes already in use/.test(n)).length, 0);

    const second = newFeature(root, 'beta');
    assert.match(second.notes.join(' '), /codes are unique project-wide/);
  });
});

test('new --signals raises the ceremony level and scaffolds DESIGN.md too @spec:AC-058', () => {
  fresh((root) => {
    initProject(root);
    const report = newFeature(root, 'payment-flow', { signals: ['money-or-pii'] });
    assert.equal(report.created.length, 3, 'full ceremony requires DESIGN.md up front');
    assert.deepEqual(report.created.sort(), [
      '.spec/features/payment-flow/DESIGN.md',
      '.spec/features/payment-flow/PRD.md',
      '.spec/features/payment-flow/SPEC.md',
    ]);
    assert.equal(report.ceremony.level, 'full');
    assert.equal(report.ceremony.requiresRfc, true);

    const prd = readFileSync(path.join(root, '.spec/features/payment-flow/PRD.md'), 'utf8');
    assert.match(prd, /> signals: money-or-pii/);
  });
});

test('new --signals with an unrecognized slug quietly drops it — the parser leaves it for SIGNAL_UNKNOWN to catch @spec:AC-058', () => {
  fresh((root) => {
    initProject(root);
    const report = newFeature(root, 'gamma', { signals: ['not-a-real-signal'] });
    assert.equal(report.ceremony.level, 'light', 'an unrecognized slug contributes nothing to the level');
    assert.equal(report.created.length, 2);
  });
});

test('newRfc creates a numbered, global decision record, decoupled from any feature @spec:AC-007', () => {
  fresh((root) => {
    initProject(root);
    const first = newRfc(root, 'queue-provider');
    assert.equal(first.id, 'RFC-001');
    assert.deepEqual(first.created, ['.spec/rfc/RFC-001-queue-provider.md']);
    assert.match(first.notes.join(' '), /rfcs: RFC-001/);

    const second = newRfc(root, 'auth-strategy');
    assert.equal(second.id, 'RFC-002', 'numbering is global, not per feature');
    assert.deepEqual(second.created, ['.spec/rfc/RFC-002-auth-strategy.md']);
  });
});

test('newRfc refuses a slug the grammar cannot carry @spec:AC-007', () => {
  fresh((root) => {
    initProject(root);
    assert.throws(() => newRfc(root, 'Bad Slug'), /lower-case/);
  });
});

test('an empty folder reaches every gate green once the documents are filled in @spec:AC-018', () => {
  fresh((root) => {
    initProject(root, { agent: 'none' });
    writeFileSync(
      path.join(root, '.spec', 'SCOPE.md'),
      '**Scope status:** Approved\n\n## 3. Features\n\n- **MVP (prioritized):**\n  - [ ] greet\n'
    );
    newFeature(root, 'greet');

    const dir = path.join(root, '.spec', 'features', 'greet');
    // newFeature() already scaffolded the three feature documents from the
    // payload templates; overwrite each with real content rather than
    // leaving the placeholder text, which would pass the gates for the wrong
    // reason. The RFC is scaffolded separately (Q-001: no longer nested).
    writeFileSync(path.join(dir, 'PRD.md'), '# PRD\n\n> feature: greet\n> status: draft\n> rfcs: RFC-001\n');
    mkdirSync(path.join(root, '.spec', 'rfc'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'rfc', 'RFC-001-greet.md'),
      '## Purpose\n\nSupport tickets about greeting format take 20 minutes to resolve.\n\n### D-001 — format\n\n**Alternatives considered**\n\n1. *Plain.* a\n2. *Localized.* b\n\n**Decision: alternative 1 — plain.**\n'
    );
    writeFileSync(path.join(dir, 'DESIGN.md'), '# DESIGN\n\n## 1. Shape of the solution\n');
    writeFileSync(
      path.join(dir, 'SPEC.md'),
      '### US-001 — a visitor is greeted\n\n#### AC-001 — it names them\n\n' +
        '- **Given** a visitor\n- **When** greeted\n- **Then** the name appears\n\n' +
        '## Assumptions\n\n- **ASM-001** — names exist *(status: confirmed)*\n\n' +
        '## Open questions\n\n- **Q-001** — anonymous? *(status: answered)*\n\n' +
        '## T-001 — greeting [pending]\n\n- Refs: AC-001\n- Files: src/greet.js\n'
    );
    mkdirSync(path.join(root, 'src'), { recursive: true });
    mkdirSync(path.join(root, 'test'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'greet.js'), 'export const greet = (n) => n;\n');
    writeFileSync(path.join(root, 'test', 'greet.test.js'), "test('names them @spec:AC-001', () => {});\n");

    const audit = auditProject(loadProject(loadConfig(root)));
    const gates = evaluateGates(audit.findings);
    assert.equal(gates.exitCode, 0, `expected all gates green, first red was ${gates.firstRed}`);
  });
});

// AC-050 — the agent contract, checked for content rather than for existence.
//
// Everything else about this file was already asserted: that it installs, and
// where. Nothing read it. T-027's own notes enumerate what it must carry, and a
// requirement written only in a task note is a requirement one careless edit
// away from being gone — which is the exact failure this tool exists to catch,
// left standing in the tool's own contract.
test('the agent contract carries what an agent needs to obey it @spec:AC-050', () => {
  const skill = readFileSync(
    path.join(import.meta.dirname, '..', 'payload', 'claude', 'skills', 'adp', 'SKILL.md'),
    'utf8'
  );

  // The vocabulary table: every code an agent must translate for a human.
  for (const code of ['US-xxx', 'AC-xxx', 'T-xxx', 'ASM-xxx', 'Q-xxx', 'D-xxx', 'P-xxx']) {
    assert.ok(skill.includes(code), `the vocabulary table must map ${code}`);
  }

  // The finding catalogue, so an agent can act on a code without guessing.
  for (const code of ['SCOPE_NOT_APPROVED', 'AC_WITHOUT_PROOF', 'TASK_DONE_WITHOUT_PROOF']) {
    assert.ok(skill.includes(code), `the finding catalogue must carry ${code}`);
  }

  // The rule the whole product rests on.
  assert.match(skill, /Proof comes from `verify`/i);

  // The iteration cap. Without it a failing gate becomes a loop that spends the
  // human's money instead of their attention.
  assert.match(skill, /three attempts/i, 'a red gate must escalate to the human, not iterate forever');
  assert.match(skill, /STOP and bring the findings to the person/i);

  // Graceful degradation must never be presented as the mechanical verdict.
  assert.match(skill, /WEAK PROOF \(manual audit\)/);

  // Consent is the human's to give, in both places it can be asked for.
  assert.match(skill, /Never approve on the person's behalf/i);
});
