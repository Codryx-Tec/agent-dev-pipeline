// The installer.
//
// Everything a project needs lives under `payload/` in this repository, and
// `init` copies it in. That split is the whole reason the repository root is
// clean: what the tool IS lives in `src/`, what the tool INSTALLS lives in
// `payload/`, and nothing pretends to be both.
//
// Idempotent BY CONSTRUCTION, not by checking a marker file: every write goes
// through writeIfMissing(), which never touches a path that already exists. Two
// consequences worth stating out loud. Re-running init is always safe, even
// after the user has edited every file. And the tool can be upgraded without a
// migration step, because it never assumes it wrote what is on disk.
//
// The report separates CREATED from KEPT so the user can SEE that the second
// run did nothing, instead of being asked to trust it.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { verifyPayload, renderIntegrity, assertInside, sha256, loadManifest, walkRelative } from './integrity.js';
import { buildInstallPlan } from './install-map.js';
import { PACKAGE_DIR, PAYLOAD_DIR, TEMPLATES_DIR, AGENT_SKILL_DIRS, LOCKFILE_NAME } from './paths.js';
import { VERSION } from '../version.js';
import { SIGNALS, describeFeatureCeremony } from './ceremony.js';
import { walkFiles } from '../util/glob.js';
import { renderBaselineMd } from '../parsers/baseline.js';

export { PACKAGE_DIR, PAYLOAD_DIR, AGENT_SKILL_DIRS, LOCKFILE_NAME };

function template(name) {
  return readFileSync(path.join(TEMPLATES_DIR, name), 'utf-8');
}

// The list of payload-relative paths to install from, with a flag saying
// whether it came from a trusted, hashed manifest. Working from a tree before
// `node scripts/build-manifest.js` has run is a normal state (the payload
// integrity check already treats it as a warning, not a refusal) and install
// still has to work — it just cannot produce a lockfile, because a lockfile
// with no verified hash behind it would be worse than no lockfile at all.
function payloadFileList(payloadDir) {
  const manifest = loadManifest(payloadDir);
  if (manifest) return { files: manifest.files, verified: true };
  const files = {};
  for (const rel of walkRelative(payloadDir)) files[rel] = null;
  return { files, verified: false };
}

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// M4-readonly-core (SCOPE-0.6.0.md PRD-002, "Passo 1 — Reconhecimento"):
// the glob-matchable documentation artifacts a brownfield adoption reads
// before proposing anything. Module-comment scanning is explicitly not
// here — that needs real per-language parsing, not a glob; deferred.
const RECOGNITION_GLOBS = [
  'README*',
  'docs/**',
  'doc/**',
  'adr/**',
  'rfc/**',
  'wiki/**',
  '*.openapi.yml',
  '*.openapi.yaml',
  '*.openapi.json',
  'swagger*',
  '**/migrations/**',
  'CHANGELOG*',
  'CONTRIBUTING*',
];

/** HEAD, or null outside a git repository — self-contained, same as project.js's own version: a migration or an installer should not depend on application code free to change shape independently of it. */
function currentGitRevForInit(rootDir) {
  const p = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  return p.status === 0 ? (p.stdout ?? '').trim() : null;
}

function writeIfMissing(fullPath, content, report, opts = {}) {
  // Every write goes through here, which makes it the one place worth guarding.
  // A destination that resolves outside the project is refused rather than
  // clamped: silently rewriting a path an attacker chose is how you end up
  // writing the file they wanted somewhere you did not expect.
  assertInside(report.relTo, fullPath);

  const rel = path.relative(report.relTo, fullPath).split(path.sep).join('/');
  if (existsSync(fullPath)) {
    report.kept.push(rel);
    return false;
  }
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, opts.mode ? { mode: opts.mode } : undefined);
  report.created.push(rel);
  // Only a write backed by a verified manifest hash is worth remembering for
  // the lockfile — see payloadFileList() above for why an unverified payload
  // never reaches here with opts.payloadRel set.
  if (opts.payloadRel) report.installed.push({ projectRel: rel, payloadRel: opts.payloadRel, hash: sha256(content) });
  return true;
}

