// Picking up where the last session stopped.
//
// THE PROBLEM THIS SOLVES. A session ends — cleared, closed, crashed. The next
// one starts with nothing and re-reads six documents to work out where the work
// stands. That re-reading is the single largest avoidable token cost in using
// this tool, and it produces an answer the engine already knows.
//
// THE DESIGN, which follows from the project's own doctrine (D-001): almost
// everything a new session needs is DERIVED, not stored. Which gate is red, what
// is unproven, which tasks are in flight, what the last verification said — all
// of that is computed from the documents and the proof records, so it cannot go
// stale and cannot disagree with reality.
//
// Exactly one thing cannot be derived: what the human and the agent were in the
// middle of, and why. Intent leaves no trace in a document. That single note is
// the only thing this module stores — everything else it recomputes.
//
// Losing the note therefore costs you a sentence, not a session.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { resolveStateDir, projectKey } from './trust.js';
import { evaluateGates } from './gates.js';

function notesPath(config) {
  return path.join(resolveStateDir(config), 'checkpoints.json');
}

function readNotes(config) {
  const p = notesPath(config);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Store the one thing that cannot be recomputed. */
export function saveCheckpoint(rootDir, config, { note, next } = {}) {
  const all = readNotes(config);
  all[projectKey(rootDir)] = {
    note: note ?? null,
    next: next ?? null,
    at: new Date().toISOString(),
  };
  const p = notesPath(config);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  return p;
}

export function readCheckpoint(rootDir, config) {
  return readNotes(config)[projectKey(rootDir)] ?? null;
}

export function clearCheckpoint(rootDir, config) {
  const all = readNotes(config);
  const had = projectKey(rootDir) in all;
  delete all[projectKey(rootDir)];
  const p = notesPath(config);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  return had;
}

/**
 * Everything a fresh session needs, derived from the repository.
 *
 * Kept deliberately small. A briefing that runs to three screens is one nobody
 * reads and one that costs what re-reading the documents would have cost.
 */
export function buildResume(project, config, audit) {
  const evaluation = evaluateGates(audit.findings);
  const firstRed = evaluation.gates.find((g) => g.state === 'red') ?? null;

  const inFlight = [];
  const unproven = [];
  let awaitingProof = 0;
  for (const feature of project.features ?? []) {
    const record = project.verification?.[feature.name] ?? null;

    for (const t of feature.tdd?.tasks ?? []) {
      // Only `em-andamento` is genuinely in flight. `em-teste` is a resting
      // state — implemented, awaiting proof — and on a mature project that is
      // most of the board. Listing all of it would cost a fresh session the
      // tokens this briefing exists to save, and tell it nothing it can act on.
      if (t.status === 'em-andamento') {
        inFlight.push({ id: t.id, title: t.title ?? '', status: t.status, feature: feature.name });
      }
      if (t.status === 'em-teste') awaitingProof++;
    }
    for (const ac of feature.prd?.acs ?? []) {
      if (record?.results?.[ac.id]?.status !== 'pass') {
        unproven.push({ id: ac.id, title: ac.title ?? '', feature: feature.name });
      }
    }
  }

  const openQuestions = [];
  for (const feature of project.features ?? []) {
    for (const q of feature.rfc?.questions ?? []) {
      if (q.status !== 'respondida') {
        openQuestions.push({ id: q.id, blocking: Boolean(q.blocking), text: (q.text ?? '').slice(0, 120) });
      }
    }
  }

  const lastVerify = (() => {
    let latest = null;
    for (const feature of project.features ?? []) {
      const r = project.verification?.[feature.name];
      if (r?.verifiedAt && (!latest || r.verifiedAt > latest.verifiedAt)) latest = r;
    }
    if (!latest) return null;
    const stale = latest.codeMtime != null && (project.codeMtime ?? 0) > latest.codeMtime;
    return { at: latest.verifiedAt, reporter: latest.reporter, stale };
  })();

  return {
    scope: project.scope?.status ?? null,
    gates: evaluation.gates.map((g) => ({ id: g.id, state: g.state })),
    firstRed: firstRed ? { id: firstRed.id, title: firstRed.title, findings: firstRed.findings.slice(0, 5) } : null,
    exitCode: evaluation.exitCode,
    inFlight,
    awaitingProof,
    unprovenCount: unproven.length,
    unproven: unproven.slice(0, 8),
    openQuestions,
    lastVerify,
    checkpoint: readCheckpoint(project.rootDir, config),
  };
}

/**
 * The briefing, as text.
 *
 * Written to be pasted into a fresh session — or read by an agent as its first
 * action — in place of opening PRD, RFC and TDD.
 */
export function renderResume(r) {
  const out = [];
  const marks = { green: '✔', red: '✘', blocked: '·' };

  out.push('# Where this project stands');
  out.push('');
  out.push(`scope : ${r.scope ?? 'MISSING'}`);
  out.push(`gates : ${r.gates.map((g) => `${marks[g.state]}${g.id}`).join('  ')}`);
  out.push(`audit : exit ${r.exitCode}${r.exitCode === 0 ? ' — every gate clean' : ''}`);

  if (r.lastVerify) {
    out.push(
      `proof : last verified ${r.lastVerify.at}${r.lastVerify.stale ? '  ⚠ STALE — code moved since' : ''}`
    );
  } else {
    out.push('proof : never verified — run `adp verify`');
  }
  if (r.unprovenCount) out.push(`        ${r.unprovenCount} criteri${r.unprovenCount === 1 ? 'on' : 'a'} still unproven`);

  if (r.checkpoint?.note) {
    out.push('');
    out.push('## What the last session was doing');
    out.push('');
    out.push(r.checkpoint.note);
    if (r.checkpoint.next) {
      out.push('');
      out.push(`Intended next: ${r.checkpoint.next}`);
    }
    out.push('');
    out.push(`_(noted ${r.checkpoint.at} — this is the only part not recomputed,`);
    out.push('and therefore the only part that can be out of date)_');
  }

  if (r.inFlight.length) {
    out.push('');
    out.push('## In flight — picked up and not finished');
    out.push('');
    for (const t of r.inFlight) out.push(`- ${t.id} ${t.title}`);
  }
  if (r.awaitingProof) {
    out.push('');
    out.push(
      `${r.awaitingProof} task(s) sit at [em-teste] — implemented, awaiting proof. ` +
        'That is a resting state, not a queue.'
    );
  }

  if (r.firstRed) {
    out.push('');
    out.push(`## First red gate: ${r.firstRed.id} — ${r.firstRed.title}`);
    out.push('');
    for (const f of r.firstRed.findings) {
      out.push(`- ${f.code}: ${f.message}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}`);
    }
    out.push('');
    out.push('Everything after this gate reads `blocked`, not broken. Fix this one first.');
  }

  const blocking = r.openQuestions.filter((q) => q.blocking);
  if (blocking.length) {
    out.push('');
    out.push('## Blocking questions — these need the human');
    out.push('');
    for (const q of blocking) out.push(`- ${q.id}: ${q.text}`);
  }

  out.push('');
  out.push('## Next');
  out.push('');
  out.push(nextAction(r));
  return out.join('\n');
}

/** One sentence, derived. The point is that nobody has to work it out. */
function nextAction(r) {
  if (r.scope !== 'Approved') return 'Get `.spec/SCOPE.md` approved — nothing downstream is evaluated until G0 opens.';
  if (r.firstRed) return `Fix the findings under ${r.firstRed.id}, then run \`adp audit\`.`;
  if (r.lastVerify?.stale) return 'Code moved since the last proof — run `adp verify` again.';
  if (!r.lastVerify) return 'Run `adp verify` to turn passing tests into recorded proof.';
  if (r.inFlight.length) return `Continue ${r.inFlight[0].id} (${r.inFlight[0].title}) — it was picked up and left unfinished.`;
  return 'Every gate is clean. Pick the next task from `TDD.md`, or specify a new feature with `adp new`.';
}
