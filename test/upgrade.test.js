import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { initProject, LOCKFILE_NAME } from '../src/core/init.js';
import { loadConfig } from '../src/config.js';
import {
  planUpgrade,
  applyUpgrade,
  loadLockfile,
  describeVersionDrift,
} from '../src/core/upgrade.js';

function fresh(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-upgrade-'));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// A tiny fixture payload, independent of the real shipped payload/, so these
// tests never depend on — or need updating for — what the package actually
// ships. Shape mirrors payload/: a manifest plus the files it describes.
function fixturePayload(root) {
  const dir = path.join(root, '__payload__');
  mkdirSync(path.join(dir, 'templates'), { recursive: true });
  mkdirSync(path.join(dir, 'claude', 'skills', 'adp'), { recursive: true });

  const files = {
    'templates/CONSTITUTION.md': '# constitution\n',
    'templates/adp.config.json': '{}\n',
    'AGENTS.md': '# agents\n',
    'claude/skills/adp/SKILL.md': '# adp skill\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, rel), content);
  }
  const manifest = {
    manifestVersion: 1,
    algorithm: 'sha256',
    fileCount: Object.keys(files).length,
    files: Object.fromEntries(Object.entries(files).map(([rel, content]) => [rel, sha256(content)])),
  };
  writeFileSync(path.join(dir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

function initWithFixture(root, payloadDir, opts = {}) {
  // planUpgrade/applyUpgrade take an injectable payloadDir, but initProject()
  // does not — it always reads the tool's own real payload. So the lockfile
  // and on-disk files these tests need are built directly, in the exact
  // shape init.js would have produced against the fixture manifest.
  mkdirSync(path.join(root, '.spec'), { recursive: true });
  mkdirSync(path.join(root, '.claude', 'skills', 'adp'), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(payloadDir, 'MANIFEST.json'), 'utf8'));

  const destFor = {
    'templates/CONSTITUTION.md': '.spec/CONSTITUTION.md',
    'templates/adp.config.json': 'adp.config.json',
    'AGENTS.md': 'AGENTS.md',
    'claude/skills/adp/SKILL.md': '.claude/skills/adp/SKILL.md',
  };
  const lockedFiles = {};
  for (const [payloadRel, projectRel] of Object.entries(destFor)) {
    const content = readFileSync(path.join(payloadDir, payloadRel));
    writeFileSync(path.join(root, projectRel), content);
    lockedFiles[projectRel] = sha256(content);
  }

  if (opts.noLockfile) return;
  const lockfile = {
    lockfileVersion: 1,
    algorithm: 'sha256',
    installedVersion: opts.installedVersion ?? '0.5.0',
    installedAt: '2026-01-01',
    agent: 'claude',
    options: { minimal: false, noSkills: false, noRoles: false, noDocs: false, noMemory: false, noAgents: false },
    fileCount: Object.keys(lockedFiles).length,
    files: opts.files ?? lockedFiles,
    bootstrapped: false,
  };
  writeFileSync(path.join(root, '.spec', LOCKFILE_NAME), JSON.stringify(lockfile, null, 2) + '\n');
}

test('dry-run performs zero filesystem writes @spec:AC-053', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);
    writeFileSync(path.join(root, 'AGENTS.md'), 'edited by hand\n');

    const before = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const plan = planUpgrade(root, loadConfig(root), { payloadDir });
    assert.equal(plan.status, 'ok');
    assert.equal(existsSync(path.join(root, 'AGENTS.md.new')), false);
    assert.equal(readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), before);
  });
});

test('an intact file is updated silently by --apply @spec:AC-052', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);

    const plan = planUpgrade(root, loadConfig(root), { payloadDir });
    assert.deepEqual(plan.classification.intact.map((f) => f.projectRel).sort(), [
      '.claude/skills/adp/SKILL.md',
      '.spec/CONSTITUTION.md',
      'AGENTS.md',
      'adp.config.json',
    ]);
    assert.equal(plan.classification.edited.length, 0);

    const applied = applyUpgrade(root, loadConfig(root), plan, { payloadDir });
    assert.equal(applied.wrote.length, 4);
    assert.equal(applied.sidecars.length, 0);
  });
});

test('an edited file is left untouched and gets a <file>.new sidecar under --apply @spec:AC-053', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);
    writeFileSync(path.join(root, 'AGENTS.md'), 'MY OWN EDITS\n');

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    assert.deepEqual(plan.classification.edited.map((f) => f.projectRel), ['AGENTS.md']);

    const applied = applyUpgrade(root, config, plan, { payloadDir });
    assert.equal(readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'MY OWN EDITS\n');
    assert.ok(existsSync(path.join(root, 'AGENTS.md.new')));
    assert.deepEqual(applied.sidecars, ['AGENTS.md.new']);
    assert.equal(applied.wrote.includes('AGENTS.md'), false);
  });
});

test('a file new in the current manifest but absent from the lockfile is created under --apply @spec:AC-052', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);
    // Simulate a lockfile recorded before AGENTS.md was ever tracked.
    const lockPath = path.join(root, '.spec', LOCKFILE_NAME);
    const lockfile = JSON.parse(readFileSync(lockPath, 'utf8'));
    delete lockfile.files['AGENTS.md'];
    writeFileSync(lockPath, JSON.stringify(lockfile));

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    assert.deepEqual(plan.classification.new.map((f) => f.projectRel), ['AGENTS.md']);

    const applied = applyUpgrade(root, config, plan, { payloadDir });
    assert.ok(applied.wrote.includes('AGENTS.md'));
  });
});