// Which agent this project uses, guessed from what is already on disk. Guessing
// wrong would install the skills where nothing reads them, so an ambiguous
// project gets told rather than gambled on.
export function detectAgent(rootDir, requested) {
  if (requested) {
    if (requested === 'none') return { agent: 'none', ambiguous: false };
    if (!AGENT_SKILL_DIRS[requested]) {
      throw new Error(
        `unknown agent "${requested}" — use one of: ${Object.keys(AGENT_SKILL_DIRS).join(', ')}, none`
      );
    }
    return { agent: requested, ambiguous: false };
  }
  const present = ['claude', 'cursor', 'codex'].filter((a) =>
    existsSync(path.join(rootDir, AGENT_SKILL_DIRS[a].split('/')[0]))
  );
  if (present.length === 1) return { agent: present[0], ambiguous: false };
  if (present.length > 1) return { agent: present[0], ambiguous: true, candidates: present };
  return { agent: 'claude', ambiguous: false, defaulted: true };
}

export function listPayloadSkills() {
  const dir = path.join(PAYLOAD_DIR, 'claude', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function initProject(rootDir, opts = {}, config = {}) {
  const report = { created: [], kept: [], notes: [], relTo: rootDir, installed: [] };

  // Verify the payload BEFORE writing anything. `payload/` carries shell hooks
  // the harness executes and skills an AI reads as instructions, so a tampered
  // copy is code execution with a blast radius that outlives the install.
  // Checking afterwards would mean the files are already on disk.
  //
  // An absent manifest is a warning, not a refusal: running from a working tree
  // before build-manifest.js has run is a normal state, and refusing there would
  // teach people to reach for a bypass flag. A FAILED check is fatal — that is
  // the case the check exists for, and there is no --force for it on purpose.
  const integrity = verifyPayload(PAYLOAD_DIR);
  if (integrity.status === 'failed') {
    throw new Error(
      `${renderIntegrity(integrity, { payloadDir: PAYLOAD_DIR })}\n\n` +
        'init refused to write anything.'
    );
  }
  report.integrity = integrity;
  if (integrity.status === 'absent') {
    report.notes.push('payload not verified: no MANIFEST.json in this copy of the tool');
  }

  const project = opts.project ?? path.basename(rootDir);
  const owner = opts.owner ?? 'to be defined';

  // --minimal installs the engine's own contract and nothing else: the six
  // gates work, and a project that already has its own conventions is not
  // handed a second set.
  const minimal = Boolean(opts.minimal);
  const want = (part) => !minimal && opts[`no${part}`] !== true;
  const installOpts = {
    minimal,
    noSkills: Boolean(opts.noSkills),
    noRoles: Boolean(opts.noRoles),
    noDocs: Boolean(opts.noDocs),
    noMemory: Boolean(opts.noMemory),
    noAgents: Boolean(opts.noAgents),
  };

  // ---- SCOPE.md: always, personalized per project, so never payload-tracked
  // (there is no single payload hash a filled-in SCOPE.md could ever match) ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'SCOPE.md'),
    fill(template('SCOPE.md'), { PROJECT: project, DATE: today(), OWNER: owner }),
    report
  );
  // ---- BACKLOG.md: scaffolded once, like SCOPE.md/CONSTITUTION.md — its
  // ABSENCE later is never an error (M2c-core: nothing has been pushed out
  // of the MVP yet is a normal state), but there is nothing ceremony-costly
  // about one empty project-wide file that already exists everywhere else ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'BACKLOG.md'),
    fill(template('BACKLOG.md'), { PROJECT: project }),
    report
  );
  // ---- the ./adp wrapper (PRD-005): default, not opt-in, and pinned to the
  // installing version. Writing into `~/.bashrc` was the tempting option and
  // the wrong one — this package advertises "leaves nothing behind outside
  // the project," and a dotfile edit contradicts that on line one. A wrapper
  // INSIDE the project resolves both problems this PRD names at once: no
  // alias to set up by hand, and CI already gets a pinned version merely by
  // calling ./adp instead of npx @codryx/agent-dev-pipeline (no version) ----
  writeIfMissing(path.join(rootDir, 'adp'), fill(template('adp.sh'), { VERSION }), report, { mode: 0o755 });
  writeIfMissing(path.join(rootDir, 'adp.cmd'), fill(template('adp.cmd'), { VERSION }), report);

  // ---- the hours-per-FP table: seeded once from the shipped default, then
  // it is the project's own editable copy (PRD-003-core) — same low-ceremony
  // reasoning as BACKLOG.md, and not part of the generic install map for the
  // same reason SCOPE.md isn't: this is a seed, not a payload hash to track ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'metrics', 'hours-per-fp.json'),
    readFileSync(path.join(PAYLOAD_DIR, 'metrics', 'hours-per-fp.default.json'), 'utf-8'),
    report
  );
  // ---- the Function Point weight table: same seed-once shape, one level up
  // the chain — this is what `adp estimate --review`/`--confirm` weighs a
  // counted function against (PRD-003-full-core) ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'metrics', 'fp-weights.json'),
    readFileSync(path.join(PAYLOAD_DIR, 'metrics', 'fp-weights.default.json'), 'utf-8'),
    report
  );
  // ---- PRD_WITH_SOLUTION's forbidden-vocabulary list: same seed-once,
  // edit-forever shape (M3b) — the audit falls back to a small built-in
  // list when this file is absent, so an upgrade that predates it still
  // gets a check, just not the project-tuned one ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'PRD_VOCABULARY.json'),
    readFileSync(path.join(PAYLOAD_DIR, 'vocabulary', 'prd-forbidden.default.json'), 'utf-8'),
    report
  );
  // git does not track empty directories; the placeholders are what make the
  // layout survive a clone. Not payload content, so not part of the install map.
  writeIfMissing(path.join(rootDir, '.spec', 'features', '.gitkeep'), '', report);
  writeIfMissing(path.join(rootDir, '.spec', 'verification', '.gitkeep'), '', report);
  writeIfMissing(path.join(rootDir, '.spec', 'rfc', '.gitkeep'), '', report);

  // ---- brownfield (M4-readonly-core, SCOPE-0.6.0.md PRD-002): recognition
  // and BASELINE.md only — nothing here moves or rewrites a single file of
  // the user's. The archiving step (git mv to project_old_artifacts/) is a
  // separate, deliberately deferred pass; see .spec/BACKLOG.md ----
  if (opts.brownfield) {
    const ignoreGlobs = config.ignoreGlobs ?? [];
    // One walk per glob, not per file — a glob can list which files it
    // matched directly, so grouping never needs to ask "which glob found
    // this file?" after the fact.
    const seen = new Set();
    const byGroup = [];
    for (const glob of RECOGNITION_GLOBS) {
      const matched = walkFiles(rootDir, { includeGlobs: [glob], ignoreGlobs }).filter((f) => !seen.has(f));
      for (const f of matched) seen.add(f);
      if (matched.length) byGroup.push([glob, matched.length]);
    }
    if (seen.size) {
      report.notes.push(`brownfield recognition found ${seen.size} existing doc-like file(s): ${byGroup.map(([g, n]) => `${g} (${n})`).join(', ')} — a starting point for the archaeologist role, nothing was moved`);
    } else {
      report.notes.push('brownfield recognition found no existing README/docs/ADR/OpenAPI/CHANGELOG-shaped files');
    }

    const srcGlobs = config.srcGlobs ?? ['src/**'];
    const srcFiles = walkFiles(rootDir, { includeGlobs: srcGlobs, ignoreGlobs });
    const commit = currentGitRevForInit(rootDir);
    const wrote = writeIfMissing(
      path.join(rootDir, '.spec', 'BASELINE.md'),
      renderBaselineMd({ commit, generatedAt: new Date().toISOString(), files: srcFiles }),
      report
    );
    if (wrote) {
      report.notes.push(`BASELINE.md recorded ${srcFiles.length} pre-existing source file(s) — findings tied to them stay warnings until touched`);
    }
    if (!commit) {
      report.notes.push('no git repository detected — BASELINE.md was still written, but findings against it will never get the ratchet discount (that needs `git diff` against the recorded commit)');
    }
  }

  // ---- everything else the payload ships: one plan, one loop ----
  // detectAgent() runs before the plan because the skills subtree's
  // destination depends on it.
  const detected = detectAgent(rootDir, opts.agent);
  const { files: manifestFiles, verified } = payloadFileList(PAYLOAD_DIR);
  const plan = buildInstallPlan(manifestFiles, { ...installOpts, agent: detected.agent });
  for (const { payloadRel, projectRel } of plan) {
    const content = readFileSync(path.join(PAYLOAD_DIR, payloadRel));
    const mode = payloadRel.endsWith('.sh') ? 0o755 : undefined;
    writeIfMissing(path.join(rootDir, projectRel), content, report, {
      mode,
      // Only a manifest-verified read is trustworthy enough to remember —
      // see payloadFileList() for why an unverified payload skips this.
      payloadRel: verified ? payloadRel : undefined,
    });
  }

  if (detected.agent !== 'none' && detected.agent !== 'claude' && want('Roles')) {
    report.notes.push(
      `role agents and hooks are Claude Code features and were not installed for "${detected.agent}" — the skills were`
    );
  }
  if (detected.ambiguous) {
    report.notes.push(
      `more than one agent directory exists here (${detected.candidates.join(', ')}) — installed for "${detected.agent}"; re-run with --agent <name> to choose`
    );
  }
  if (detected.defaulted) {
    report.notes.push('no agent directory found — assumed "claude"; re-run with --agent <name> to change');
  }

  // ---- the install lockfile: what makes `adp upgrade` possible later ----
  // Goes through writeIfMissing like everything else, so re-running init never
  // touches an existing lockfile. Written only when the payload was verified —
  // a lockfile built from unverified hashes would let a later `adp upgrade`
  // trust content nothing ever checked.
  if (verified) {
    const lockfile = {
      lockfileVersion: 1,
      algorithm: 'sha256',
      installedVersion: VERSION,
      installedAt: today(),
      agent: detected.agent,
      options: installOpts,
      fileCount: report.installed.length,
      files: Object.fromEntries(report.installed.map((f) => [f.projectRel, f.hash])),
      bootstrapped: false,
    };
    writeIfMissing(path.join(rootDir, '.spec', LOCKFILE_NAME), JSON.stringify(lockfile, null, 2) + '\n', report);
  } else {
    report.notes.push('no MANIFEST.json — skipped writing the install lockfile (adp upgrade needs one)');
  }

  // A stale singular directory is worse than none: it looks like the skills are
  // installed while the harness reads right past it.
  const singular = path.join(rootDir, '.claude', 'skill');
  if (existsSync(singular) && statSync(singular).isDirectory()) {
    report.notes.push(
      '`.claude/skill/` exists (singular) — Claude Code only reads `.claude/skills/`, so anything in there is not loaded; move it or delete it'
    );
  }

  if (!existsSync(path.join(rootDir, '.git'))) {
    // Lanes are git worktrees. Without a repository, background execution
    // cannot work at all — better said now than discovered at M6.
    report.notes.push('this folder is not a git repository — run `git init` before using background execution');
  }

  return { ...report, agent: detected.agent, minimal };
}

