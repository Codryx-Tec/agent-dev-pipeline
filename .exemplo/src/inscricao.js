// Enrolment rules for a class.
//
// Order matters and is not arbitrary: the guardian check runs BEFORE the seat
// check, so a blocked minor never consumes a seat (AC-003 asserts it).

const MAIORIDADE = 18;

export function inscrever({ turma, dados }) {
  // @ref: AC-003 — a minor without guardian data has no legal basis
  if (dados.idade < MAIORIDADE && !dados.responsavel?.email) {
    return { ok: false, motivo: 'guardian required' };
  }

  // @ref: AC-002 — refuse before mutating, so the count is left untouched
  if (turma.vagas <= 0) {
    return { ok: false, motivo: 'class full' };
  }

  // @ref: AC-001 — decided in D-001: the decrement lives with the refusal
  turma.vagas -= 1;
  return { ok: true };
}
