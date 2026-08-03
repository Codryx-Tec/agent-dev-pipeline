// Payload integrity, checked before anything is written into a user's project.
//
// `payload/` ships shell hooks the agent harness executes and skill files an AI
// reads as instructions. `init` copies them into a repository where they persist
// long after the install. That makes a tampered payload code execution plus
// instruction injection, so the payload is verified before it is trusted rather
// than after something goes wrong.
//
// The honest boundary, repeated here because it is easy to oversell: this
// detects tampering AFTER publication — a corrupted download, an edited local
// copy, a mirror serving something else, drift between what CI tested and what
// shipped. It cannot detect a malicious publish, because whoever controls the
// tarball controls the manifest inside it. That threat is answered by trusted
// publishing and provenance (see .github/workflows/publish.yml).

import { createHash } from 'crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

export const MANIFEST_NAME = 'MANIFEST.json';

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadManifest(payloadDir) {
  const p = path.join(payloadDir, MANIFEST_NAME);
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'));
    if (m?.algorithm !== 'sha256' || typeof m.files !== 'object' || m.files === null) return null;
    return m;
  } catch {
    // A manifest we cannot parse is reported as absent rather than as a
    // failure. It is the same amount of protection — none — and pretending
    // otherwise would block installs on a formatting error.
    return null;
  }
}

/**
 * Verify a payload tree against its manifest.
 *
 * Returns { status, problems }.
 *   'ok'       every file present and matching
 *   'absent'   no manifest — unverified, not proven bad
 *   'failed'   at least one file is missing, altered or unexpected
 */
export function verifyPayload(payloadDir) {
  const manifest = loadManifest(payloadDir);
  if (!manifest) return { status: 'absent', problems: [], checked: 0 };

  const problems = [];
  let checked = 0;

  for (const [rel, expected] of Object.entries(manifest.files)) {
    const full = path.join(payloadDir, rel);
    if (!existsSync(full)) {
      problems.push({ file: rel, reason: 'missing' });
      continue;
    }
    const actual = sha256(readFileSync(full));
    checked++;
    if (actual !== expected) {
      problems.push({ file: rel, reason: 'altered', expected, actual });
    }
  }

  // An EXTRA file matters as much as an altered one. A payload that gained a
  // hook nobody declared is exactly the shape an injected file has, and a
  // check that only looked for modifications would wave it through.
  for (const rel of walkRelative(payloadDir)) {
    if (rel === MANIFEST_NAME) continue;
    if (!(rel in manifest.files)) problems.push({ file: rel, reason: 'unexpected' });
  }

  return { status: problems.length ? 'failed' : 'ok', problems, checked };
}

function walkRelative(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (entry.includes('Zone.Identifier')) continue;
    if (statSync(full).isDirectory()) walkRelative(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Refuse any destination that escapes the target directory.
 *
 * Every path written by `init` is built by joining a payload-relative path onto
 * the project root. A payload entry of `../../.ssh/authorized_keys` would
 * therefore write outside the project, and `path.join` resolves it happily —
 * it is a string operation, not a safety check.
 *
 * This closes the class rather than the instance. Today the payload is walked
 * from a directory listing, so the paths are structurally safe; that stops being
 * true the moment anything derives a destination from a manifest, an archive
 * entry or a config value, and by then the guard is easy to forget.
 */
export function assertInside(rootDir, candidate) {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  const rel = path.relative(root, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `refusing to write outside the project: ${target} is not inside ${root}`
    );
  }
  return target;
}

/** Render a verifyPayload() result for a terminal. */
export function renderIntegrity(result, { payloadDir } = {}) {
  if (result.status === 'absent') {
    return [
      'payload integrity : UNVERIFIED (no MANIFEST.json)',
      '  This copy of the tool ships no manifest, so its payload cannot be',
      '  checked. Expected when running from a working tree before',
      '  `node scripts/build-manifest.js` has been run.',
    ].join('\n');
  }
  if (result.status === 'ok') {
    return `payload integrity : OK (${result.checked} files match MANIFEST.json)`;
  }
  const lines = [`payload integrity : FAILED (${result.problems.length} problem(s))`];
  if (payloadDir) lines.push(`  in ${payloadDir}`);
  for (const p of result.problems.slice(0, 20)) {
    lines.push(`  ${p.reason.padEnd(10)} ${p.file}`);
  }
  if (result.problems.length > 20) {
    lines.push(`  ... and ${result.problems.length - 20} more`);
  }
  lines.push('');
  lines.push('  Do not install from this copy. Reinstall the package, and verify');
  lines.push('  its origin with: npm audit signatures');
  return lines.join('\n');
}
