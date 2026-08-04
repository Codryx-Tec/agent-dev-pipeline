// Enrolment rules for a cohort.
//
// Order matters and is not arbitrary: the guardian check runs BEFORE the seat
// check, so a blocked minor never consumes a seat (AC-003 asserts it).

const ADULT_AGE = 18;

export function enrol({ cohort, applicant }) {
  // @ref: AC-003 — a minor without guardian data has no legal basis
  if (applicant.age < ADULT_AGE && !applicant.guardian?.email) {
    return { ok: false, reason: 'guardian required' };
  }

  // @ref: AC-002 — refuse before mutating, so the count is left untouched
  if (cohort.seats <= 0) {
    return { ok: false, reason: 'class full' };
  }

  // @ref: AC-001 — decided in D-001: the decrement lives with the refusal
  cohort.seats -= 1;
  return { ok: true };
}
