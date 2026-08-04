// Small text helpers shared by the parsers. No I/O.

export const DASH = '—';

// Line number (1-based) of a character offset. Parsers report file+line for
// every element, so every finding can point at something the user can open.
export function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// Accent- and case-insensitive fold, used to compare status tokens written by
// humans (`Concluída`, `concluida`, `CONCLUIDA`) against the canonical form.
// The canonical token itself is never rewritten — AGENTS.md forbids translating
// engine tokens, and normalising for comparison is not translating.
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Split a comma-separated list, keeping spaces inside items (file paths may
// contain them) and dropping empties.
export function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Strip inline code spans and fenced blocks before scanning for structural
// markers. A heading shown inside backticks is documentation about the
// grammar, not an element of it — the bug this whole helper exists to prevent.
export function stripCode(content) {
  return content
    .replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length));
}

// Same bug, other syntax. Every scaffolded document opens with an HTML comment
// showing the grammar — `- **Q-001** — text ... add **blocking**` and friends —
// and those examples were being parsed as real elements. A project created by
// `adp new` failed G2 on a blocking question that existed only inside the
// instructions telling you how to write one.
export function stripComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '));
}

// What the parsers actually want: the document with everything that merely
// *describes* the grammar blanked out, and every offset preserved so findings
// still point at the right line.
export function stripNonGrammar(content) {
  return stripComments(stripCode(content));
}

// Blocks between consecutive anchors: [{ ...match, body }] where body runs from
// the end of one anchor to the start of the next (or end of file).
export function blocksBetween(content, matches) {
  return matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    return { match: m, start, end, body: content.slice(start, end) };
  });
}
