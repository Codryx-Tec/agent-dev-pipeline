// TDD parser — owns T-xxx (tasks).
//
// Grammar:
//   ## T-001 — Title [pendente|em-andamento|em-teste|concluida]
//   - Refs: US-001, AC-001
//   - Arquivos: path/one.js, path/two.js
//   - Lê: path/three.js
//   - Depende: T-000
//
// `Arquivos:` and `Lê:` are different claims and the planner treats them as
// such. `Arquivos:` is what the task WRITES, and two tasks writing the same file
// can never run at the same time. `Lê:` is what it merely reads, which costs
// nothing in parallelism because every lane has its own worktree — two readers
// of the same file do not collide. Before the distinction existed there was only
// `Arquivos:`, so declaring a file you needed to read forfeited the parallelism
// of everyone who wrote it.
//
// `Depende:` is ordering, and it exists because reading a file is not the same
// as needing another task's version of it. A lane's worktree is branched from
// HEAD, so a task that reads `src/a.js` sees the pre-run version unless it
// declares that it runs after whoever writes it.
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

import { lineOf, blocksBetween, stripNonGrammar, fold, splitList } from '../util/text.js';

export const TASK_STATUSES = ['pendente', 'em-andamento', 'em-teste', 'concluida'];

// Any `## T-xxx —` heading, with or without a valid status. Matching the loose
// form first is what lets a heading with a bad status be REPORTED rather than
// silently skipped — skipping it would hide the task from the audit while
// leaving it visible to humans.
const RE_TASK_LOOSE = /^##\s+(T-\d+)\s*[—–-]\s*(.*)$/gm;
const RE_STATUS_TAIL = /\[([^\]]+)\]\s*$/;
const RE_REFS = /^\s*[-*]\s*Refs?:\s*(.+)$/m;
const RE_FILES = /^\s*[-*]\s*(?:Arquivos|Files):\s*(.+)$/m;
const RE_READS = /^\s*[-*]\s*(?:L[êe]|Reads?):\s*(.+)$/im;
const RE_DEPENDS = /^\s*[-*]\s*(?:Depende(?:\s+de)?|Depends?(?:\s+on)?):\s*(.+)$/im;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

export function parseTdd(content, file) {
  const scan = stripNonGrammar(content);
  const matches = [...scan.matchAll(RE_TASK_LOOSE)];

  const tasks = blocksBetween(scan, matches).map(({ match, body }) => {
    const tail = match[2].match(RE_STATUS_TAIL);
    const rawStatus = tail ? tail[1] : null;
    const status = rawStatus ? fold(rawStatus) : null;
    const title = tail ? match[2].slice(0, tail.index).trim() : match[2].trim();

    const refs = splitList(body.match(RE_REFS)?.[1] ?? '');
    const files = splitList(body.match(RE_FILES)?.[1] ?? '');
    const reads = splitList(body.match(RE_READS)?.[1] ?? '');
    // Upper-cased because ids are compared, not displayed: a `Depende: t-001`
    // that silently matched nothing would drop an ordering constraint, and a
    // dropped constraint is invisible until the run produces the wrong result.
    const dependsOn = splitList(body.match(RE_DEPENDS)?.[1] ?? '').map((id) => id.toUpperCase());

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
      reads,
      dependsOn,
    };
  });

  return {
    kind: 'tdd',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    tasks,
  };
}
