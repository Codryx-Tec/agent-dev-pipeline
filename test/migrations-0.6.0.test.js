import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { check, apply, version, description } from '../src/migrations/0.6.0.js';
import { pendingMigrations } from '../src/migrations/index.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-mig06-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function featureDir(root, name = 'greet') {
  const dir = path.join(root, 'features', name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const PRD_SOURCE = `# PRD

> feature: greet
> status: draft

## Context

Why this matters.

### US-001 — a visitor is greeted

As a visitor, I want a greeting, so that I feel welcome.

#### AC-001 — it names them

- **Given** a visitor
- **When** greeted
- **Then** the name appears

## Out of scope for this PRD

Nothing else.
`;

const RFC_SOURCE = `# RFC

## Purpose

Why we chose this.

## Decisions

### D-001 — format

**Alternatives considered**

1. *Plain.* a
2. *Localized.* b

**Decision: alternative 1 — plain.**

## Assumptions

- **ASM-001** — names exist *(status: confirmed)*

## Open questions

- **Q-001** — anonymous? *(status: answered)*
`;

const TDD_SOURCE = `# TDD

## 1. Shape of the solution

A simple function.

## Tasks

## T-001 — greeting [pending]

- Refs: AC-001
- Files: src/greet.js

## Expected parallelism

Just one task.
`;

function writeLegacyFeature(dir) {
  writeFileSync(path.join(dir, 'PRD.md'), PRD_SOURCE);
  writeFileSync(path.join(dir, 'RFC.md'), RFC_SOURCE);
  writeFileSync(path.join(dir, 'TDD.md'), TDD_SOURCE);
}

test('this migration identifies itself as 0.6.0 @spec:AC-056', () => {
  assert.equal(version, '0.6.0');
  assert.match(description, /PRD\/RFC\/SPEC\/DESIGN|SPEC\/DESIGN/);
});

test('extraction moves US/AC, ASM/Q and T-xxx into one new SPEC.md, in order @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);

    assert.equal(check(root), false);
    const result = apply(root, { dryRun: false });
    assert.equal(result.notes.length, 0);
    assert.equal(check(root), true);

    const spec = readFileSync(path.join(dir, 'SPEC.md'), 'utf8');
    const order = ['## Stories', '## Assumptions', '## Open questions', '## Tasks'].map((h) => spec.indexOf(h));
    assert.ok(order.every((i) => i !== -1), 'all four sections must be present');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections must appear in the fixed order');
    assert.match(spec, /### US-001 — a visitor is greeted/);
    assert.match(spec, /#### AC-001 — it names them/);
    assert.match(spec, /\*\*ASM-001\*\* — names exist/);
    assert.match(spec, /\*\*Q-001\*\* — anonymous\?/);
    assert.match(spec, /## T-001 — greeting \[pending\]/);
  });
});

test('PRD.md keeps its prose and loses only the extracted story @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);
    apply(root, { dryRun: false });

    const prd = readFileSync(path.join(dir, 'PRD.md'), 'utf8');
    assert.match(prd, /Why this matters\./, 'prose must survive untouched');
    assert.match(prd, /## Out of scope for this PRD/);
    assert.equal(prd.includes('US-001'), false, 'the story must have moved out');
  });
});

test('RFC un-nests to the global family, keeping its decision and losing only Assumptions/Open questions @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);
    apply(root, { dryRun: false });

    assert.equal(existsSync(path.join(dir, 'RFC.md')), false, 'RFC.md must not stay nested under the feature');
    const rfc = readFileSync(path.join(root, 'rfc', 'RFC-001-greet.md'), 'utf8');
    assert.match(rfc, /### D-001 — format/, 'the decision must survive untouched');
    assert.match(rfc, /\*\*Decision: alternative 1 — plain\.\*\*/);
    assert.equal(rfc.includes('ASM-001'), false);
    assert.equal(rfc.includes('Q-001'), false);
  });
});

test('PRD.md gains an rfcs: link pointing at the relocated RFC @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);
    apply(root, { dryRun: false });

    const prd = readFileSync(path.join(dir, 'PRD.md'), 'utf8');
    assert.match(prd, /^> rfcs: RFC-001$/m);
  });
});

test('RFC numbers are allocated globally across features, in directory order @spec:AC-056', () => {
  fresh((root) => {
    featureDir(root, 'alpha');
    writeLegacyFeature(path.join(root, 'features', 'alpha'));
    featureDir(root, 'beta');
    writeLegacyFeature(path.join(root, 'features', 'beta'));

    apply(root, { dryRun: false });

    assert.ok(existsSync(path.join(root, 'rfc', 'RFC-001-alpha.md')));
    assert.ok(existsSync(path.join(root, 'rfc', 'RFC-002-beta.md')));
    assert.match(readFileSync(path.join(root, 'features', 'alpha', 'PRD.md'), 'utf8'), /> rfcs: RFC-001/);
    assert.match(readFileSync(path.join(root, 'features', 'beta', 'PRD.md'), 'utf8'), /> rfcs: RFC-002/);
  });
});

