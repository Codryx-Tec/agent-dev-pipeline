// Function Point estimation — the human-declared-count slice of
// SCOPE-0.6.0.md PRD-003.
//
// What this is NOT: automated counting. The full PRD-003 has the AI propose
// ALI/AIE/EE/CE/SE classifications, citing their source in SCOPE/PRD, with a
// human confirming item by item (`--review`). That does not exist here — a
// human declares the PF count directly (`adp estimate --pf <n>`), the same
// posture `adp new --signals` already takes: declare what you already know,
// let the machine compute what follows from it.
//
// "A estimativa nunca é prova." Nothing here is a gate, and nothing here is
// wired to escalate to error under --ci — this whole file is descriptive,
// not enforced, matching `> signals:`'s own posture and PRD-003's own
// explicit line: "O motor não veta o projeto."

import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const APP_TYPES = ['business-crud', 'real-time', 'infra', 'mathematical'];
export const FAMILIARITY_LEVELS = ['never', 'delivered', 'master'];

// APF was designed for information systems. It measures the other three
// types poorly — including, worth saying out loud, this very tool (`infra`).
const LOW_FIT_APP_TYPES = new Set(['real-time', 'infra', 'mathematical']);

const DEFAULT_PROFILE = {
  stack: 'unknown',
  familiarity: 'delivered',
  appType: 'business-crud',
  brownfield: false,
  hasTests: false,
  declaredAt: null, // null means "nobody ran `adp profile`" — a fact worth showing, not hiding
};

const FALLBACK_ROW_KEY = 'business-crud/delivered';

export function profilePath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'profile.json');
}

export function hoursTablePath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'hours-per-fp.json');
}

export function estimateJsonPath(rootDir, config) {
  return path.join(rootDir, config.specDir ?? '.spec', 'metrics', 'estimate.json');
}

/** The last computed estimate, or null if `adp estimate` never ran. */
export function loadEstimate(rootDir, config) {
  const p = estimateJsonPath(rootDir, config);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** The declared profile, or the labelled default if `adp profile` never ran. */
export function loadProfile(rootDir, config) {
  const p = profilePath(rootDir, config);
  if (!existsSync(p)) return { ...DEFAULT_PROFILE, declared: false };
  try {
    return { ...JSON.parse(readFileSync(p, 'utf8')), declared: true };
  } catch {
    return { ...DEFAULT_PROFILE, declared: false };
  }
}

export function loadHoursTable(rootDir, config) {
  const p = hoursTablePath(rootDir, config);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')).rows ?? [];
  } catch {
    return null;
  }
}

/**
 * PF × the row matching this profile's app type and familiarity. Falls back
 * to `business-crud/delivered` — the middle of the table — when the exact
 * combination has no row, and says so rather than silently substituting.
 */
// Not a real ceiling on project size — a guard against `pf * row.high`
// overflowing into Infinity, which JSON.stringify silently turns into
// `null` rather than erroring. The largest APF counts on record are in the
// tens of thousands; a million is already an absurd input, not a real one.
const MAX_PLAUSIBLE_PF = 1_000_000;

export function computeEstimate({ pf, profile, hoursTable, hoursPerMonth = 160 }) {
  if (!Number.isFinite(pf) || pf <= 0) {
    throw new Error('--pf must be a positive number');
  }
  if (pf > MAX_PLAUSIBLE_PF) {
    throw new Error(`--pf ${pf} is not plausible (over ${MAX_PLAUSIBLE_PF.toLocaleString('en-US')}) — check the count`);
  }
  const key = `${profile.appType}/${profile.familiarity}`;
  let row = hoursTable.find((r) => r.profile === key);
  let usedFallback = false;
  if (!row) {
    row = hoursTable.find((r) => r.profile === FALLBACK_ROW_KEY);
    usedFallback = true;
  }
  if (!row) {
    throw new Error(`no row for "${key}" and no fallback row "${FALLBACK_ROW_KEY}" in the hours table`);
  }

  return {
    pf,
    profile,
    rowUsed: row.profile,
    usedFallback,
    source: row.source,
    hours: {
      low: Math.round(pf * row.low),
      likely: Math.round(pf * row.likely),
      high: Math.round(pf * row.high),
    },
    // §12.1's threshold: the ceremony matrix's `large-estimate` signal,
    // printed for a human to weigh — not wired to set the signal
    // automatically (deferred; see the plan for why).
    limiarPF: Math.round(hoursPerMonth / row.high),
    lowFit: LOW_FIT_APP_TYPES.has(profile.appType),
    generatedAt: new Date().toISOString(),
  };
}

export function renderEstimateMd(estimate, project) {
  const out = [`# Estimate — ${project}`, ''];
  out.push(`Generated: ${estimate.generatedAt}`);
  out.push('');
  out.push('**This is not proof.** Nothing here is verified mechanically; it is a declared');
  out.push('count multiplied by a declared, editable table. Function Points counted by hand,');
  out.push('not by the automated interview — that part of PRD-003 is not built in this version.');
  out.push('');
  out.push(`- Function Points (declared): **${estimate.pf}**`);
  out.push(`- Profile: appType=${estimate.profile.appType}, familiarity=${estimate.profile.familiarity}, stack=${estimate.profile.stack}` + (estimate.profile.declared ? '' : ' *(no profile declared — run `adp profile`; using the generic default)*'));
  out.push(`- Table row used: \`${estimate.rowUsed}\` (source: ${estimate.source})` + (estimate.usedFallback ? ' — no row for this exact profile, fell back to the generic row' : ''));
  out.push('');
  out.push(`| | hours |`);
  out.push(`|---|---|`);
  out.push(`| low | ${estimate.hours.low} |`);
  out.push(`| likely | ${estimate.hours.likely} |`);
  out.push(`| high | ${estimate.hours.high} |`);
  out.push('');
  out.push(`limiarPF (ceremony matrix threshold, informational only): **${estimate.limiarPF} PF**`);
  if (estimate.lowFit) {
    out.push('');
    out.push(`> **APF measures this app type poorly.** Function Point analysis was designed for`);
    out.push(`> information systems; \`${estimate.profile.appType}\` is one of the three types it`);
    out.push(`> measures badly. Treat this range as weaker evidence than usual.`);
  }
  return out.join('\n') + '\n';
}

export function renderEstimateCsv(estimate, project) {
  const header = 'project,appType,familiarity,pf,lowHours,likelyHours,highHours,source';
  const row = [
    project,
    estimate.profile.appType,
    estimate.profile.familiarity,
    estimate.pf,
    estimate.hours.low,
    estimate.hours.likely,
    estimate.hours.high,
    estimate.source,
  ].join(',');
  return `${header}\n${row}\n`;
}
