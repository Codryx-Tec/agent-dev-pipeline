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
import { parseSpec } from '../parsers/spec.js';
import { parseDesign } from '../parsers/design.js';
import { parseConstitution } from '../parsers/constitution.js';
import { parseBacklog } from '../parsers/backlog.js';
import { parseBaseline } from '../parsers/baseline.js';
import { parseDeferrals } from '../parsers/deferrals.js';
import { scanAnnotations } from '../parsers/annotations.js';
import { fold } from '../util/text.js';
import { spawnSync } from 'child_process';

const RE_SCOPE_STATUS = /^\*\*Scope status:\*\*\s*(.+)$/m;
// The recorded GO/NO-GO ("adp report" and the viability question it answers)
// — declarative only, like every other status token here: nothing gates on
// it, nothing enforces it. "o motor não veta o projeto."
const RE_SCOPE_DECISION = /^\*\*Decision:\*\*\s*(.+)$/m;
const DECISIONS = ['pending', 'go', 'no-go'];
// Declared documentation language (free text) — read by AGENTS.md/SKILL.md's
// own instructions, not enforced here. See scope.docsLanguage below.
const RE_SCOPE_DOCS_LANGUAGE = /^\*\*Docs language:\*\*\s*(.+)$/m;
// The MVP checklist (M2c-core, SCOPE-0.6.0.md §2.2): a line only counts once
// it names a real feature slug as its first token after the checkbox — a
// prose description ("`init` command that scaffolds...") starts with a
// backtick or a capital letter and simply produces no match, so existing
// scope documents cost nothing to keep once this line is added.
const RE_MVP_HEADER = /-\s*\*\*MVP \(prioritized\):\*\*/;
const RE_MVP_ITEM = /^[ \t]*-\s*\[[ xX]\]\s*([a-z0-9][a-z0-9-]*)/gm;