test('a fresh number never collides with an RFC that already exists @spec:AC-056', () => {
  fresh((root) => {
    mkdirSync(path.join(root, 'rfc'), { recursive: true });
    writeFileSync(path.join(root, 'rfc', 'RFC-001-existing.md'), '### D-001 — x\n');
    const dir = featureDir(root);
    writeLegacyFeature(dir);

    apply(root, { dryRun: false });
    assert.ok(existsSync(path.join(root, 'rfc', 'RFC-002-greet.md')), 'numbering must continue past what already exists');
  });
});

test('TDD.md becomes DESIGN.md, keeping its prose and losing only the task @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);
    apply(root, { dryRun: false });

    assert.equal(existsSync(path.join(dir, 'TDD.md')), false, 'TDD.md must be gone');
    const design = readFileSync(path.join(dir, 'DESIGN.md'), 'utf8');
    assert.match(design, /A simple function\./);
    assert.match(design, /## Expected parallelism/);
    assert.equal(design.includes('T-001'), false, 'the task must have moved to SPEC.md');
  });
});

test('idempotent: a second run changes nothing @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);

    const first = apply(root, { dryRun: false });
    assert.ok(first.changed.length > 0);
    assert.equal(check(root), true);

    const second = apply(root, { dryRun: false });
    assert.deepEqual(second.changed, []);
    assert.deepEqual(second.notes, []);
  });
});

test('an existing SPEC.md section is never overwritten, and the gap is reported @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);
    writeFileSync(path.join(dir, 'SPEC.md'), '## Stories\n\nHAND WRITTEN, DO NOT TOUCH\n');

    const result = apply(root, { dryRun: false });
    assert.equal(result.notes.length, 1);
    assert.match(result.notes[0].note, /already has a "Stories" section/);

    const spec = readFileSync(path.join(dir, 'SPEC.md'), 'utf8');
    assert.match(spec, /HAND WRITTEN, DO NOT TOUCH/);
    // What SPEC.md did NOT already own is still merged in.
    assert.match(spec, /## Assumptions/);
    assert.match(spec, /## Tasks/);
  });
});

test('a feature missing PRD or RFC is migrated from whatever exists @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeFileSync(path.join(dir, 'TDD.md'), TDD_SOURCE);

    const result = apply(root, { dryRun: false });
    assert.equal(result.notes.length, 0);
    assert.equal(existsSync(path.join(dir, 'PRD.md')), false);
    assert.equal(existsSync(path.join(dir, 'RFC.md')), false);
    assert.ok(existsSync(path.join(dir, 'DESIGN.md')));
    const spec = readFileSync(path.join(dir, 'SPEC.md'), 'utf8');
    assert.match(spec, /## T-001 — greeting \[pending\]/);
    assert.equal(spec.includes('## Stories'), false, 'nothing to extract means no empty section either');
    assert.equal(existsSync(path.join(root, 'rfc')), false, 'nothing to relocate means no rfc/ directory either');
  });
});

test('dry-run reports the plan without writing or deleting anything @spec:AC-056', () => {
  fresh((root) => {
    const dir = featureDir(root);
    writeLegacyFeature(dir);

    const dry = apply(root, { dryRun: true });
    assert.ok(dry.changed.length > 0);
    assert.ok(existsSync(path.join(dir, 'TDD.md')), 'dry-run must not delete TDD.md');
    assert.equal(existsSync(path.join(dir, 'SPEC.md')), false, 'dry-run must not create SPEC.md');
    assert.match(readFileSync(path.join(dir, 'PRD.md'), 'utf8'), /US-001/, 'dry-run must not touch PRD.md');
    assert.equal(existsSync(path.join(root, 'rfc')), false, 'dry-run must not create the rfc/ directory either');
  });
});

test('check() is true only once every feature directory has lost its TDD.md and its nested RFC.md @spec:AC-056', () => {
  fresh((root) => {
    featureDir(root, 'a');
    writeLegacyFeature(path.join(root, 'features', 'a'));
    featureDir(root, 'b');
    writeLegacyFeature(path.join(root, 'features', 'b'));

    assert.equal(check(root), false);
    apply(root, { dryRun: false });
    // apply() migrates every feature directory in one pass, not just one.
    assert.equal(check(root), true);
  });
});

test('pendingMigrations includes 0.6.0 for a project still on 0.5.0 @spec:AC-056', () => {
  assert.deepEqual(pendingMigrations('0.5.0', '0.6.0').map((m) => m.version), ['0.6.0']);
  assert.deepEqual(pendingMigrations('0.4.0', '0.6.0').map((m) => m.version), ['0.5.0', '0.6.0']);
});
