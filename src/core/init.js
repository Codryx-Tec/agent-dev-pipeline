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
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyPayload, renderIntegrity, assertInside } from './integrity.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_DIR = path.resolve(HERE, '..', '..');
export const PAYLOAD_DIR = path.join(PACKAGE_DIR, 'payload');
const TEMPLATES = path.join(PAYLOAD_DIR, 'templates');

// Where each agent harness looks for skills.
//
// Note the plural. Claude Code reads `.claude/skills/`, never `.claude/skill/` —
// a singular directory looks right, is easy to create by hand, and is silently
// never loaded. The installer always writes the plural form.
export const AGENT_SKILL_DIRS = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  antigravity: '.agents/skills',
  cursor: '.cursor/skills',
};

// The role agents and the hooks are Claude Code features with no equivalent
// elsewhere, so they install only for that harness.
const CLAUDE_ONLY = ['agents', 'hooks', 'settings'];

function template(name) {
  return readFileSync(path.join(TEMPLATES, name), 'utf-8');
}

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function writeIfMissing(fullPath, content, report, mode) {
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
  writeFileSync(fullPath, content, mode ? { mode } : undefined);
  report.created.push(rel);
  return true;
}

// Copy a directory file by file, so "never overwrite" survives into the
// subtree. A bulk cpSync would happily clobber a skill the user had edited.
function copyTreeIfMissing(srcDir, destDir, report) {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeIfMissing(from, to, report);
    } else if (entry.isFile()) {
      // shell hooks are useless without the executable bit
      const mode = entry.name.endsWith('.sh') ? 0o755 : undefined;
      writeIfMissing(to, readFileSync(from), report, mode);
    }
  }
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

export function initProject(rootDir, opts = {}) {
  const report = { created: [], kept: [], notes: [], relTo: rootDir };

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

  // ---- the specification directory: always ----
  writeIfMissing(
    path.join(rootDir, '.spec', 'SCOPE.md'),
    fill(template('SCOPE.md'), { PROJECT: project, DATE: today(), OWNER: owner }),
    report
  );
  writeIfMissing(path.join(rootDir, '.spec', 'CONSTITUTION.md'), template('CONSTITUTION.md'), report);
  writeIfMissing(path.join(rootDir, 'adp.config.json'), template('adp.config.json'), report);
  // git does not track empty directories; the placeholders are what make the
  // layout survive a clone
  writeIfMissing(path.join(rootDir, '.spec', 'features', '.gitkeep'), '', report);
  writeIfMissing(path.join(rootDir, '.spec', 'verification', '.gitkeep'), '', report);

  // ---- process memory: the files agents write back to as they learn ----
  if (want('Memory')) {
    copyTreeIfMissing(path.join(PAYLOAD_DIR, 'spec'), path.join(rootDir, '.spec'), report);
  }

  // ---- the agent contract ----
  if (want('Agents')) {
    writeIfMissing(
      path.join(rootDir, 'AGENTS.md'),
      readFileSync(path.join(PAYLOAD_DIR, 'AGENTS.md'), 'utf-8'),
      report
    );
  }

  // ---- product documentation, for humans rather than agents ----
  if (want('Docs')) {
    copyTreeIfMissing(path.join(PAYLOAD_DIR, 'docs'), path.join(rootDir, 'docs'), report);
  }

  // ---- skills, role agents and hooks ----
  const detected = detectAgent(rootDir, opts.agent);
  if (detected.agent !== 'none') {
    const skillsRoot = path.join(rootDir, AGENT_SKILL_DIRS[detected.agent]);
    const payloadSkills = path.join(PAYLOAD_DIR, 'claude', 'skills');

    if (minimal || opts.noSkills === true) {
      // the engine's own contract is not optional: without it the agent does
      // not know the gates exist
      copyTreeIfMissing(
        path.join(payloadSkills, 'adp'),
        path.join(skillsRoot, 'adp'),
        report
      );
    } else {
      copyTreeIfMissing(payloadSkills, skillsRoot, report);
    }

    if (detected.agent === 'claude' && want('Roles')) {
      copyTreeIfMissing(
        path.join(PAYLOAD_DIR, 'claude', 'agents'),
        path.join(rootDir, '.claude', 'agents'),
        report
      );
      copyTreeIfMissing(
        path.join(PAYLOAD_DIR, 'claude', 'hooks'),
        path.join(rootDir, '.claude', 'hooks'),
        report
      );
      for (const f of ['CLAUDE.md', 'settings.json']) {
        const from = path.join(PAYLOAD_DIR, 'claude', f);
        if (existsSync(from)) {
          writeIfMissing(path.join(rootDir, '.claude', f), readFileSync(from), report);
        }
      }
    } else if (detected.agent !== 'claude' && want('Roles')) {
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

export function newFeature(rootDir, name, opts = {}) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('feature name must be lower-case letters, digits and hyphens, e.g. student-enrolment');
  }
  const featuresDir = opts.featuresDir ?? '.spec/features';
  const dir = path.join(rootDir, featuresDir, name);
  const report = { created: [], kept: [], notes: [], relTo: rootDir };

  // Codes are unique across the whole project, so a new feature must not
  // restart at 001. Read the highest code in use BEFORE writing anything: the
  // templates carry example codes, and scanning afterwards would report the
  // feature's own placeholders back as if they were somebody else's.
  const used = highestCodes(path.join(rootDir, featuresDir));

  for (const doc of ['PRD.md', 'RFC.md', 'TDD.md']) {
    writeIfMissing(path.join(dir, doc), fill(template(doc), { FEATURE: name }), report);
  }

  if (used.length) {
    report.notes.push(
      `codes already in use elsewhere — continue from: ${used.join(', ')} (codes are unique project-wide)`
    );
  }
  return report;
}

function highestCodes(featuresRoot) {
  if (!existsSync(featuresRoot)) return [];
  const highest = {};
  const walk = (dir) => {
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
  walk(featuresRoot);
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
