// Brownfield archiving — SCOPE-0.6.0.md PRD-002 "Passo 3", D-017.
// planArchive/applyArchive are pure enough to test directly against a real
// temp git repo; cli.js's own I/O (the typed-`yes` prompt) stays untested by
// the same existing convention T-064 already established (`run()` has no
// test file to add one to).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { git } from '../src/core/executor.js';
import { planArchive, applyArchive, isConfirmed, ARCHIVE_DIR } from '../src/core/archive.js';

function freshGitProject(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-archive-'));
  try {
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function commitAll(root, message = 'legacy docs') {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

test('happy path, copy (default): originals untouched, nothing moved @spec:AC-132', () => {
  freshGitProject((root) => {
    writeFileSync(path.join(root, 'README.md'), '# demo\n');
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'guide.md'), 'guide\n');
    commitAll(root);

    const plan = planArchive(root, {}, { move: false });
    assert.equal(plan.refused, null);
    const result = applyArchive(root, plan);
    assert.deepEqual(result.moved, []);
    assert.deepEqual(result.errors, []);
    assert.ok(result.copied.includes('docs/guide.md'));
    assert.ok(existsSync(path.join(root, 'docs', 'guide.md')), 'original untouched');
    assert.ok(existsSync(path.join(root, ARCHIVE_DIR, 'docs', 'guide.md')));
  });
});

test('happy path, move (--move): original gone, tracked as a git rename @spec:AC-132', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'guide.md'), 'guide\n');
    commitAll(root);

    const plan = planArchive(root, {}, { move: true });
    const item = plan.items.find((i) => i.rel === 'docs/guide.md');
    assert.equal(item.action, 'move');

    const result = applyArchive(root, plan);
    assert.ok(result.moved.includes('docs/guide.md'));
    assert.equal(existsSync(path.join(root, 'docs', 'guide.md')), false);
    assert.ok(existsSync(path.join(root, ARCHIVE_DIR, 'docs', 'guide.md')));
  });
});

test('refuses on a dirty working tree, in both modes, with no override @spec:AC-133', () => {
  freshGitProject((root) => {
    writeFileSync(path.join(root, 'README.md'), '# demo\n');
    // never committed — the tree is dirty
    for (const move of [false, true]) {
      const plan = planArchive(root, {}, { move });
      assert.equal(plan.refused, 'dirty-working-tree');
      assert.deepEqual(plan.items, []);
    }
  });
});

test('refuses outside a git repository, in both modes, with no override @spec:AC-133', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-archive-nogit-'));
  try {
    writeFileSync(path.join(root, 'README.md'), '# demo\n');
    for (const move of [false, true]) {
      const plan = planArchive(root, {}, { move });
      assert.equal(plan.refused, 'not-a-git-repository');
      assert.deepEqual(plan.items, []);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the untouchable list stays copied even under --move, matched by basename not exact path @spec:AC-134', () => {
  freshGitProject((root) => {
    writeFileSync(path.join(root, 'README.md'), '# demo\n');
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    // a non-root CODE_OF_CONDUCT.md — basename match must still catch it
    writeFileSync(path.join(root, 'docs', 'CODE_OF_CONDUCT.md'), 'be nice\n');
    commitAll(root);

    const plan = planArchive(root, {}, { move: true });
    const readme = plan.items.find((i) => i.rel === 'README.md');
    const coc = plan.items.find((i) => i.rel === 'docs/CODE_OF_CONDUCT.md');
    assert.equal(readme.action, 'copy');
    assert.equal(readme.reason, 'untouchable');
    assert.equal(coc.action, 'copy');
    assert.equal(coc.reason, 'untouchable');

    const result = applyArchive(root, plan);
    assert.ok(existsSync(path.join(root, 'README.md')), 'untouchable file never moves');
    assert.ok(existsSync(path.join(root, 'docs', 'CODE_OF_CONDUCT.md')));
  });
});

test('a file referenced by a CI workflow stays copied even under --move; an unreferenced twin moves normally @spec:AC-134', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'api.md'), 'api docs\n');
    writeFileSync(path.join(root, 'docs', 'unrelated.md'), 'unrelated\n');
    mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      'name: ci\non: push\njobs:\n  docs:\n    steps:\n      - run: cat docs/api.md\n'
    );
    commitAll(root);

    const plan = planArchive(root, {}, { move: true });
    const referenced = plan.items.find((i) => i.rel === 'docs/api.md');
    const unrelated = plan.items.find((i) => i.rel === 'docs/unrelated.md');
    assert.equal(referenced.action, 'copy');
    assert.equal(referenced.reason, 'ci-referenced');
    assert.equal(unrelated.action, 'move');
    assert.equal(unrelated.reason, null);
  });
});