const SHELL_ALIAS_START = '# >>> agent-dev-pipeline alias >>>';
const SHELL_ALIAS_END = '# <<< agent-dev-pipeline alias <<<';

/** The exact block `--shell-alias` appends — marked so it stays removable by hand. */
export function shellAliasBlock(version) {
  return [SHELL_ALIAS_START, `alias adp='npx --yes @codryx/agent-dev-pipeline@${version}'`, SHELL_ALIAS_END].join(
    '\n'
  );
}

/** Which rc file `--shell-alias` targets — zsh's if $SHELL says so, bash's otherwise. */
export function shellRcPath(env = process.env) {
  const shell = env.SHELL ?? '';
  return path.join(os.homedir(), shell.includes('zsh') ? '.zshrc' : '.bashrc');
}

/**
 * Append the alias block to `rcPath`, once. Idempotent by the same marker it
 * writes: a second call finds `SHELL_ALIAS_START` already present and leaves
 * the file untouched rather than appending a duplicate block. The CALLER
 * (cli.js) is where the explicit confirmation happens — this function never
 * runs without a human having already agreed to exactly this text, same
 * split as `grantTrust`/the `trust` command.
 */
export function installShellAlias(rcPath, version) {
  const existing = existsSync(rcPath) ? readFileSync(rcPath, 'utf-8') : '';
  if (existing.includes(SHELL_ALIAS_START)) return { written: false, path: rcPath };
  const sep = existing.length && !existing.endsWith('\n') ? '\n\n' : existing.length ? '\n' : '';
  writeFileSync(rcPath, existing + sep + shellAliasBlock(version) + '\n');
  return { written: true, path: rcPath };
}

