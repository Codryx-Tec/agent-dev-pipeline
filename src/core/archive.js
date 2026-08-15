// Brownfield archiving — SCOPE-0.6.0.md PRD-002, "Passo 3", D-017.
//
// The one operation in this whole tool that moves a user's real files. Copy
// is the default (`applyArchive`'s `move: false`); `--move` opts into
// `git mv`. Three guards apply in BOTH modes, per D-017, with no override on
// any of them:
//
//   - no git repository → refused. Moving (or even copying, per Q-005's own
//     text) someone's documentation with no `git reset` safety net is not
//     something this tool offers.
//   - a dirty working tree → refused. The rescue commit must never mix in
//     the operator's own unrelated work.
//   - an untouchable basename (README.md, LICENSE, CONTRIBUTING.md,
//     SECURITY.md, CODE_OF_CONDUCT.md) or a path a CI workflow's own text
//     literally references → always copied, never moved, regardless of
//     mode. Basename, not exact root path: RECOGNITION_GLOBS's own
//     `docs/**` can reach `docs/CODE_OF_CONDUCT.md`.
//
// Pure plan/apply split, mirroring upgrade.js: planArchive() writes nothing
// and can be called freely; applyArchive() re-checks the git-repo/dirty-tree
// guards itself rather than trusting a plan computed moments earlier, since
// the interactive "type yes" confirmation between the two opens a real time
// gap.

import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { git, isGitRepo } from './executor.js';
import { assertInside } from './integrity.js';
import { walkFiles } from '../util/glob.js';
import { RECOGNITION_GLOBS } from './init.js';

export const ARCHIVE_DIR = 'project_old_artifacts';

const UNTOUCHABLE_BASENAMES = new Set([
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
]);

function isDirty(rootDir) {
  return git(rootDir, ['status', '--porcelain']).stdout.length > 0;
}

/**
 * Literal substring match only — cheap and correct for the common case (a
 * workflow naming a path directly). A workflow that references a file via
 * its own glob or a templated/matrix value is invisible to this: documented
 * limitation, not a bug. A false negative here just means a file that could
 * have stayed copied gets moved instead — recoverable via `git reset`, the
 * same safety margin every other guard in this file has.
 */
function referencedByCi(rootDir, rel) {
  const workflows = walkFiles(rootDir, { includeGlobs: ['.github/workflows/**'] });
  return workflows.some((w) => {
    const text = readFileSync(path.join(rootDir, w), 'utf8');
    return text.includes(rel);
  });
}

/**
 * What archiving would do — no writes, no git mutation.
 * @returns {{refused: null|'not-a-git-repository'|'dirty-working-tree', items: Array, move: boolean}}
 */
export function planArchive(rootDir, config = {}, { move = false } = {}) {
  if (!isGitRepo(rootDir)) return { refused: 'not-a-git-repository', items: [], move };
  if (isDirty(rootDir)) return { refused: 'dirty-working-tree', items: [], move };

  const ignoreGlobs = [...(config.ignoreGlobs ?? []), `${ARCHIVE_DIR}/**`];
  const seen = new Set();
  const matches = [];
  for (const glob of RECOGNITION_GLOBS) {
    for (const rel of walkFiles(rootDir, { includeGlobs: [glob], ignoreGlobs })) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      matches.push(rel);
    }
  }
  matches.sort();

  const items = matches.map((rel) => {
    const basename = path.basename(rel);
    const untouchable = UNTOUCHABLE_BASENAMES.has(basename);
    const ciReferenced = !untouchable && referencedByCi(rootDir, rel);
    const forceCopy = untouchable || ciReferenced;
    const dest = `${ARCHIVE_DIR}/${rel}`;
    return {
      rel,
      dest,
      action: move && !forceCopy ? 'move' : 'copy',
      reason: untouchable ? 'untouchable' : ciReferenced ? 'ci-referenced' : null,
    };
  });

  return { refused: null, items, move };
}

/**
 * Writes. Re-checks the guards itself — see module header.
 * @returns {{copied: string[], moved: string[], skipped: string[], errors: Array}}
 */
export function applyArchive(rootDir, plan) {
  if (!isGitRepo(rootDir)) throw new Error('not a git repository — refusing to archive');
  if (isDirty(rootDir)) throw new Error('working tree is dirty — refusing to archive');

  const copied = [];
  const moved = [];
  const skipped = [];
  const errors = [];

  for (const item of plan.items) {
    const srcFull = assertInside(rootDir, path.join(rootDir, item.rel));
    const destFull = assertInside(rootDir, path.join(rootDir, item.dest));

    if (existsSync(destFull)) {
      skipped.push(item.rel);
      continue;
    }

    mkdirSync(path.dirname(destFull), { recursive: true });

    if (item.action === 'move') {
      const result = git(rootDir, ['mv', srcFull, destFull], { allowFail: true });
      if (result.status !== 0) {
        errors.push({ rel: item.rel, message: result.stderr || result.stdout || 'git mv failed' });
        continue;
      }
      moved.push(item.rel);
    } else {
      try {
        copyFileSync(srcFull, destFull);
        copied.push(item.rel);
      } catch (err) {
        errors.push({ rel: item.rel, message: err.message });
      }
    }
  }

  return { copied, moved, skipped, errors };
}

/**
 * Whether a typed answer to `adp archive --apply`'s confirmation prompt
 * counts as consent — pulled out as its own pure function, same reason
 * `shouldPromptForAgent`/`resolveAgentAnswer` are pure in `init.js`, so the
 * decision has a real test independent of `cli.js`'s own untested-by-
 * convention `ask()` call.
 */
export function isConfirmed(answer) {
  return String(answer ?? '').trim().toLowerCase() === 'yes';
}

export function renderArchivePlan(plan) {
  if (!plan.items.length) {
    return 'nothing to archive: no README/docs/ADR/OpenAPI/CHANGELOG-shaped files found.';
  }
  const lines = [`${plan.items.length} file(s) would be archived to ${ARCHIVE_DIR}/:`, ''];
  for (const item of plan.items) {
    const tag = item.reason ? ` (${item.reason} — stays copied)` : '';
    lines.push(`  ${item.action === 'move' ? 'move' : 'copy'}  ${item.rel} -> ${item.dest}${tag}`);
  }
  return lines.join('\n');
}

export function renderArchiveApplied(result) {
  const lines = [];
  if (result.copied.length) lines.push(`copied  ${result.copied.length} file(s)`);
  if (result.moved.length) lines.push(`moved   ${result.moved.length} file(s)`);
  if (result.skipped.length) lines.push(`skipped ${result.skipped.length} file(s) (destination already existed)`);
  if (result.errors.length) {
    lines.push('');
    lines.push('errors:');
    for (const e of result.errors) lines.push(`  ${e.rel}: ${e.message}`);
  }
  return lines.join('\n');
}
