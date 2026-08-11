// PRD parser — prose only: what, for whom, why.
//
// US-xxx (stories) and AC-xxx (acceptance criteria) moved to SPEC.md in
// 0.6.0 (see spec.js). Keeping them in PRD.md pushed it toward the technical
// side and made it spec disfarçada — the antipattern the 0.6.0 restructuring
// exists to fix (.spec/SCOPE-0.6.0.md §2.1). What is left here is exactly
// what a product owner needs to read and nothing an engine cross-references
// against tasks or tests.
//
// `rfcs:` is the one exception — a link, not a code family this document
// owns. RFC.md is no longer a fixed sibling file (Q-001: one RFC can serve
// several PRDs, one PRD often needs several), so a PRD names which decision
// records apply instead of the engine assuming a 1:1 nesting.

import { splitList } from '../util/text.js';

const RE_STATUS = /^>\s*status:\s*(\S+)/m;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;
// [ \t]*, not \s* — an empty "rfcs:" field must not let the match cross the
// newline and swallow the next line's prose as if it were the value.
const RE_RFCS = /^>\s*rfcs?:[ \t]*(.+)$/m;
const RE_SIGNALS = /^>\s*signals:[ \t]*(.+)$/m;

export const SPEC_STATUSES = [
  'draft',
  'ready',
  'in-implementation',
  'implemented',
  'audited',
];

// The recognized signal slugs live in core/ceremony.js, not here — a parser
// stays a parser, and reports the raw list as written. Anything unrecognized
// is audit.js's problem (SIGNAL_UNKNOWN), not this file's to silently drop.
export function parsePrd(content, file) {
  return {
    kind: 'prd',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    status: content.match(RE_STATUS)?.[1] ?? null,
    rfcs: splitList(content.match(RE_RFCS)?.[1] ?? '').map((id) => id.toUpperCase()),
    signals: splitList(content.match(RE_SIGNALS)?.[1] ?? ''),
  };
}
