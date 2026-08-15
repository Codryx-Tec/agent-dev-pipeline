// Rendering. PRD AC-024: a finding shows its human-readable name FIRST and the
// stable code in parentheses, so a reader who does not know the catalogue still
// understands, and a pipeline that greps for the code still works.

import { label, GATES } from './gates.js';
import { renderPrompt } from './prompts.js';

const MARK = { green: '✔', red: '✘', blocked: '·', 'n/a': '○' };

function line(f) {
  const where = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
  // A deferred finding keeps its original severity (JSON, audits elsewhere)
  // but is never blocking — its own marker says so instead of borrowing
  // ERROR/WARN, which would claim more or less than is true.
  const sev = f.deferred ? 'DEFER  ' : f.severity === 'error' ? 'ERROR  ' : 'WARN   ';
  const suffix = f.deferred ? ` (deferred by ${f.deferredBy})` : '';
  return `${sev}${label(f.code)} (${f.code}) — ${f.message}${where}${suffix}`;
}

// M5b: "a contagem ativa é sempre impressa, ao lado do verde e do vermelho"
// (§12.1) — deferred debt is a suffix on every state, never a silent count.
function deferredSuffix(g) {
  return g.deferred ? `, ${g.deferred} deferred` : '';
}

export function renderGates(evaluation) {
  const out = [];
  for (const g of evaluation.gates) {
    const detail =
      g.state === 'blocked'
        ? `blocked by ${g.blockedBy}`
        : g.state === 'n/a'
          ? `n/a — ${g.reason}`
          : g.state === 'red'
            ? `${g.errors} error(s)${g.warnings ? `, ${g.warnings} warning(s)` : ''}${deferredSuffix(g)}`
            : g.warnings || g.deferred
              ? `clean (${g.warnings} warning(s)${deferredSuffix(g)})`
              : 'clean';
    out.push(`  ${MARK[g.state]} ${g.id} ${g.title.padEnd(26)} ${detail}`);
  }
  return out.join('\n');
}

export { renderPrompt };

export function renderTerminal(audit, evaluation) {
  const out = [];

  // Only the first red gate's findings are shown by default. Printing all of
  // them for a project whose PRD is not written yet buries the one thing the
  // user should do next under dozens of its own consequences.
  const focus = evaluation.gates.find((g) => g.state === 'red');
  const shown = focus ? focus.findings : audit.findings.filter((f) => f.severity === 'warning' || f.deferred);

  if (shown.length) {
    out.push(focus ? `${focus.id} — ${focus.question}` : 'warnings');
    out.push('');
    for (const f of shown) out.push(line(f));
    out.push('');
  }

  out.push('gates:');
  out.push(renderGates(evaluation));
  out.push('');

  const s = audit.summary;
  out.push(
    `summary: ${s.features} feature(s) · ${s.stories} story(ies) · ${s.criteria} criteria · ` +
      `${s.withTest}/${s.criteria} with a test · ${s.tasks} task(s) · ${s.principles} principle(s)`
  );
  const deferredSummary = audit.deferredCount ? `, ${audit.deferredCount} deferred` : '';
  out.push(
    evaluation.exitCode === 0
      ? `✔ all gates clean (${audit.warnings} warning(s)${deferredSummary})`
      : `✘ ${audit.errors} error(s), ${audit.warnings} warning(s)${deferredSummary} — first red gate: ${evaluation.firstRed}`
  );

  if (focus) {
    out.push('');
    out.push('back to the AI — paste this:');
    out.push('');
    out.push(renderPrompt(focus));
  }
  return out.join('\n');
}

// The "Volte para a IA para continuar" text. It lives in core, not in the page,
// so the CLI prints exactly what the browser copies.
export function renderJson(audit, evaluation) {
  return JSON.stringify(
    {
      summary: audit.summary,
      errors: audit.errors,
      warnings: audit.warnings,
      deferred: audit.deferredCount,
      exitCode: evaluation.exitCode,
      firstRed: evaluation.firstRed,
      gates: evaluation.gates.map((g) => ({
        id: g.id, title: g.title, state: g.state, blockedBy: g.blockedBy, reason: g.reason,
        errors: g.errors, warnings: g.warnings, deferred: g.deferred,
      })),
      findings: audit.findings.map((f) => ({ ...f, label: label(f.code), gate: gateIdOf(f.code) })),
    },
    null,
    2
  );
}

function gateIdOf(code) {
  return GATES.find((g) => g.codes.includes(code))?.id ?? null;
}
