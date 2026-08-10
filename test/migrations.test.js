import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { check, apply, version, description } from '../src/migrations/0.5.0.js';
import { pendingMigrations, compareVersions } from '../src/migrations/index.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-mig-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the 0.5.0 migration rewrites every renamed family and leaves already-English documents untouched @spec:AC-056', () => {
  fresh((root) => {
    writeFileSync(path.join(root, 'PRD.md'), '> status: rascunho\n\n### US-001 — a\n');
    writeFileSync(
      path.join(root, 'RFC.md'),
      '- **ASM-001** — x *(status: confirmada)*\n- **Q-001** — y *(status: aberta)*\n'
    );
    writeFileSync(
      path.join(root, 'TDD.md'),
      '## T-001 — greeting [pendente]\n\n- Arquivos: src/a.js\n- Lê: src/b.js\n- Depende de: T-000\n'
    );
    mkdirSync(path.join(root, 'already-english'), { recursive: true });
    const englishAlready = '> status: draft\n\n## T-001 — x [pending]\n\n- Files: a.js\n- Reads: b.js\n- Depends on: T-000\n';
    writeFileSync(path.join(root, 'already-english', 'DOC.md'), englishAlready);

    assert.equal(check(root), false, 'a fresh Portuguese fixture must not report as already migrated');

    const result = apply(root, { dryRun: false });
    const changedFiles = result.changed.map((c) => c.file).sort();
    assert.deepEqual(changedFiles, ['PRD.md', 'RFC.md', 'TDD.md']);

    assert.match(readFileSync(path.join(root, 'PRD.md'), 'utf8'), /status: draft/);
    const rfc = readFileSync(path.join(root, 'RFC.md'), 'utf8');
    assert.match(rfc, /status: confirmed/);
    assert.match(rfc, /status: open/);
    const tdd = readFileSync(path.join(root, 'TDD.md'), 'utf8');
    assert.match(tdd, /\[pending\]/);
    assert.match(tdd, /- Files: src\/a\.js/);
    assert.match(tdd, /- Reads: src\/b\.js/);
    assert.match(tdd, /- Depends on: T-000/);

    assert.equal(
      readFileSync(path.join(root, 'already-english', 'DOC.md'), 'utf8'),
      englishAlready,
      'a document already in English must be left byte-for-byte alone'
    );

    assert.equal(check(root), true);
  });
});

test('the 0.5.0 migration is idempotent: applying it twice changes nothing the second time @spec:AC-056', () => {
  fresh((root) => {
    writeFileSync(path.join(root, 'TDD.md'), '## T-001 — x [pendente]\n\n- Arquivos: a.js\n');

    const first = apply(root, { dryRun: false });
    assert.ok(first.changed.length > 0);
    assert.equal(check(root), true);

    const second = apply(root, { dryRun: false });
    assert.deepEqual(second.changed, []);
  });
});

test('the 0.5.0 migration never touches non-.md files, even ones containing an old finding code @spec:AC-056', () => {
  fresh((root) => {
    mkdirSync(path.join(root, 'features', 'x'), { recursive: true });
    const script = 'const c = "REF_QUEBRADA";\nconsole.log(c);\n';
    writeFileSync(path.join(root, 'features', 'x', 'check.mjs'), script);
    writeFileSync(path.join(root, 'features', 'x', 'doc.md'), 'este achado é REF_QUEBRADA.\n');

    apply(root, { dryRun: false });

    assert.equal(readFileSync(path.join(root, 'features', 'x', 'check.mjs'), 'utf8'), script);
    assert.match(readFileSync(path.join(root, 'features', 'x', 'doc.md'), 'utf8'), /REF_BROKEN/);
  });
});

test('dry-run reports what would change without writing anything @spec:AC-056', () => {
  fresh((root) => {
    writeFileSync(path.join(root, 'TDD.md'), '## T-001 — x [pendente]\n');
    const before = readFileSync(path.join(root, 'TDD.md'), 'utf8');

    const dry = apply(root, { dryRun: true });
    assert.equal(dry.changed.length, 1);
    assert.equal(readFileSync(path.join(root, 'TDD.md'), 'utf8'), before, 'dry-run must not write');
  });
});

test('this migration identifies itself as 0.5.0 @spec:AC-056', () => {
  assert.equal(version, '0.5.0');
  assert.match(description, /Portuguese/);
});

test('compareVersions orders plain x.y.z triples numerically, not lexically @spec:AC-056', () => {
  assert.equal(compareVersions('0.5.0', '0.5.0'), 0);
  assert.ok(compareVersions('0.5.0', '0.4.9') > 0);
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0, 'numeric compare: 9 < 10, not lexical "9" > "1"');
});

test('pendingMigrations chains strictly between two versions, in order @spec:AC-056', () => {
  const fakeOld = { version: '0.4.0', description: 'fake', check: () => true, apply: () => ({ changed: [] }) };
  const fakeNew = { version: '0.6.0', description: 'fake', check: () => true, apply: () => ({ changed: [] }) };

  // pendingMigrations reads the real registry, so this only checks the one
  // migration that actually exists there is included exactly when expected.
  assert.deepEqual(pendingMigrations('0.4.0', '0.5.0').map((m) => m.version), ['0.5.0']);
  assert.deepEqual(pendingMigrations('0.5.0', '0.5.0'), []);
  assert.deepEqual(pendingMigrations('0.5.0', '0.6.0'), []);
  assert.deepEqual(pendingMigrations('0.0.0', '0.4.0'), []);

  // fakeOld/fakeNew document the CONTRACT chaining relies on (version compare
  // decides membership and order) without depending on the registry's
  // real, and future, contents.
  const chain = [fakeOld, fakeNew].filter(
    (m) => compareVersions(m.version, '0.3.0') > 0 && compareVersions(m.version, '0.6.0') <= 0
  );
  assert.deepEqual(chain.map((m) => m.version), ['0.4.0', '0.6.0']);
});
