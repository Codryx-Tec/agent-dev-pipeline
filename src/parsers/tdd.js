// TDD parser — owns T-xxx (tasks).
//
// Grammar:
//   ## T-001 — Title [pendente|em-andamento|em-teste|concluida]
//   - Refs: US-001, AC-001
//   - Arquivos: path/one.js, path/two.js
//
// Two properties are deliberate, and both are the fixes for real bugs found in
// Projeto_Agent's original audit.js:
//
//   1. The heading regex is LINE-ANCHORED and runs over a code-stripped copy.
//      An unanchored split on "## T-" also matches that text inside prose or a
//      code span, inventing a phantom task.
//   2. Status is read from the HEADING LINE. Reading it by searching the task's
//      block for a status token makes the last task inherit any status word
//      that appears in later prose, because its block runs to end of file.

import { lineOf, blocksBetween, stripCode, fold, splitList } from '../util/text.js';

export const TASK_STATUSES = ['pendente', 'em-andamento', 'em-teste', 'concluida'];

// Any `## T-xxx —` heading, with or without a valid status. Matching the loose
// form first is what lets a heading with a bad status be REPORTED rather than
// silently skipped — skipping it would hide the task from the audit while
// leaving it visible to humans.
const RE_TASK_LOOSE = /^##\s+(T-\d+)\s*[—–-]\s*(.*)$/gm;
const RE_STATUS_TAIL = /\[([^\]]+)\]\s*$/;
const RE_REFS = /^\s*[-*]\s*Refs?:\s*(.+)$/m;
const RE_FILES = /^\s*[-*]\s*(?:Arquivos|Files):\s*(.+)$/m;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

export function parseTdd(content, file) {
  const scan = stripCode(content);
  const matches = [...scan.matchAll(RE_TASK_LOOSE)];

  const tasks = blocksBetween(scan, matches).map(({ match, body }) => {
    const tail = match[2].match(RE_STATUS_TAIL);
    const rawStatus = tail ? tail[1] : null;
    const status = rawStatus ? fold(rawStatus) : null;
    const title = tail ? match[2].slice(0, tail.index).trim() : match[2].trim();

    const refs = splitList(body.match(RE_REFS)?.[1] ?? '');
    const files = splitList(body.match(RE_FILES)?.[1] ?? '');

    return {
      id: match[1],
      title,
      file,
      line: lineOf(content, match.index),
      index: match.index,
      rawStatus,
      status: TASK_STATUSES.includes(status) ? status : null,
      statusValid: TASK_STATUSES.includes(status),
      refs,
      files,
    };
  });

  return {
    kind: 'tdd',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    tasks,
  };
}
