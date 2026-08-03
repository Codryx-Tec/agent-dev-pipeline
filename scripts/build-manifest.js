#!/usr/bin/env node
//
// Generate (or check) payload/MANIFEST.json — a SHA-256 per payload file.
//
// WHY THIS EXISTS. `payload/` is not inert data. It contains shell hooks that
// the agent harness executes and skill files that an AI reads as instructions,
// and `init` copies all of it into the user's repository, where it stays. A
// tampered payload is therefore code execution plus instruction injection, with
// a blast radius that outlives the install.
//
// WHAT IT DEFENDS AGAINST, honestly: tampering after download, a corrupted or
// partial extraction, a mirror serving something else, a local copy someone
// edited, and plain drift between what the tests checked and what ships.
//
// WHAT IT DOES NOT DEFEND AGAINST: a malicious publish. An attacker who controls
// the tarball controls this file too. That threat is covered by trusted
// publishing and provenance in .github/workflows/publish.yml, not here. Saying
// so out loud matters — a check advertised as covering more than it does is the
// same failure as a glob that matches nothing.
//
// Usage:
//   node scripts/build-manifest.js            write the manifest
//   node scripts/build-manifest.js --check    exit 1 if it is out of date

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYLOAD = path.join(ROOT, 'payload');
export const MANIFEST_PATH = path.join(PAYLOAD, 'MANIFEST.json');

// The manifest cannot describe itself: hashing a file whose content depends on
// the hash is a fixed point nobody needs.
const EXCLUDED = new Set(['MANIFEST.json']);

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    // Windows Subsystem for Linux writes these beside downloaded files. They are
    // not payload and must never reach a user's project.
    if (entry.includes('Zone.Identifier')) continue;
    if (statSync(full).isDirectory()) walk(full, base, out);
    else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      if (!EXCLUDED.has(rel)) out.push(rel);
    }
  }
  return out;
}

export function buildManifest() {
  const files = {};
  for (const rel of walk(PAYLOAD)) {
    files[rel] = sha256(readFileSync(path.join(PAYLOAD, rel)));
  }
  return {
    // Bumped only when the SHAPE of this file changes, never per release —
    // a consumer checks the algorithm, not the tool's version.
    manifestVersion: 1,
    algorithm: 'sha256',
    fileCount: Object.keys(files).length,
    files,
  };
}

function stable(m) {
  // Deterministic by construction: walk() sorts, and object keys are inserted in
  // that order. --check compares parsed hashes rather than bytes anyway, so this
  // only has to be stable enough to keep diffs readable.
  return JSON.stringify(m, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const built = buildManifest();
  const serialised = stable(built);

  if (!check) {
    writeFileSync(MANIFEST_PATH, serialised);
    console.log(`payload/MANIFEST.json written — ${built.fileCount} files`);
    return 0;
  }

  if (!existsSync(MANIFEST_PATH)) {
    console.error('payload/MANIFEST.json is missing — run: node scripts/build-manifest.js');
    return 1;
  }

  const onDisk = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const problems = [];
  for (const [rel, hash] of Object.entries(built.files)) {
    if (!(rel in onDisk.files)) problems.push(`not in manifest: ${rel}`);
    else if (onDisk.files[rel] !== hash) problems.push(`changed since manifest: ${rel}`);
  }
  for (const rel of Object.keys(onDisk.files)) {
    if (!(rel in built.files)) problems.push(`in manifest but missing from payload: ${rel}`);
  }

  if (problems.length) {
    console.error('payload/MANIFEST.json is out of date:\n');
    for (const p of problems) console.error(`  ${p}`);
    console.error('\nrun: node scripts/build-manifest.js');
    return 1;
  }
  console.log(`payload/MANIFEST.json is current — ${built.fileCount} files`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Never process.exit(): a large problem list is truncated at the pipe buffer
  // when the process dies before stdout flushes. Same scar as bin/adp.js.
  process.exitCode = main();
}