export function newFeature(rootDir, name, opts = {}) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('feature name must be lower-case letters, digits and hyphens, e.g. student-enrolment');
  }
  const featuresDir = opts.featuresDir ?? '.spec/features';
  const rfcDir = opts.rfcDir ?? '.spec/rfc';
  const dir = path.join(rootDir, featuresDir, name);
  const report = { created: [], kept: [], notes: [], relTo: rootDir };

  // Codes are unique across the whole project, so a new feature must not
  // restart at 001. Read the highest code in use BEFORE writing anything: the
  // templates carry example codes, and scanning afterwards would report the
  // feature's own placeholders back as if they were somebody else's. RFCs are
  // no longer nested under featuresDir (Q-001), so their D-xxx codes are only
  // visible if rfcDir is scanned too.
  const used = highestCodes([path.join(rootDir, featuresDir), path.join(rootDir, rfcDir)]);

  // The ceremony matrix (M2b) decides which documents this feature actually
  // owes, at creation time — a project does not need to be born with an
  // empty DESIGN.md it has no signal justifying (SCOPE-0.6.0.md §2.5). An
  // unrecognized slug is dropped rather than silently accepted; the audit
  // reports it as SIGNAL_UNKNOWN once the PRD exists to read it from.
  const signals = (Array.isArray(opts.signals) ? opts.signals : []).filter((s) => SIGNALS.includes(s));
  const ceremony = describeFeatureCeremony({ signals });
  const docs = ceremony.requiresDesign ? ['PRD.md', 'SPEC.md', 'DESIGN.md'] : ['PRD.md', 'SPEC.md'];

  for (const doc of docs) {
    writeIfMissing(path.join(dir, doc), fill(template(doc), { FEATURE: name, SIGNALS: signals.join(', ') }), report);
  }

  report.ceremony = ceremony;
  report.notes.push(
    `ceremony: ${ceremony.level}${signals.length ? ` (signals: ${signals.join(', ')})` : ' (no signals declared)'}` +
      ` — ${ceremony.requiresDesign ? 'DESIGN.md created' : 'DESIGN.md skipped, not due at this level'}` +
      `; RFC ${ceremony.requiresRfc ? 'due — create one with `adp new --rfc <slug>`' : 'not due at this level'}`
  );
  report.notes.push(
    `add "- [ ] ${name}" to SCOPE.md's MVP checklist, or \`adp audit\` will report PRD_UNPLACED`
  );
  if (used.length) {
    report.notes.push(
      `codes already in use elsewhere — continue from: ${used.join(', ')} (codes are unique project-wide)`
    );
  }
  return report;
}

