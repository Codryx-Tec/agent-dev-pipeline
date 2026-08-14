// BASELINE.md parser — the read-only half of brownfield adoption
// (SCOPE-0.6.0.md PRD-002, M4-readonly-core).
//
// Written once by `adp init --brownfield`: the commit and the set of
// pre-existing source files at adoption time. Plain prose plus one bullet
// list per file — mirrors backlog.js's own simple, no-nested-grammar shape,
// since this document exists to be read by a human archaeologist as much
// as by the engine.

import { lineOf } from '../util/text.js';

const RE_COMMIT = /^>\s*commit:\s*(.+)$/m;
const RE_GENERATED = /^>\s*generated:\s*(.+)$/m;
const RE_FILE_LINE = /^-\s+(.+)$/gm;

export function parseBaseline(content, file) {
  const commitRaw = content.match(RE_COMMIT)?.[1]?.trim() ?? null;
  const generatedAt = content.match(RE_GENERATED)?.[1]?.trim() ?? null;
  const files = [...content.matchAll(RE_FILE_LINE)].map((m) => ({
    path: m[1].trim(),
    line: lineOf(content, m.index),
  }));

  return {
    kind: 'baseline',
    file,
    commit: commitRaw && commitRaw !== 'none' ? commitRaw : null,
    generatedAt,
    files,
  };
}

export function renderBaselineMd({ commit, generatedAt, files }) {
  return [
    '# Baseline — pre-existing files at brownfield adoption',
    '',
    `> generated: ${generatedAt}`,
    `> commit: ${commit ?? 'none'}`,
    '',
    'Files present when `adp init --brownfield` ran, before this tool\'s own',
    'document chain existed. A finding tied to one of these files stays a',
    '**warning** — it never escalates under `--ci` — for as long as the file',
    'is untouched since the commit above. The moment it is touched again, or',
    'a task maps it, it owes the same full-strength check as any new file.',
    '',
    'This list only ever shrinks. Adding a removed entry back is meant to be',
    'an error (`BASELINE_WIDENED`) — not built yet; see `.spec/BACKLOG.md`.',
    '',
    ...files.map((f) => `- ${f}`),
    '',
  ].join('\n');
}