test('idempotent: re-running after a prior copy reports skipped, and the archive directory is excluded from its own scan @spec:AC-132', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'guide.md'), 'guide\n');
    commitAll(root);

    applyArchive(root, planArchive(root, {}, { move: false }));

    // a second commit so the tree is clean again for the second pass
    commitAll(root, 'noop');

    const secondPlan = planArchive(root, {}, { move: false });
    // the archive itself must never appear as something to archive
    assert.equal(secondPlan.items.some((i) => i.rel.startsWith(ARCHIVE_DIR)), false);

    const secondResult = applyArchive(root, secondPlan);
    assert.ok(secondResult.skipped.includes('docs/guide.md'));
    assert.deepEqual(secondResult.copied, []);
  });
});

test('creates the destination directory for a deeply nested path @spec:AC-132', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'docs', 'a', 'b', 'c'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'a', 'b', 'c', 'deep.md'), 'deep\n');
    commitAll(root);

    const plan = planArchive(root, {}, { move: true });
    const result = applyArchive(root, plan);
    assert.ok(result.moved.includes('docs/a/b/c/deep.md'));
    assert.ok(existsSync(path.join(root, ARCHIVE_DIR, 'docs', 'a', 'b', 'c', 'deep.md')));
  });
});

test('nothing to archive reports cleanly and writes nothing @spec:AC-132', () => {
  freshGitProject((root) => {
    writeFileSync(path.join(root, 'src.js'), 'console.log(1);\n');
    commitAll(root);

    const plan = planArchive(root, {}, { move: false });
    assert.equal(plan.refused, null);
    assert.deepEqual(plan.items, []);
    assert.equal(existsSync(path.join(root, ARCHIVE_DIR)), false);
  });
});

test('a destination that would escape the project directory is refused, defense in depth @spec:AC-132', () => {
  freshGitProject((root) => {
    writeFileSync(path.join(root, 'README.md'), '# demo\n');
    commitAll(root);
    // applyArchive re-validates every path itself (P-007's assertInside),
    // independent of whatever planArchive would ever actually produce —
    // this hand-built plan is the only way to exercise that guard, since
    // walkFiles never returns a path that could trigger it on its own.
    const maliciousPlan = { items: [{ rel: 'README.md', dest: '../../etc/evil', action: 'copy', reason: null }] };
    assert.throws(() => applyArchive(root, maliciousPlan), /outside the project/);
  });
});

test('isConfirmed accepts only a trimmed, case-insensitive "yes" @spec:AC-135', () => {
  assert.equal(isConfirmed('yes'), true);
  assert.equal(isConfirmed('Yes'), true);
  assert.equal(isConfirmed('  YES  '), true);
  assert.equal(isConfirmed('y'), false);
  assert.equal(isConfirmed('sure'), false);
  assert.equal(isConfirmed(''), false);
  assert.equal(isConfirmed(undefined), false);
});

test('config.ignoreGlobs narrows the same recognition scan Passo 1 already uses @spec:AC-132', () => {
  freshGitProject((root) => {
    mkdirSync(path.join(root, 'docs'), { recursive: true });
    writeFileSync(path.join(root, 'docs', 'keep-out.md'), 'skip me\n');
    commitAll(root);

    const plan = planArchive(root, { ignoreGlobs: ['docs/**'] }, { move: false });
    assert.deepEqual(plan.items, []);
  });
});