/**
 * A new decision record, at `<rfcDir>/RFC-<NNN>-<slug>.md`. Decoupled from
 * feature creation (Q-001: one RFC can serve several PRDs, one PRD often
 * needs several) — a flag on `new` rather than a second top-level command,
 * per the same "if it doesn't earn a distinct verb, don't add one" discipline
 * that cut `adp ceremony`/`adp metrics show` from the approved scope.
 */
export function newRfc(rootDir, slug, opts = {}) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('RFC slug must be lower-case letters, digits and hyphens, e.g. queue-provider');
  }
  const rfcDir = opts.rfcDir ?? '.spec/rfc';
  const dir = path.join(rootDir, rfcDir);
  const report = { created: [], kept: [], notes: [], relTo: rootDir };

  const number = highestRfcNumber(dir) + 1;
  const padded = String(number).padStart(3, '0');
  const id = `RFC-${padded}`;

  writeIfMissing(path.join(dir, `${id}-${slug}.md`), fill(template('RFC.md'), { NUMBER: padded, SLUG: slug }), report);
  report.notes.push(`add "> rfcs: ${id}" to the PRD.md of any feature this decision applies to`);
  return { ...report, id };
}

function highestRfcNumber(rfcDir) {
  if (!existsSync(rfcDir)) return 0;
  let highest = 0;
  for (const entry of readdirSync(rfcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(/^RFC-(\d+)-/i);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return highest;
}

function highestCodes(roots) {
  const highest = {};
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const content = readFileSync(full, 'utf-8');
        for (const m of content.matchAll(/\b(US|AC|T|ASM|Q|D)-(\d{3,})\b/g)) {
          const n = Number(m[2]);
          if (!highest[m[1]] || n > highest[m[1]]) highest[m[1]] = n;
        }
      }
    }
  };
  for (const root of Array.isArray(roots) ? roots : [roots]) walk(root);
  return Object.entries(highest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, n]) => `${prefix}-${String(n).padStart(3, '0')}`);
}

export function renderReport(report, { title }) {
  const out = [title, ''];
  // A hundred created lines is not a report, it is a wall. Skills and role
  // agents are summarized by folder; everything else is listed.
  const grouped = new Map();
  const plain = [];
  for (const f of report.created) {
    const m = f.match(/^((?:\.[a-z]+\/)?(?:skills|agents|hooks)\/[^/]+)\//);
    if (m) grouped.set(m[1], (grouped.get(m[1]) ?? 0) + 1);
    else plain.push(f);
  }
  for (const f of plain) out.push(`  created  ${f}`);
  for (const [dir, n] of grouped) out.push(`  created  ${dir}/ (${n} file${n > 1 ? 's' : ''})`);
  if (report.kept.length) out.push(`  kept     ${report.kept.length} existing file(s), untouched`);
  if (!report.created.length) out.push('  nothing to create — everything was already in place');
  if (report.notes.length) {
    out.push('');
    for (const n of report.notes) out.push(`  note: ${n}`);
  }
  return out.join('\n');
}
