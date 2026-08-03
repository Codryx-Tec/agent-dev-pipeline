// Load the whole project once: scope, every feature's three documents, the
// constitution, and the annotations found in the configured globs.
//
// Everything downstream (audit, gates, board, plan) is a pure function of this
// object. Nothing below core/ knows the server exists.

import { readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { walkFiles, readIfExists, latestMtime } from '../util/glob.js';
import { parsePrd } from '../parsers/prd.js';
import { parseRfc } from '../parsers/rfc.js';
import { parseTdd } from '../parsers/tdd.js';
import { parseConstitution } from '../parsers/constitution.js';
import { scanAnnotations } from '../parsers/annotations.js';
import { spawnSync } from 'child_process';

const RE_SCOPE_STATUS = /^\*\*Scope status:\*\*\s*(.+)$/m;

function rel(rootDir, p) {
  return path.relative(rootDir, p).split(path.sep).join('/');
}

function listFeatureDirs(featuresRoot) {
  if (!existsSync(featuresRoot)) return [];
  return readdirSync(featuresRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** HEAD, or null outside a git repository. Used to decide whether proof is stale. */
function currentGitRev(rootDir) {
  const p = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  return p.status === 0 ? (p.stdout ?? '').trim() : null;
}

export function loadProject(config) {
  const { rootDir } = config;
  const errors = [];

  // ---- scope ----
  const scopePath = path.join(rootDir, config.scopeFile);
  const scopeRaw = readIfExists(scopePath);
  const scope = {
    file: rel(rootDir, scopePath),
    present: scopeRaw !== null,
    status: scopeRaw ? (scopeRaw.match(RE_SCOPE_STATUS)?.[1] ?? '').trim() : null,
    // a required field left as a placeholder is not a filled field
    placeholders: scopeRaw
      ? [...scopeRaw.matchAll(/^-\s+\*\*([^*]+):\*\*\s*(to be defined|TBD|to define|a definir)\s*$/gim)].map(
          (m) => m[1].trim()
        )
      : [],
  };

  // ---- features ----
  const featuresRoot = path.join(rootDir, config.featuresDir);
  const features = listFeatureDirs(featuresRoot).map((name) => {
    const dir = path.join(featuresRoot, name);
    const read = (docFile) => {
      const full = path.join(dir, docFile);
      const raw = readIfExists(full);
      return { full, relPath: rel(rootDir, full), raw };
    };

    const prdFile = read(config.documents.prd);
    const rfcFile = read(config.documents.rfc);
    const tddFile = read(config.documents.tdd);

    let prd = null;
    let rfc = null;
    let tdd = null;
    try {
      prd = prdFile.raw ? parsePrd(prdFile.raw, prdFile.relPath) : null;
      rfc = rfcFile.raw ? parseRfc(rfcFile.raw, rfcFile.relPath) : null;
      tdd = tddFile.raw ? parseTdd(tddFile.raw, tddFile.relPath) : null;
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }

    return {
      name,
      dir: rel(rootDir, dir),
      prd,
      rfc,
      tdd,
      prdPath: prdFile.relPath,
      rfcPath: rfcFile.relPath,
      tddPath: tddFile.relPath,
      hasPrd: prdFile.raw !== null,
      hasRfc: rfcFile.raw !== null,
      hasTdd: tddFile.raw !== null,
    };
  });

  // ---- constitution ----
  const constitutionPath = path.join(rootDir, config.constitutionFile);
  const constitution = parseConstitution(
    readIfExists(constitutionPath),
    rel(rootDir, constitutionPath)
  );

  // ---- files and annotations ----
  const testFiles = walkFiles(rootDir, {
    includeGlobs: config.testGlobs,
    ignoreGlobs: config.ignoreGlobs,
  });
  const srcFiles = walkFiles(rootDir, {
    includeGlobs: config.srcGlobs,
    ignoreGlobs: config.ignoreGlobs,
  });
  const annotations = scanAnnotations(rootDir, [...new Set([...testFiles, ...srcFiles])]);

  // ---- verification records (written by M2's verify; absent until then) ----
  const verification = {};
  const verifyDir = path.join(rootDir, config.verificationDir);
  if (existsSync(verifyDir)) {
    for (const entry of readdirSync(verifyDir)) {
      if (!entry.endsWith('.json')) continue;
      const raw = readIfExists(path.join(verifyDir, entry));
      if (!raw) continue;
      try {
        const record = JSON.parse(raw);
        verification[record.feature ?? entry.replace(/\.json$/, '')] = record;
      } catch {
        errors.push(`${config.verificationDir}/${entry} is not valid JSON`);
      }
    }
  }

  return {
    config,
    rootDir,
    scope,
    features,
    constitution,
    testFiles,
    srcFiles,
    annotations,
    verification,
    codeMtime: latestMtime(rootDir, [...testFiles, ...srcFiles]),
    gitRev: currentGitRev(rootDir),
    errors,
  };
}

export { latestMtime, statSync };