function extractMvp(content) {
  if (!content) return [];
  const header = content.match(RE_MVP_HEADER);
  if (!header) return [];
  const rest = content.slice(header.index + header[0].length);
  const stopIdx = rest.search(/\n[ \t]*-\s*\*\*|\n##/);
  const block = stopIdx === -1 ? rest : rest.slice(0, stopIdx);
  return [...block.matchAll(RE_MVP_ITEM)].map((m) => m[1]);
}

// SCOPE-0.6.0.md §2.4: weighted decision criteria, project-wide, referenced
// by id from an RFC decision that opts into the scoring-matrix structure
// (rfc.js). Optional — a SCOPE.md with no `## 11. Decision criteria`
// section, or an empty one, is a project that has never needed one yet.
const RE_CRITERIA_SECTION = /^##\s+\d+\.\s+Decision criteria\s*$/m;
const RE_CRITERION_ITEM = /^[ \t]*-\s*\*\*(W-\d+)\*\*\s*[—–-]\s*(.+?)\s*\(weight:\s*(\d+(?:\.\d+)?)\)/gm;

function extractCriteria(content) {
  if (!content) return [];
  const header = content.match(RE_CRITERIA_SECTION);
  if (!header) return [];
  const rest = content.slice(header.index + header[0].length);
  const stopIdx = rest.search(/\n##\s+/);
  const block = stopIdx === -1 ? rest : rest.slice(0, stopIdx);
  return [...block.matchAll(RE_CRITERION_ITEM)].map((m) => ({
    id: m[1],
    name: m[2].trim(),
    weight: Number(m[3]),
  }));
}

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

const RE_RFC_FILENAME = /^(RFC-\d+)-(.+)\.md$/i;

// RFCs are flat and global (Q-001): one file can be linked from several
// PRDs, so they are loaded once, independent of any feature directory, and
// resolved by id rather than found by a fixed sibling path.
function loadRfcs(rootDir, config) {
  const rfcRoot = path.join(rootDir, config.rfcDir);
  const rfcs = new Map();
  if (!existsSync(rfcRoot)) return rfcs;

  for (const entry of readdirSync(rfcRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(RE_RFC_FILENAME);
    if (!m) continue;
    const full = path.join(rfcRoot, entry.name);
    const relPath = rel(rootDir, full);
    const raw = readIfExists(full);
    if (raw === null) continue;
    rfcs.set(m[1].toUpperCase(), {
      id: m[1].toUpperCase(),
      slug: m[2],
      file: relPath,
      rfc: parseRfc(raw, relPath),
    });
  }
  return rfcs;
}

/** HEAD, or null outside a git repository. Used to decide whether proof is stale. */
function currentGitRev(rootDir) {
  const p = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  return p.status === 0 ? (p.stdout ?? '').trim() : null;
}

// The brownfield ratchet (M4-readonly-core, SCOPE-0.6.0.md PRD-002): a
// finding tied to a file present at adoption time, and untouched since,
// stays a warning instead of escalating under --ci. `touchedSet` is built
// from ONE `git diff` call against the working tree (not `..HEAD`, so an
// uncommitted edit to a baselined file counts as "touched" too) — not one
// spawn per file. No git, or the diff fails: no discount, same as an
// unbaselined file — deliberately simpler than a per-file mtime fallback,
// since brownfield adoption already assumes a git repository everywhere
// else in the source design (the deferred archiving step refuses without
// one).
function loadBaseline(rootDir, config) {
  const baselinePath = path.join(rootDir, config.specDir, 'BASELINE.md');
  const raw = readIfExists(baselinePath);
  if (!raw) return { present: false, commit: null, files: new Set(), touchedSet: new Set() };

  const parsed = parseBaseline(raw, rel(rootDir, baselinePath));
  const files = new Set(parsed.files.map((f) => f.path));
  let touchedSet = new Set();
  if (parsed.commit) {
    const diff = spawnSync('git', ['diff', '--name-only', parsed.commit], { cwd: rootDir, encoding: 'utf8' });
    if (diff.status === 0) {
      touchedSet = new Set((diff.stdout ?? '').split('\n').map((s) => s.trim()).filter(Boolean));
    }
  }
  return { present: true, commit: parsed.commit, files, touchedSet };
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
    // M2c-core: the feature slugs declared as in the MVP boundary.
    mvp: extractMvp(scopeRaw),
    criteria: extractCriteria(scopeRaw),
    // The recorded viability decision — declarative, never enforced.
    decision: (() => {
      const raw = fold(scopeRaw?.match(RE_SCOPE_DECISION)?.[1] ?? '');
      return DECISIONS.includes(raw) ? raw : 'pending';
    })(),
    // The declared language for prose in generated documents — declarative
    // only, like `decision` above. Free text, not a fixed enum: a language
    // name isn't a token the engine compares or re-emits, unlike the five
    // families D-016 moved to English-only. Absent line reads as 'English',
    // which is what every document written before this field existed
    // already assumes.
    docsLanguage: (scopeRaw?.match(RE_SCOPE_DOCS_LANGUAGE)?.[1] ?? '').trim() || 'English',
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
    const specFile = read(config.documents.spec);
    const designFile = read(config.documents.design);

    let prd = null;
    let spec = null;
    let design = null;
    try {
      prd = prdFile.raw ? parsePrd(prdFile.raw, prdFile.relPath) : null;
      spec = specFile.raw ? parseSpec(specFile.raw, specFile.relPath) : null;
      design = designFile.raw ? parseDesign(designFile.raw, designFile.relPath) : null;
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }

    return {
      name,
      dir: rel(rootDir, dir),
      prd,
      spec,
      design,
      // Not a fixed sibling file anymore (Q-001) — the ids a PRD declares
      // via `rfcs:`, resolved against the project-wide `rfcs` map above.
      rfcRefs: prd ? prd.rfcs : [],
      prdPath: prdFile.relPath,
      specPath: specFile.relPath,
      designPath: designFile.relPath,
      hasPrd: prdFile.raw !== null,
      hasSpec: specFile.raw !== null,
      hasDesign: designFile.raw !== null,
    };
  });

  // ---- RFCs: flat and global, not nested under any feature (Q-001) ----
  const rfcs = loadRfcs(rootDir, config);

  // ---- constitution ----
  const constitutionPath = path.join(rootDir, config.constitutionFile);
  const constitution = parseConstitution(
    readIfExists(constitutionPath),
    rel(rootDir, constitutionPath)
  );

  // ---- backlog: project-wide, optional (M2c-core) ----
  const backlogPath = path.join(rootDir, config.backlogFile);
  const backlog = parseBacklog(readIfExists(backlogPath), rel(rootDir, backlogPath));

  // ---- deferrals: project-wide, optional (M5b) ----
  const deferralsPath = path.join(rootDir, config.deferralsFile);
  const deferrals = parseDeferrals(readIfExists(deferralsPath), rel(rootDir, deferralsPath));

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
    rfcs,
    constitution,
    backlog,
    deferrals,
    testFiles,
    srcFiles,
    annotations,
    verification,
    codeMtime: latestMtime(rootDir, [...testFiles, ...srcFiles]),
    gitRev: currentGitRev(rootDir),
    baseline: loadBaseline(rootDir, config),
    errors,
  };
}

export { latestMtime, statSync };
