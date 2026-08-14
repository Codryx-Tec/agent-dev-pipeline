// Gates — seven named checkpoints, each owning a subset of finding codes.
//
// RFC D-009: one verdict for a project whose PRD is not written yet is
// technically correct and practically useless. Gates make findings arrive in
// the order the work happens, and give the page an honest thing to show: a
// sequence of lights where the FIRST red one is the only one that matters.
//
// Four states, not three. `blocked` means an earlier gate is red, so this
// gate was never evaluated — rendering that as red would blame the wrong
// step. `n/a` (M2b, SCOPE-0.6.0.md §2.5) means the ceremony matrix decided
// this gate is not due for any feature at its current level — G2/G3 only,
// never G0/G1/G4/G5/G6, which the scope document treats as never skippable.
//
// 0.6.0 (M2) split the document chain: PRD.md became prose only (what, for
// whom, why); US-xxx/AC-xxx/ASM-xxx/Q-xxx/T-xxx all moved to a new SPEC.md —
// "the layer the machine confers"; TDD.md was renamed DESIGN.md and kept only
// the prose a human reads. That is what turned six gates into seven: G3
// (DESIGN) is now presence-only, and the codes that used to live in G1
// (PRD) and G3 (TDD/breakdown) mostly relocated to a new G4 (SPEC).
//
// Every code the audit can emit MUST appear exactly once below. test/gates.test.js
// asserts it; without that test a new code belongs to no gate and becomes
// invisible, which is the failure mode D-009 warned about.

export const GATES = [
  {
    id: 'G0',
    title: 'Scope approved',
    question: 'Is the scope approved?',
    codes: ['SCOPE_MISSING', 'SCOPE_NOT_APPROVED', 'SCOPE_FIELD_EMPTY'],
  },
  {
    id: 'G1',
    title: 'PRD complete',
    question: 'Is the PRD complete — what, for whom, why?',
    codes: ['PRD_MISSING', 'ID_DUPLICATE', 'ID_TOO_SHORT', 'SIGNAL_UNKNOWN', 'PRD_UNPLACED', 'BACKLOG_ITEM_WITH_CODE', 'PRD_WITH_SOLUTION'],
  },
  {
    id: 'G2',
    title: 'Path decided',
    question: 'Is the path decided, with alternatives recorded?',
    codes: ['RFC_MISSING', 'DECISION_WITHOUT_ALTERNATIVE', 'DECISION_WITHOUT_CHOICE', 'CONTEXT_WITHOUT_NUMBERS', 'STRAW_OPTION', 'OPTION_DO_NOTHING_MISSING'],
  },
  {
    id: 'G3',
    title: 'Design exists',
    question: 'Is the design written?',
    codes: ['DESIGN_MISSING'],
  },
  {
    id: 'G4',
    title: 'Spec implementable',
    question: 'Is the spec complete and implementable?',
    codes: [
      'SPEC_MISSING',
      'SPEC_WITHOUT_US',
      'US_WITHOUT_AC',
      'AC_INCOMPLETE',
      'AC_OUTSIDE_US',
      'AC_WITHOUT_TASK',
      'REF_BROKEN',
      'REF_WITHOUT_AC',
      'TASK_WITHOUT_FILES',
      'TASK_STATUS_INVALID',
      'FILE_MISSING',
      'Q_BLOCKING_OPEN',
      'ASM_WITHOUT_CODE',
      'SECTION_MISSING',
      'STATUS_INVALID',
      'AC_NOT_OBSERVABLE',
    ],
  },
  {
    id: 'G5',
    title: 'Proven',
    question: 'Is every acceptance criterion proven by a passing test?',
    codes: ['AC_WITHOUT_TEST', 'AC_WITHOUT_PROOF', 'PROOF_STALE', 'PROOF_WEAK'],
  },
  {
    id: 'G6',
    title: 'Aligned',
    question: 'Do the documents, the code and the constitution still agree?',
    codes: [
      'TEST_ORPHAN',
      'TASK_DONE_WITHOUT_PROOF',
      'ASM_OPEN',
      'Q_OPEN',
      'PRINCIPLE_WITHOUT_VERIFICATION',
      'PRINCIPLE_VIOLATED',
      'LEVEL_INVALID',
      'VERIFICATION_MALFORMED',
      'GLOB_WITHOUT_FILES',
      'FILE_ORPHAN',
      'FEATURE_MISMATCH',
      'PROJECT_INVALID',
      'DOC_TOO_LONG',
      'DOC_FOSSIL',
      'DUPLICATE_PROSE',
      // M5b — declared deferral (§12.1). All four here because deferring is
      // itself a claim about G5/G6 ("do mundo mudando debaixo do
      // documento") — the same question G6 already asks.
      'DEFERRAL_TOO_BROAD',
      'DEFERRAL_WITHOUT_OWNER',
      'DEFERRAL_WITHOUT_DEADLINE',
      'DEFERRAL_TOO_LONG',
      'DEFERRAL_NOT_ELIGIBLE',
      'DEFERRAL_EXPIRED',
      'DEFERRAL_RENEWED_REPEATEDLY',
    ],
  },
];

