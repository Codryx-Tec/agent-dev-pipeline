// Rendering. PRD AC-024: a finding shows its human-readable name FIRST and the
// stable code in parentheses, so a reader who does not know the catalogue still
// understands, and a pipeline that greps for the code still works.

import { label, GATES } from './gates.js';
import { renderPrompt } from './prompts.js';

const MARK = { green: '✔', red: '✘', blocked: '·' };

function line(f) {
  const where = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
  const sev = f.severity === 'error' ? 'ERROR  ' : 'WARN   ';
  return `${sev}${label(f.code)} (${f.code}) — ${f.message}${where}`;
}

export function renderGates(evaluation) {
  const out = [];
  for (const g of evaluation.gates) {
    const detail =
      g.state === 'blocked'
        ? `blocked by ${g.blockedBy}`
        : g.state === 'red'
          ? `${g.errors} error(s)${g.warnings ? `, ${g.warnings} warning(s)` : ''}`
          : g.warnings
            ? `clean (${g.warnings} warning(s))`
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
  const shown = focus ? focus.findings : audit.findings.filter((f) => f.severity === 'warning');

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
  out.push(
    evaluation.exitCode === 0
      ? `✔ all gates clean (${audit.warnings} warning(s))`
      : `✘ ${audit.errors} error(s), ${audit.warnings} warning(s) — first red gate: ${evaluation.firstRed}`
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
      exitCode: evaluation.exitCode,
      firstRed: evaluation.firstRed,
      gates: evaluation.gates.map((g) => ({
        id: g.id, title: g.title, state: g.state, blockedBy: g.blockedBy,
        errors: g.errors, warnings: g.warnings,
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
