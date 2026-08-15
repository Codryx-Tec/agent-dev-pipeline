// `adp upgrade` — the other half of PRD-001.
//
// `init` never overwrites, which is what makes it idempotent, but the same
// property means a project never receives a payload update either. This
// module closes that gap: compare the project's install lockfile against the
// CURRENT payload manifest, classify every tracked file, and act on that
// classification without ever guessing at a user's edit.
//
// Dry-run is the default everywhere in this file. Nothing here writes unless
// the caller explicitly asks for it — same rule `adp trust`/`adp run` apply
// to running anything from the repository.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { loadManifest, sha256, assertInside } from './integrity.js';
import { buildInstallPlan } from './install-map.js';
import { detectAgent } from './init.js';
import { PAYLOAD_DIR, LOCKFILE_NAME } from './paths.js';
import { VERSION } from '../version.js';
import { pendingMigrations, compareVersions } from '../migrations/index.js';

function specDirOf(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec');
}

function lockfilePath(rootDir, config) {
  return path.join(specDirOf(rootDir, config), LOCKFILE_NAME);
}

export function loadLockfile(rootDir, config) {
  const p = lockfilePath(rootDir, config);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (data?.lockfileVersion !== 1 || typeof data.files !== 'object' || data.files === null) return null;
    return data;
  } catch {
    // Same rule as loadManifest(): a lockfile we cannot parse is reported as
    // absent, not as a failure — pretending otherwise would refuse `upgrade`
    // over a formatting error instead of just re-bootstrapping.
    return null;
  }
}

/** null, or { from, to } when the lockfile is genuinely behind the running tool. */
export function describeVersionDrift(lockfile, runningVersion) {
  if (!lockfile) return null;
  if (compareVersions(lockfile.installedVersion, runningVersion) >= 0) return null;
  return { from: lockfile.installedVersion, to: runningVersion };
}

const EMPTY_FLAGS = { minimal: false, noSkills: false, noRoles: false, noDocs: false, noMemory: false, noAgents: false };

/**
 * Compare the project's lockfile against the current payload and classify
 * every tracked file. Never writes anything — see applyUpgrade() for that.
 */
export function planUpgrade(rootDir, config, { payloadDir = PAYLOAD_DIR } = {}) {
  const manifest = loadManifest(payloadDir);
  if (!manifest) {
    // Same honesty rule initProject() already applies: nothing to compare a
    // project against when this copy of the tool ships no manifest.
    return { status: 'no-manifest' };
  }

  const lockfile = loadLockfile(rootDir, config);
  const provenance = lockfile ? 'lockfile' : 'bootstrap';
  const agent = lockfile ? lockfile.agent : detectAgent(rootDir).agent;
  const flags = lockfile ? { ...EMPTY_FLAGS, ...lockfile.options } : { ...EMPTY_FLAGS };

  const currentPlan = buildInstallPlan(manifest.files, { agent, ...flags });
  const currentProjectRels = new Set(currentPlan.map((e) => e.projectRel));

  const classification = { intact: [], edited: [], new: [], removed: [], deleted: [] };

  if (provenance === 'bootstrap') {
    // AC-P1: a 0.4.x project has no lockfile at all, because the feature did
    // not exist yet. With no per-file provenance there is no way to tell
    // "untouched" from "edited", so the honest choice is to never overwrite
    // anything that already exists — every file already on disk is treated
    // as edited, never as intact.
    for (const { payloadRel, projectRel } of currentPlan) {
      const bucket = existsSync(path.join(rootDir, projectRel)) ? 'edited' : 'new';
      classification[bucket].push({ projectRel, payloadRel });
    }
  } else {
    for (const { payloadRel, projectRel } of currentPlan) {
      const knownHash = lockfile.files[projectRel];
      const onDisk = existsSync(path.join(rootDir, projectRel));
      if (knownHash === undefined) {
        classification.new.push({ projectRel, payloadRel });
      } else if (!onDisk) {
        // Recorded at install, absent now: a deliberate deletion (or a stray
        // `rm`) is not a hash mismatch and not an intact match either — its
        // own bucket, reported and never recreated.
        classification.deleted.push({ projectRel, payloadRel });
      } else {
        const diskHash = sha256(readFileSync(path.join(rootDir, projectRel)));
        classification[diskHash === knownHash ? 'intact' : 'edited'].push({ projectRel, payloadRel });
      }
    }
    for (const projectRel of Object.keys(lockfile.files)) {
      if (!currentProjectRels.has(projectRel)) classification.removed.push({ projectRel, payloadRel: null });
    }
  }

  const fromVersion = lockfile?.installedVersion ?? '0.0.0';
  const specDir = specDirOf(rootDir, config);
  const migrations = pendingMigrations(fromVersion, VERSION).map((m) => ({
    version: m.version,
    description: m.description,
    alreadyApplied: m.check(specDir),
  }));

  return {
    status: 'ok',
    provenance,
    lockfile,
    agent,
    flags,
    classification,
    migrations,
    versionDrift: describeVersionDrift(lockfile, VERSION),
  };
}

function writeTracked(rootDir, payloadDir, { projectRel, payloadRel }, targetProjectRel) {
  const content = readFileSync(path.join(payloadDir, payloadRel));
  const dest = assertInside(rootDir, path.join(rootDir, targetProjectRel ?? projectRel));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  return content;
}

