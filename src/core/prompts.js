// Red gate → the exact sentence to send back to the AI.
//
// This lives in core rather than in the CLI so that the terminal, `--json` and
// anything else emit the SAME text. A prompt that differs by surface is a second
// truth, and the whole tool is an argument against those.
//
// Two properties are load-bearing and easy to lose in a rewrite.
//
// Only ERRORS become a prompt. Warnings are things to know, not things to fix
// right now, and a prompt padded with them buries the one action that matters.
//
// And the list is truncated. Forty findings of the same code teach the agent
// nothing that twelve do not, and a prompt nobody can read is a prompt nobody
// pastes.
//
// `label()` comes from gates.js, which owns the code→name map. Stable codes are
// never localised; the readable name sits beside the code, never instead of it.

import { label } from './gates.js';

const ATTEMPT_CAP = 3;
const MAX_PER_CODE = 12;

export function buildPrompt(gate) {
  if (!gate) return null;

  const errors = (gate.findings ?? []).filter((f) => (f.severity ?? 'error') === 'error');
  if (!errors.length) return null;

  const byCode = new Map();
  for (const f of errors) {
    if (!byCode.has(f.code)) byCode.set(f.code, []);
    byCode.get(f.code).push(f);
  }

  const lines = [
    `Gate ${gate.id} (${gate.title}) is red. Fix these findings, then re-run the audit:`,
    '',
  ];
  for (const [code, list] of byCode) {
    lines.push(`- ${label(code)} (${code}):`);
    for (const f of list.slice(0, MAX_PER_CODE)) {
      lines.push(`    · ${f.message}${f.file ? ` — ${f.file}${f.line ? `:${f.line}` : ''}` : ''}`);
    }
    if (list.length > MAX_PER_CODE) lines.push(`    · and ${list.length - MAX_PER_CODE} more`);
  }
  lines.push('');
  lines.push('Do not weaken, skip or delete a test to make this pass. If the same finding');
  lines.push(`survives ${ATTEMPT_CAP} attempts, stop and report it instead of iterating further.`);
  return lines.join('\n');
}

/** The name the CLI has always used. One implementation, two names, no drift. */
export const renderPrompt = buildPrompt;

export { ATTEMPT_CAP, MAX_PER_CODE };