// Codes whose severity is a warning during the work and an error at the gate.
// One engine, two postures: strict enough to be a gate, quiet enough to work
// under.
export const CI_ESCALATES = new Set([
  'AC_WITHOUT_PROOF',
  'PROOF_STALE',
  'Q_OPEN',
  'AC_WITHOUT_TASK',
  'FILE_ORPHAN',
  'PROOF_WEAK',
  // M3b: "doc that lies is worse than no doc" — the same posture PROOF_STALE
  // already takes toward a proof record, applied to a document.
  'DOC_FOSSIL',
]);

// Human-readable name first, stable code in parentheses (PRD AC-024).
// The CODE is never localised at render time: one project, one spelling, in
// every locale. The vocabulary itself is English (D-016).
export const LABELS = {
  SCOPE_MISSING: 'scope document missing',
  SCOPE_NOT_APPROVED: 'scope not approved',
  SCOPE_FIELD_EMPTY: 'required scope field empty',
  PRD_MISSING: 'PRD missing',
  RFC_MISSING: 'RFC missing',
  DESIGN_MISSING: 'DESIGN missing',
  SPEC_MISSING: 'SPEC missing',
  SPEC_WITHOUT_US: 'SPEC has no user story',
  US_WITHOUT_AC: 'user story without acceptance criterion',
  AC_INCOMPLETE: 'incomplete acceptance criterion',
  AC_OUTSIDE_US: 'acceptance criterion outside any story',
  ID_DUPLICATE: 'duplicate traceability code',
  ID_TOO_SHORT: 'traceability code too short',
  SIGNAL_UNKNOWN: 'unrecognized ceremony signal',
  PRD_UNPLACED: 'PRD not declared in the MVP boundary',
  BACKLOG_ITEM_WITH_CODE: 'backlog item carries a real tracking code',
  PRD_WITH_SOLUTION: 'PRD names a technical solution',
  DECISION_WITHOUT_ALTERNATIVE: 'decision without alternatives',
  DECISION_WITHOUT_CHOICE: 'decision without a chosen option',
  CONTEXT_WITHOUT_NUMBERS: 'RFC context has no measurable figure',
  STRAW_OPTION: 'option propped up with weak or missing cons',
  OPTION_DO_NOTHING_MISSING: 'no option considers not doing this',
  SECTION_MISSING: 'required section missing',
  Q_BLOCKING_OPEN: 'blocking question still open',
  Q_OPEN: 'open question',
  STATUS_INVALID: 'invalid status',
  ASM_WITHOUT_CODE: 'assumption or question without a traceability code',
  AC_WITHOUT_TASK: 'acceptance criterion covered by no task',
  REF_BROKEN: 'broken reference',
  REF_WITHOUT_AC: 'task references no criterion',
  TASK_WITHOUT_FILES: 'task without declared files',
  TASK_STATUS_INVALID: 'invalid task status',
  FILE_MISSING: 'task maps a file that does not exist',
  AC_NOT_OBSERVABLE: 'acceptance criterion is not observable',
  AC_WITHOUT_TEST: 'acceptance criterion without a test',
  AC_WITHOUT_PROOF: 'acceptance criterion without proof',
  PROOF_STALE: 'proof is out of date',
  PROOF_WEAK: 'weak proof',
  TEST_ORPHAN: 'orphan test',
  TASK_DONE_WITHOUT_PROOF: 'task completed without proof',
  ASM_OPEN: 'open assumption',
  PRINCIPLE_WITHOUT_VERIFICATION: 'principle without executable verification',
  PRINCIPLE_VIOLATED: 'principle violated',
  LEVEL_INVALID: 'invalid principle level',
  VERIFICATION_MALFORMED: 'malformed verification',
  GLOB_WITHOUT_FILES: 'verification matches no file',
  FILE_ORPHAN: 'source file mapped by no task',
  FEATURE_MISMATCH: 'feature name diverges from its directory',
  PROJECT_INVALID: 'project could not be read',
  DOC_TOO_LONG: 'document is over its length ceiling',
  DOC_FOSSIL: 'document is older than the code it describes',
  DUPLICATE_PROSE: 'substantial prose repeated across documents',
  DEFERRAL_TOO_BROAD: 'deferral matches more findings than allowed',
  DEFERRAL_WITHOUT_OWNER: 'deferral without an owner or a reason',
  DEFERRAL_WITHOUT_DEADLINE: 'deferral without an Until date',
  DEFERRAL_TOO_LONG: 'deferral deadline beyond the allowed ceiling',
  DEFERRAL_NOT_ELIGIBLE: 'deferral of a finding that cannot be deferred',
  DEFERRAL_EXPIRED: 'deferral past its deadline',
  DEFERRAL_RENEWED_REPEATEDLY: 'deferral renewed three times or more',
};

