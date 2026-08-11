// The ceremony matrix — SCOPE-0.6.0.md §2.5.
//
// Every PRD used to demand the same four documents regardless of size. A
// signal is a fact about a feature that a human declares (`> signals:` in
// PRD.md); the LEVEL is always computed from the signals present, never
// declared directly — the same posture every other check here takes: trust
// narrow, observable primitives, not a derived conclusion someone could get
// wrong. Getting the level from a formula also means a PRD can never disagree
// with its own signals, which sidesteps a whole reconciliation problem.
//
// Judgment call, flagged in the plan for M2b-core: §2.5's own worked example
// keeps a lone estimate-only signal at `light`; this module bumps any single
// "softer" signal (hard-to-reverse, new-tech, large-estimate) to `medium`
// instead. The cost is not symmetric — a medium feature mistakenly run light
// loses a DESIGN section; a genuinely hard-to-reverse or new-tech change
// mistakenly run light loses the review DESIGN exists to force.

export const SIGNALS = ['multiple-teams', 'hard-to-reverse', 'money-or-pii', 'new-tech', 'large-estimate'];

export const LEVELS = ['light', 'medium', 'rfc-first', 'full'];

export function computeLevel(signals) {
  const has = (s) => signals.includes(s);
  if (has('money-or-pii')) return 'full';
  if (has('multiple-teams')) return 'rfc-first';
  if (has('hard-to-reverse') || has('new-tech') || has('large-estimate')) return 'medium';
  return 'light';
}

// What a level requires. G2 (RFC) is due at rfc-first and full; G3 (DESIGN)
// is due at everything but light — "SPEC + tasks direct" is the only row
// that skips it.
export function describeFeatureCeremony(prd) {
  const signals = prd?.signals ?? [];
  const level = computeLevel(signals);
  return {
    level,
    signals,
    requiresRfc: level === 'rfc-first' || level === 'full',
    requiresDesign: level !== 'light',
  };
}

// Applicability is project-wide, the same "worst case wins" shape every other
// gate already aggregates in, inverted for `n/a`: a gate reads n/a only when
// NO feature needs it. If even one does, the gate evaluates normally and only
// the features that need it are checked (see audit.js).
export function projectCeremony(features) {
  const perFeature = new Map();
  let g2Applicable = false;
  let g3Applicable = false;
  const g2Needers = [];
  const g3Needers = [];

  for (const f of features) {
    const info = describeFeatureCeremony(f.prd);
    perFeature.set(f.name, info);
    if (info.requiresRfc) {
      g2Applicable = true;
      g2Needers.push(f.name);
    }
    if (info.requiresDesign) {
      g3Applicable = true;
      g3Needers.push(f.name);
    }
  }

  return {
    perFeature,
    g2Applicable,
    g3Applicable,
    reason: {
      G2: g2Applicable
        ? `required by ${g2Needers.join(', ')}`
        : 'no feature is at rfc-first or full ceremony',
      G3: g3Applicable
        ? `required by ${g3Needers.join(', ')}`
        : 'no feature is above light ceremony',
    },
  };
}
