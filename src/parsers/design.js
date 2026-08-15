// DESIGN parser — "the blueprint a human reads" (Q-003 in
// .spec/SCOPE-0.6.0.md). Formerly TDD.md's role, minus T-xxx: tasks moved to
// SPEC.md, since a task is something the machine confers, not something a
// human designs.
//
// Deliberately thin. DESIGN.md's prose sections ("Shape of the solution",
// "Components", "Data and contracts") carry no machine-checked structure —
// nothing in this engine parsed them before this file existed either, and
// inventing that structure now would be unrequested scope, not a migration
// of anything real. All this parser needs to answer is "does the document
// exist, and what does it claim about itself" — the rest of what DESIGN.md
// is for is between the reader and the prose.

const RE_STATUS = /^>\s*status:\s*(\S+)/m;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

export function parseDesign(content, file) {
  return {
    kind: 'design',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    status: content.match(RE_STATUS)?.[1] ?? null,
  };
}