/**
 * Act on a plan from planUpgrade(). Migrations run first (bringing `.spec/**`
 * content current), then the file classification is written: intact files
 * refreshed silently, edited files get a `<file>.new` sidecar (the original
 * is never touched), new files created, removed/deleted only ever reported.
 *
 * `--only-migrations` (Q-008: no separate `adp migrate` command) skips the
 * payload-file half entirely, including the lockfile rewrite — a partial
 * upgrade must not claim the whole thing happened.
 */
export function applyUpgrade(rootDir, config, plan, { onlyMigrations = false, payloadDir = PAYLOAD_DIR } = {}) {
  if (plan.status !== 'ok') throw new Error('applyUpgrade() called on a plan that was not ok');

  const specDir = specDirOf(rootDir, config);
  const migrationsRun = [];
  const migrationsSkipped = [];
  for (const m of pendingMigrations(plan.lockfile?.installedVersion ?? '0.0.0', VERSION)) {
    if (m.check(specDir)) {
      migrationsSkipped.push({ version: m.version });
      continue;
    }
    migrationsRun.push({ version: m.version, ...m.apply(specDir, { dryRun: false }) });
  }

  const wrote = [];
  const sidecars = [];
  if (!onlyMigrations) {
    for (const entry of plan.classification.intact) {
      writeTracked(rootDir, payloadDir, entry);
      wrote.push(entry.projectRel);
    }
    for (const entry of plan.classification.new) {
      writeTracked(rootDir, payloadDir, entry);
      wrote.push(entry.projectRel);
    }
    for (const entry of plan.classification.edited) {
      writeTracked(rootDir, payloadDir, entry, `${entry.projectRel}.new`);
      sidecars.push(`${entry.projectRel}.new`);
    }
    // removed and deleted are never written — see planUpgrade()'s comments.

    const files = {};
    for (const bucket of ['intact', 'new', 'edited']) {
      for (const { projectRel } of plan.classification[bucket]) {
        files[projectRel] = sha256(readFileSync(path.join(rootDir, projectRel)));
      }
    }
    // A deleted file is carried forward at its last known hash rather than
    // dropped: the payload still ships it, so the next upgrade should keep
    // saying so instead of quietly forgetting it ever existed.
    for (const { projectRel } of plan.classification.deleted) {
      files[projectRel] = plan.lockfile.files[projectRel];
    }

    const lockfile = {
      lockfileVersion: 1,
      algorithm: 'sha256',
      installedVersion: VERSION,
      installedAt: new Date().toISOString().slice(0, 10),
      agent: plan.agent,
      options: plan.flags,
      fileCount: Object.keys(files).length,
      files,
      bootstrapped: plan.provenance === 'bootstrap',
    };
    const dest = assertInside(rootDir, lockfilePath(rootDir, config));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(lockfile, null, 2) + '\n');
  }

  return { wrote, sidecars, migrationsRun, migrationsSkipped };
}

const BUCKET_LABELS = {
  intact: 'refreshed silently',
  edited: 'left alone; a .new is written beside each under --apply',
  new: 'created under --apply',
  removed: 'no longer shipped by this version — not deleted',
  deleted: 'recorded at install, missing from disk now — not recreated',
};

export function renderUpgrade(plan) {
  if (plan.status === 'no-manifest') {
    return [
      'no MANIFEST.json in this copy of the tool — nothing to compare against.',
      'expected when running from a working tree before `node scripts/build-manifest.js` has run.',
    ].join('\n');
  }

  const { classification, migrations, versionDrift, provenance } = plan;
  const lines = [];
  lines.push(`provenance : ${provenance}`);
  if (provenance === 'bootstrap') {
    lines.push('  no lockfile found — every existing file is treated as edited, nothing is overwritten');
  }
  if (versionDrift) lines.push(`version    : ${versionDrift.from} -> ${versionDrift.to}`);
  lines.push('');
  for (const [bucket, label] of Object.entries(BUCKET_LABELS)) {
    lines.push(`  ${bucket.padEnd(8)} ${String(classification[bucket].length).padStart(3)}   ${label}`);
  }
  for (const bucket of ['edited', 'removed', 'deleted']) {
    if (!classification[bucket].length) continue;
    lines.push('');
    lines.push(`${bucket}:`);
    for (const f of classification[bucket]) lines.push(`  ${f.projectRel}`);
  }
  lines.push('');
  if (migrations.length) {
    lines.push('migrations:');
    for (const m of migrations) {
      lines.push(`  ${m.version}  ${m.description}${m.alreadyApplied ? '  (already applied — skipped)' : ''}`);
    }
  } else {
    lines.push('migrations : none pending');
  }
  return lines.join('\n');
}

export function renderApplied(result) {
  const lines = [];
  lines.push(`wrote      : ${result.wrote.length}`);
  if (result.sidecars.length) {
    lines.push(`sidecars   : ${result.sidecars.length}`);
    for (const s of result.sidecars) lines.push(`  ${s}`);
  }
  lines.push(
    `migrations : ${result.migrationsRun.length} run, ${result.migrationsSkipped.length} already applied`
  );
  for (const m of result.migrationsRun) lines.push(`  ${m.version}  ${m.changed.length} file(s) rewritten`);
  return lines.join('\n');
}
