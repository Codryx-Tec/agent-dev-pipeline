// Each test's TITLE carries the acceptance criterion it proves. The title is
// what survives into every runner's reporter output, which is why the
// annotation goes there and not in a comment.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrol } from '../src/enrolment.js';

test('enrolment in a class with a free seat @spec:AC-001', () => {
  const cohort = { id: 'aug', seats: 3 };
  const r = enrol({ cohort, applicant: { email: 'ana@example.com', age: 30 } });
  assert.equal(r.ok, true);
  assert.equal(cohort.seats, 2, 'the seat count must drop by exactly one');
});

test('a full class refuses and leaves the seat count alone @spec:AC-002', () => {
  const cohort = { id: 'aug', seats: 0 };
  const r = enrol({ cohort, applicant: { email: 'ana@example.com', age: 30 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'class full');
  assert.equal(cohort.seats, 0);
});

test('a minor without guardian data is blocked and consumes no seat @spec:AC-003', () => {
  const cohort = { id: 'aug', seats: 3 };
  const r = enrol({ cohort, applicant: { email: 'jo@example.com', age: 15 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'guardian required');
  assert.equal(cohort.seats, 3, 'a blocked minor must not consume a seat');
});

test('a minor WITH guardian data is accepted @spec:AC-003', () => {
  const cohort = { id: 'aug', seats: 3 };
  const r = enrol({
    cohort,
    applicant: { email: 'jo@example.com', age: 15, guardian: { email: 'mum@example.com' } },
  });
  assert.equal(r.ok, true);
  assert.equal(cohort.seats, 2);
});

test('a minor is blocked even when the class is full @principle:P-004', () => {
  // The guardian check must not be reachable only when seats exist: the reason
  // returned tells you which rule fired, and the legal one has to win.
  const cohort = { id: 'aug', seats: 0 };
  const r = enrol({ cohort, applicant: { email: 'jo@example.com', age: 15 } });
  assert.equal(r.reason, 'guardian required');
});