// The ten codes SCOPE-0.6.0.md §12.1 names as never-deferrable, regardless of
// gate: "não se adia decidir, e não se adia a recusa sobre a qual tudo se
// apoia." Several of these (RFC_REQUIRED, DOOR_UNDECLARED, MVP_WIDENED,
// BASELINE_WIDENED, HOURS_IMPLAUSIBLE) are not implemented yet — kept here
// anyway so the day they land they are excluded from birth, not by a second
// patch someone has to remember to write.
export const NEVER_DEFERRABLE = new Set([
  'TASK_DONE_WITHOUT_PROOF',
  'AC_WITHOUT_PROOF',
  'PROOF_WEAK',
  'PROOF_STALE',
  'SCOPE_NOT_APPROVED',
  'RFC_REQUIRED',
  'DOOR_UNDECLARED',
  'MVP_WIDENED',
  'BASELINE_WIDENED',
  'HOURS_IMPLAUSIBLE',
]);

// "Adiável só o que pertence a G5 e G6" — the gates that describe the world
// changing under the document, never the ones that describe a decision not
// yet made.
export function isDeferrable(code) {
  const gate = GATE_OF.get(code);
  return (gate === 'G5' || gate === 'G6') && !NEVER_DEFERRABLE.has(code);
}

const GATE_OF = new Map();
for (const gate of GATES) for (const code of gate.codes) GATE_OF.set(code, gate.id);

export function gateOf(code) {
  return GATE_OF.get(code) ?? null;
}

export function allMappedCodes() {
  return new Set(GATE_OF.keys());
}

export function label(code) {
  return LABELS[code] ?? code;
}

// Which key on a ceremony result (core/ceremony.js's projectCeremony())
// decides whether a given gate is due at all. Only G2/G3 are ever optional —
// see the note at the top of this file for why the rest are not in here.
const CEREMONY_KEY = { G2: 'g2Applicable', G3: 'g3Applicable' };

// Evaluate the gates against a finding list. Order is load-bearing: once a gate
// is red, everything after it is `blocked`, never red.
//
// `ceremony`, when passed, is core/ceremony.js's projectCeremony() result. It
// is optional so every caller that predates M2b (and every test that builds
// findings by hand) keeps evaluating G2/G3 exactly as before — a gate is only
// ever n/a when something explicitly said so.
export function evaluateGates(findings, { ceremony = null } = {}) {
  const results = [];
  let blockedFrom = null;

  for (const gate of GATES) {
    const own = findings.filter((f) => gateOf(f.code) === gate.id);
    // M5b: a validly deferred finding counts toward neither bucket — it is
    // shown, not hidden, but it does not turn the gate red and it is not a
    // plain warning either. "A contagem ativa é sempre impressa" (§12.1) is
    // the `deferred` field below, not folded into warnings.
    const deferred = own.filter((f) => f.deferred);
    const errors = own.filter((f) => f.severity === 'error' && !f.deferred);
    const warnings = own.filter((f) => f.severity === 'warning' && !f.deferred);
    const base = {
      ...gate,
      findings: own,
      errors: errors.length,
      warnings: warnings.length,
      deferred: deferred.length,
    };

    if (blockedFrom) {
      results.push({ ...base, state: 'blocked', blockedBy: blockedFrom, reason: null });
      continue;
    }

    // `own.length === 0` is load-bearing, not a style choice: audit.js's
    // global RFC-completeness check runs on every RFC file that EXISTS,
    // unconditionally — deliberately unrelated to which feature's ceremony
    // requires one (an RFC a human wrote is checked for completeness
    // regardless of who currently links it). So a stale or orphaned RFC can
    // fail G2 even in a project where no feature currently needs G2 at all.
    // Without this guard, n/a would silently swallow those real findings —
    // reporting exit 0 (or skipping straight to a later gate) over an
    // actual DECISION_WITHOUT_ALTERNATIVE. "Not due" and "clean" are not
    // the same claim, and only the second one may ever suppress a finding.
    const ceremonyKey = CEREMONY_KEY[gate.id];
    if (ceremony && ceremonyKey && !ceremony[ceremonyKey] && own.length === 0) {
      // n/a never sets blockedFrom — G4/G5/G6 are always evaluated regardless
      // of G2/G3's ceremony state (§12.1: "Duas fases nunca são puladas").
      results.push({ ...base, state: 'n/a', blockedBy: null, reason: ceremony.reason[gate.id] });
      continue;
    }

    const state = errors.length ? 'red' : 'green';
    results.push({ ...base, state, blockedBy: null, reason: null });
    if (state === 'red') blockedFrom = gate.id;
  }

  const firstRed = results.find((g) => g.state === 'red') ?? null;
  return {
    gates: results,
    firstRed: firstRed ? firstRed.id : null,
    // exit code doubles as the gate number that failed: 0 clean, 1..7 for G0..G6
    exitCode: firstRed ? GATES.findIndex((g) => g.id === firstRed.id) + 1 : 0,
  };
}