test('agent.skillsDir is read live from config, not cached in the lockfile — changing it moves the skill on the next upgrade @spec:AC-129', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir); // lockfile still records agent: 'claude', .claude/skills/adp/SKILL.md
    writeFileSync(path.join(root, 'adp.config.json'), JSON.stringify({ agent: { skillsDir: '.custom/path' } }));

    const config = loadConfig(root);
    assert.equal(config.agent.skillsDir, '.custom/path');
    const plan = planUpgrade(root, config, { payloadDir });
    assert.deepEqual(plan.classification.new.map((f) => f.projectRel), ['.custom/path/adp/SKILL.md']);
    assert.deepEqual(
      plan.classification.removed.map((f) => f.projectRel),
      ['.claude/skills/adp/SKILL.md']
    );

    const applied = applyUpgrade(root, config, plan, { payloadDir });
    assert.ok(existsSync(path.join(root, '.custom/path/adp/SKILL.md')));
  });
});

test('a file in the lockfile but gone from the current manifest is reported as removed and never deleted @spec:AC-055', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);
    const lockPath = path.join(root, '.spec', LOCKFILE_NAME);
    const lockfile = JSON.parse(readFileSync(lockPath, 'utf8'));
    lockfile.files['some/retired-file.md'] = 'deadbeef';
    writeFileSync(lockPath, JSON.stringify(lockfile));

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    assert.deepEqual(plan.classification.removed.map((f) => f.projectRel), ['some/retired-file.md']);

    applyUpgrade(root, config, plan, { payloadDir });
    assert.equal(existsSync(path.join(root, 'some/retired-file.md')), false);
  });
});

test('a file recorded in the lockfile but missing from disk is reported as deleted and not recreated @spec:AC-055', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir);
    rmSync(path.join(root, 'AGENTS.md'));

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    assert.deepEqual(plan.classification.deleted.map((f) => f.projectRel), ['AGENTS.md']);

    applyUpgrade(root, config, plan, { payloadDir });
    assert.equal(existsSync(path.join(root, 'AGENTS.md')), false, 'a deliberate deletion must not be resurrected');

    const after = loadLockfile(root, config);
    assert.ok('AGENTS.md' in after.files, 'a deleted file stays tracked so future upgrades keep reporting it');
  });
});

test('a project with no lockfile at all still upgrades cleanly, treating every existing file as edited @spec:AC-054', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir, { noLockfile: true });

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    assert.equal(plan.status, 'ok');
    assert.equal(plan.provenance, 'bootstrap');
    assert.equal(plan.classification.intact.length, 0, 'bootstrap mode never trusts an existing file as intact');
    assert.deepEqual(plan.classification.edited.map((f) => f.projectRel).sort(), [
      '.claude/skills/adp/SKILL.md',
      '.spec/CONSTITUTION.md',
      'AGENTS.md',
      'adp.config.json',
    ]);

    const applied = applyUpgrade(root, config, plan, { payloadDir });
    assert.equal(applied.sidecars.length, 4);
    assert.equal(applied.wrote.length, 0);

    const lockfile = loadLockfile(root, config);
    assert.ok(lockfile, 'a fresh lockfile must exist after a bootstrap --apply');
    assert.equal(lockfile.bootstrapped, true);
  });
});

test('--only-migrations runs pending migrations without touching payload files or the lockfile @spec:AC-056', () => {
  fresh((root) => {
    const payloadDir = fixturePayload(root);
    initWithFixture(root, payloadDir, { installedVersion: '0.4.0' });
    writeFileSync(path.join(root, 'AGENTS.md'), 'STILL MINE\n');
    mkdirSync(path.join(root, '.spec', 'features', 'legacy'), { recursive: true });
    writeFileSync(path.join(root, '.spec', 'features', 'legacy', 'TDD.md'), '## T-001 — x [pendente]\n');

    const config = loadConfig(root);
    const plan = planUpgrade(root, config, { payloadDir });
    // From 0.4.0, the current VERSION owes both registered migrations —
    // 0.5.0's token rename, then 0.6.0's PRD/RFC/TDD -> PRD/RFC/DESIGN/SPEC
    // codemod — chained, not just the one immediately after the lockfile.
    assert.equal(plan.migrations.length, 2);

    const applied = applyUpgrade(root, config, plan, { payloadDir, onlyMigrations: true });
    assert.equal(applied.migrationsRun.length, 2);
    assert.equal(applied.wrote.length, 0);
    assert.equal(applied.sidecars.length, 0);
    assert.equal(existsSync(path.join(root, 'AGENTS.md.new')), false);
    assert.equal(readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'STILL MINE\n');
    // TDD.md itself moved: DESIGN.md keeps the prose (empty here — the fixture
    // had none), SPEC.md gets T-001, translated into English by the first
    // migration and carried by the second.
    assert.equal(existsSync(path.join(root, '.spec', 'features', 'legacy', 'TDD.md')), false);
    assert.match(readFileSync(path.join(root, '.spec', 'features', 'legacy', 'SPEC.md'), 'utf8'), /\[pending\]/);

    const lockfile = loadLockfile(root, config);
    assert.equal(lockfile.installedVersion, '0.4.0', 'a migrations-only run must not claim the whole upgrade happened');
  });
});

test('describeVersionDrift warns only when the lockfile is genuinely behind @spec:AC-057', () => {
  assert.equal(describeVersionDrift(null, '0.5.0'), null);
  assert.equal(describeVersionDrift({ installedVersion: '0.5.0' }, '0.5.0'), null);
  assert.equal(describeVersionDrift({ installedVersion: '0.6.0' }, '0.5.0'), null, 'never warn about a downgrade');
  assert.deepEqual(describeVersionDrift({ installedVersion: '0.4.0' }, '0.5.0'), { from: '0.4.0', to: '0.5.0' });
});
