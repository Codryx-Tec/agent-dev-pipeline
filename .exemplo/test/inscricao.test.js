// Each test's TITLE carries the acceptance criterion it proves. The title is
// what survives into every runner's reporter output, which is why the
// annotation goes there and not in a comment.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inscrever } from '../src/inscricao.js';

test('enrolment in a class with a free seat @spec:AC-001', () => {
  const turma = { id: 'ago', vagas: 3 };
  const r = inscrever({ turma, dados: { email: 'ana@example.com', idade: 30 } });
  assert.equal(r.ok, true);
  assert.equal(turma.vagas, 2, 'the seat count must drop by exactly one');
});

test('a full class refuses and leaves the seat count alone @spec:AC-002', () => {
  const turma = { id: 'ago', vagas: 0 };
  const r = inscrever({ turma, dados: { email: 'ana@example.com', idade: 30 } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'class full');
  assert.equal(turma.vagas, 0);
});

test('a minor without guardian data is blocked and consumes no seat @spec:AC-003', () => {
  const turma = { id: 'ago', vagas: 3 };
  const r = inscrever({ turma, dados: { email: 'jo@example.com', idade: 15 } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'guardian required');
  assert.equal(turma.vagas, 3, 'a blocked minor must not consume a seat');
});

test('a minor WITH guardian data is accepted @spec:AC-003', () => {
  const turma = { id: 'ago', vagas: 3 };
  const r = inscrever({
    turma,
    dados: { email: 'jo@example.com', idade: 15, responsavel: { email: 'mae@example.com' } },
  });
  assert.equal(r.ok, true);
  assert.equal(turma.vagas, 2);
});

test('a minor is blocked even when the class is full @principle:P-004', () => {
  // The guardian check must not be reachable only when seats exist: the reason
  // returned tells you which rule fired, and the legal one has to win.
  const turma = { id: 'ago', vagas: 0 };
  const r = inscrever({ turma, dados: { email: 'jo@example.com', idade: 15 } });
  assert.equal(r.motivo, 'guardian required');
});
