// The one place that knows where a payload file lands inside a project.
//
// `initProject()` used to decide this with several near-duplicate
// conditionals, one per payload subtree. `adp upgrade` needs to recompute the
// exact same mapping to classify a file correctly — a second implementation
// that could silently drift from the first is worse than no shortcut at all,
// so both go through this module instead.
//
// `templates/SCOPE.md` and the three per-feature scaffolds are permanently
// excluded: SCOPE.md is filled in with the project's own name/owner/date, so
// there is no payload hash to compare it against, and PRD.md/RFC.md/TDD.md
// belong to `newFeature()`, never to `initProject()`.

import { AGENT_SKILL_DIRS } from './paths.js';

const EXCLUDED_TEMPLATES = new Set(['templates/SCOPE.md', 'templates/PRD.md', 'templates/RFC.md', 'templates/TDD.md']);

function strip(prefix, rel) {
  return rel.slice(prefix.length);
}

/**
 * Where a single payload-relative path lands in a project, given install
 * options — or null if this install would not place it at all.
 */
export function mapPayloadPath(payloadRel, opts = {}) {
  const minimal = Boolean(opts.minimal);
  const want = (flag) => !minimal && opts[flag] !== true;

  if (EXCLUDED_TEMPLATES.has(payloadRel)) return null;
  if (payloadRel === 'templates/CONSTITUTION.md') return '.spec/CONSTITUTION.md';
  if (payloadRel === 'templates/adp.config.json') return 'adp.config.json';
  if (payloadRel === 'AGENTS.md') return want('noAgents') ? 'AGENTS.md' : null;
  if (payloadRel.startsWith('spec/')) return want('noMemory') ? `.spec/${strip('spec/', payloadRel)}` : null;
  if (payloadRel.startsWith('docs/')) return want('noDocs') ? payloadRel : null;

  if (payloadRel.startsWith('claude/skills/')) {
    if (!opts.agent || opts.agent === 'none') return null;
    // An explicit override always wins, for any agent name — known or not.
    // Mirrors agent.js's resolveAgentCommand, which lets config.agent.command
    // bypass AGENT_COMMANDS the same way.
    const skillsRoot = opts.skillsDir || AGENT_SKILL_DIRS[opts.agent];
    if (!skillsRoot) return null;
    const rest = strip('claude/skills/', payloadRel);
    // --minimal / --no-skills install only the engine's own contract: the
    // agent still needs to know the gates exist even without the extras.
    if ((minimal || opts.noSkills === true) && !rest.startsWith('adp/')) return null;
    return `${skillsRoot}/${rest}`;
  }

  // The role agents, hooks and the two loose files below are Claude Code
  // features with no equivalent elsewhere, so they install only for that
  // harness — same restriction `initProject()` applies today.
  const claudeOnly = opts.agent === 'claude' && want('noRoles');
  if (payloadRel.startsWith('claude/agents/')) {
    return claudeOnly ? `.claude/agents/${strip('claude/agents/', payloadRel)}` : null;
  }
  if (payloadRel.startsWith('claude/hooks/')) {
    return claudeOnly ? `.claude/hooks/${strip('claude/hooks/', payloadRel)}` : null;
  }
  if (payloadRel === 'claude/CLAUDE.md') return claudeOnly ? '.claude/CLAUDE.md' : null;
  if (payloadRel === 'claude/settings.json') return claudeOnly ? '.claude/settings.json' : null;

  // An unrecognised shape is excluded rather than guessed at: silently
  // installing something nobody asked for is worse than leaving it out and
  // being wrong loudly (it will show up as `new` under a later `adp upgrade`
  // once this map learns about it).
  return null;
}

/**
 * The full install plan for a manifest: every payload-relative path this
 * install would place, and where.
 *
 * @param {Record<string,string>} manifestFiles - manifest.files, payloadRel -> hash
 * @param {object} opts - { agent, skillsDir, minimal, noSkills, noRoles, noDocs, noMemory, noAgents }
 * @returns {{payloadRel: string, projectRel: string}[]}
 */
export function buildInstallPlan(manifestFiles, opts = {}) {
  const plan = [];
  for (const payloadRel of Object.keys(manifestFiles)) {
    const projectRel = mapPayloadPath(payloadRel, opts);
    if (projectRel) plan.push({ payloadRel, projectRel });
  }
  return plan;
}
