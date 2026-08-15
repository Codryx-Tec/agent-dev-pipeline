// M4-readonly-core: brownfield recognition + the BASELINE.md ratchet
// (SCOPE-0.6.0.md PRD-002). parseBaseline/renderBaselineMd tested directly;
// loadBaseline's git-diff behavior against a real temp git repo, the same
// `git()` helper offline.e2e.test.js already uses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { parseBaseline, renderBaselineMd } from '../src/parsers/baseline.js';
import { loadProject } from '../src/core/project.js';
import { auditProject } from '../src/core/audit.js';
import { loadConfig } from '../src/config.js';
import { git } from '../src/core/executor.js';

// ---------------------------------------------------------- parseBaseline

test('parseBaseline reads the commit, generated timestamp and file list @spec:AC-094', () => {
  const md = renderBaselineMd({ commit: 'abc123', generatedAt: '2026-01-01T00:00:00.000Z', files: ['a.js', 'b.js'] });
  const parsed = parseBaseline(md, 'BASELINE.md');
  assert.equal(parsed.commit, 'abc123');
  assert.equal(parsed.generatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(parsed.files.map((f) => f.path), ['a.js', 'b.js']);
});

test('a "none" commit (no git repository at generation time) parses as null @spec:AC-094', () => {
  const md = renderBaselineMd({ commit: null, generatedAt: '2026-01-01T00:00:00.000Z', files: [] });
  const parsed = parseBaseline(md, 'BASELINE.md');
  assert.equal(parsed.commit, null);
});

test('renderBaselineMd names every file as its own bullet, in order @spec:AC-094', () => {
  const md = renderBaselineMd({ commit: 'abc123', generatedAt: '2026-01-01T00:00:00.000Z', files: ['src/a.js', 'src/b.js'] });
  assert.match(md, /- src\/a\.js/);
  assert.match(md, /- src\/b\.js/);
  assert.ok(md.indexOf('src/a.js') < md.indexOf('src/b.js'));
});

// -------------------------------------------------------------- loadBaseline

function freshGitProject(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-baseline-'));
  try {
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    writeFileSync(path.join(root, 'adp.config.json'), JSON.stringify({ testGlobs: ['test/**'], srcGlobs: ['src/**'] }));
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('project.baseline is absent, with empty sets, when there is no BASELINE.md @spec:AC-095', () => {
  freshGitProject((root) => {
    const project = loadProject(loadConfig(root));
    assert.equal(project.baseline.present, false);
    assert.equal(project.baseline.files.size, 0);
    assert.equal(project.baseline.touchedSet.size, 0);
  });
});

test('a baselined file untouched since the recorded commit is not in touchedSet @spec:AC-095', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'legacy code']);
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();

    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );

    const project = loadProject(loadConfig(root));
    assert.equal(project.baseline.present, true);
    assert.ok(project.baseline.files.has('src/legacy.js'));
    assert.equal(project.baseline.touchedSet.has('src/legacy.js'), false);
  });
});

test('a baselined file edited (even uncommitted) after the recorded commit is in touchedSet @spec:AC-095', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'legacy code']);
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();

    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );

    // Uncommitted edit — the diff is against the working tree, not HEAD,
    // so this must count as "touched" without a commit.
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 2;\n');

    const project = loadProject(loadConfig(root));
    assert.ok(project.baseline.touchedSet.has('src/legacy.js'));
  });
});

test('outside a git repository, BASELINE.md is still read but touchedSet stays empty — no discount without git @spec:AC-095', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-baseline-nogit-'));
  try {
    writeFileSync(path.join(root, 'adp.config.json'), JSON.stringify({ testGlobs: ['test/**'], srcGlobs: ['src/**'] }));
    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit: 'deadbeef', generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );
    const project = loadProject(loadConfig(root));
    assert.equal(project.baseline.present, true);
    assert.equal(project.baseline.touchedSet.size, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -------------------------------------------------- the ratchet, in audit.js

test('a baselined, untouched file\'s FILE_ORPHAN stays a warning even under --ci @spec:AC-096', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'legacy code']);
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();

    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );

    const project = loadProject(loadConfig(root));
    const audit = auditProject(project, { ci: true });
    const finding = audit.findings.find((f) => f.code === 'FILE_ORPHAN' && f.file === 'src/legacy.js');
    assert.ok(finding);
    assert.equal(finding.severity, 'warning', 'baselined and untouched — must not escalate under --ci');
  });
});

test('a baselined file touched since the recorded commit escalates under --ci like any other @spec:AC-096', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'legacy code']);
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();

    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 2;\n'); // touched after baseline

    const project = loadProject(loadConfig(root));
    const audit = auditProject(project, { ci: true });
    const finding = audit.findings.find((f) => f.code === 'FILE_ORPHAN' && f.file === 'src/legacy.js');
    assert.ok(finding);
    assert.equal(finding.severity, 'error', 'touched since the baseline commit — full strength, same as any file');
  });
});

test('a file never in the baseline escalates under --ci, unaffected by an unrelated baseline @spec:AC-096', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'legacy.js'), 'module.exports = 1;\n');
    writeFileSync(path.join(root, 'src', 'brand-new.js'), 'module.exports = 2;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'legacy code']);
    const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();

    mkdirSync(path.join(root, '.spec'), { recursive: true });
    writeFileSync(
      path.join(root, '.spec', 'BASELINE.md'),
      // Only legacy.js was baselined — brand-new.js is not in it at all.
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: ['src/legacy.js'] })
    );

    const project = loadProject(loadConfig(root));
    const audit = auditProject(project, { ci: true });
    const finding = audit.findings.find((f) => f.code === 'FILE_ORPHAN' && f.file === 'src/brand-new.js');
    assert.ok(finding);
    assert.equal(finding.severity, 'error');
  });
});
