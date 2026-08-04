// Gates — six named checkpoints, each owning a subset of finding codes.
//
// RFC D-009: one verdict for a project whose PRD is not written yet is
// technically correct and practically useless. Gates make findings arrive in
// the order the work happens, and give the page an honest thing to show: a
// sequence of lights where the FIRST red one is the only one that matters.
//
// Three states, not two. `blocked` means an earlier gate is red, so this gate
// was never evaluated — rendering that as red would blame the wrong step.
//
// Every code the audit can emit MUST appear exactly once below. test/gates.test.js
// asserts it; without that test a new code belongs to no gate and becomes
// invisible, which is the failure mode D-009 warned about.

export const GATES = [
  {
    id: 'G0',
    title: 'Scope approved',
    question: 'Is the scope approved?',
    codes: ['SCOPE_AUSENTE', 'SCOPE_NAO_APROVADO', 'SCOPE_CAMPO_VAZIO'],
  },
  {
    id: 'G1',
    title: 'PRD complete',
    question: 'Is the PRD complete — what, for whom, why?',
    codes: [
      'PRD_AUSENTE',
      'SPEC_SEM_US',
      'US_SEM_AC',
      'AC_INCOMPLETO',
      'AC_FORA_DE_US',
      'ID_DUPLICADO',
      'ID_CURTO',
    ],
  },
  {
    id: 'G2',
    title: 'Path decided',
    question: 'Is the path decided, with alternatives recorded?',
    codes: [
      'RFC_AUSENTE',
      'DECISAO_SEM_ALTERNATIVA',
      'DECISAO_SEM_ESCOLHA',
      'SECAO_AUSENTE',
      'Q_BLOQUEANTE_ABERTA',
      'STATUS_INVALIDO',
      'ASM_SEM_CODIGO',
    ],
  },
  {
    id: 'G3',
    title: 'Breakdown implementable',
    question: 'Is the breakdown implementable and plannable?',
    codes: [
      'TDD_AUSENTE',
      'AC_SEM_TASK',
      'REF_QUEBRADA',
      'REF_SEM_CRITERIO',
      'TASK_SEM_ARQUIVOS',
      'TASK_STATUS_INVALIDO',
      'ARQUIVO_INEXISTENTE',
    ],
  },
  {
    id: 'G4',
    title: 'Proven',
    question: 'Is every acceptance criterion proven by a passing test?',
    codes: ['AC_SEM_TESTE', 'AC_SEM_PROVA', 'VERIFY_OBSOLETO', 'PROVA_FRACA'],
  },
  {
    id: 'G5',
    title: 'Aligned',
    question: 'Do the documents, the code and the constitution still agree?',
    codes: [
      'TESTE_ORFAO',
      'TASK_CONCLUIDA_SEM_PROVA',
      'ASM_ABERTA',
      'Q_ABERTA',
      'PRINCIPIO_SEM_VERIFICACAO',
      'PRINCIPIO_VIOLADO',
      'NIVEL_INVALIDO',
      'VERIFICACAO_MALFORMADA',
      'GLOB_SEM_ARQUIVOS',
      'ARQUIVO_ORFAO',
      'FEATURE_DIVERGENTE',
      'PROJETO_INVALIDO',
    ],
  },
];

// Codes whose severity is a warning during the work and an error at the gate.
// One engine, two postures: strict enough to be a gate, quiet enough to work
// under.
export const CI_ESCALATES = new Set([
  'AC_SEM_PROVA',
  'VERIFY_OBSOLETO',
  'Q_ABERTA',
  'AC_SEM_TASK',
  'ARQUIVO_ORFAO',
  'PROVA_FRACA',
]);

// Human-readable name first, stable code in parentheses (PRD AC-024).
// The CODE is never translated — AGENTS.md is explicit about this.
export const LABELS = {
  SCOPE_AUSENTE: 'scope document missing',
  SCOPE_NAO_APROVADO: 'scope not approved',
  SCOPE_CAMPO_VAZIO: 'required scope field empty',
  PRD_AUSENTE: 'PRD missing',
  RFC_AUSENTE: 'RFC missing',
  TDD_AUSENTE: 'TDD missing',
  SPEC_SEM_US: 'PRD has no user story',
  US_SEM_AC: 'user story without acceptance criterion',
  AC_INCOMPLETO: 'incomplete acceptance criterion',
  AC_FORA_DE_US: 'acceptance criterion outside any story',
  ID_DUPLICADO: 'duplicate traceability code',
  ID_CURTO: 'traceability code too short',
  DECISAO_SEM_ALTERNATIVA: 'decision without alternatives',
  DECISAO_SEM_ESCOLHA: 'decision without a chosen option',
  SECAO_AUSENTE: 'required section missing',
  Q_BLOQUEANTE_ABERTA: 'blocking question still open',
  Q_ABERTA: 'open question',
  STATUS_INVALIDO: 'invalid status',
  ASM_SEM_CODIGO: 'assumption or question without a traceability code',
  AC_SEM_TASK: 'acceptance criterion covered by no task',
  REF_QUEBRADA: 'broken reference',
  REF_SEM_CRITERIO: 'task references no criterion',
  TASK_SEM_ARQUIVOS: 'task without declared files',
  TASK_STATUS_INVALIDO: 'invalid task status',
  ARQUIVO_INEXISTENTE: 'task maps a file that does not exist',
  AC_SEM_TESTE: 'acceptance criterion without a test',
  AC_SEM_PROVA: 'acceptance criterion without proof',
  VERIFY_OBSOLETO: 'proof is out of date',
  PROVA_FRACA: 'weak proof',
  TESTE_ORFAO: 'orphan test',
  TASK_CONCLUIDA_SEM_PROVA: 'task completed without proof',
  ASM_ABERTA: 'open assumption',
  PRINCIPIO_SEM_VERIFICACAO: 'principle without executable verification',
  PRINCIPIO_VIOLADO: 'principle violated',
  NIVEL_INVALIDO: 'invalid principle level',
  VERIFICACAO_MALFORMADA: 'malformed verification',
  GLOB_SEM_ARQUIVOS: 'verification matches no file',
  ARQUIVO_ORFAO: 'source file mapped by no task',
  FEATURE_DIVERGENTE: 'feature name diverges from its directory',
  PROJETO_INVALIDO: 'project could not be read',
};

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

// Evaluate the gates against a finding list. Order is load-bearing: once a gate
// is red, everything after it is `blocked`, never red.
export function evaluateGates(findings) {
  const results = [];
  let blockedFrom = null;

  for (const gate of GATES) {
    const own = findings.filter((f) => gateOf(f.code) === gate.id);
    const errors = own.filter((f) => f.severity === 'error');
    const warnings = own.filter((f) => f.severity === 'warning');

    if (blockedFrom) {
      results.push({
        ...gate, state: 'blocked', blockedBy: blockedFrom,
        findings: own, errors: errors.length, warnings: warnings.length,
      });
      continue;
    }
    const state = errors.length ? 'red' : 'green';
    results.push({
      ...gate, state, blockedBy: null,
      findings: own, errors: errors.length, warnings: warnings.length,
    });
    if (state === 'red') blockedFrom = gate.id;
  }

  const firstRed = results.find((g) => g.state === 'red') ?? null;
  return {
    gates: results,
    firstRed: firstRed ? firstRed.id : null,
    // exit code doubles as the gate number that failed: 0 clean, 1..6 for G0..G5
    exitCode: firstRed ? GATES.findIndex((g) => g.id === firstRed.id) + 1 : 0,
  };
}
