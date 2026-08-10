// PRD parser — prose only: what, for whom, why.
//
// US-xxx (stories) and AC-xxx (acceptance criteria) moved to SPEC.md in
// 0.6.0 (see spec.js). Keeping them in PRD.md pushed it toward the technical
// side and made it spec disfarçada — the antipattern the 0.6.0 restructuring
// exists to fix (.spec/SCOPE-0.6.0.md §2.1). What is left here is exactly
// what a product owner needs to read and nothing an engine cross-references
// against tasks or tests.

const RE_STATUS = /^>\s*status:\s*(\S+)/m;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

export const SPEC_STATUSES = [
  'draft',
  'ready',
  'in-implementation',
  'implemented',
  'audited',
];

export function parsePrd(content, file) {
  return {
    kind: 'prd',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    status: content.match(RE_STATUS)?.[1] ?? null,
  };
}
