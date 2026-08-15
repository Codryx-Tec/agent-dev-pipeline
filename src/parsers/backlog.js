// Backlog parser — what fell outside the MVP boundary (SCOPE-0.6.0.md §2.2).
//
// Backlog items are prose, deliberately without a tracking code: "só ao ser
// promovido a PRD é que o item ganha códigos." Optional, project-wide, one
// file — mirrors constitution.js's shape for a document that is not
// per-feature and not required to exist.
//
// An item that already carries a token shaped like one of the engine's real
// code families (US-xxx, AC-xxx, T-xxx, ASM-xxx, Q-xxx, D-xxx) is flagged by
// audit.js as BACKLOG_ITEM_WITH_CODE — the loophole this document must not
// become is a "backlog" item that already claims to be a proven criterion.

import { lineOf, stripNonGrammar } from '../util/text.js';

const RE_ITEM = /^[ \t]*(?:[-*]|\d+[.)])[ \t]+(.+)$/gm;
const RE_TRACKING_CODE = /\b(US|AC|T|ASM|Q|D)-\d+\b/;

export function parseBacklog(content, file) {
  if (content == null) return { kind: 'backlog', file, items: [], present: false };
  const scan = stripNonGrammar(content);

  const items = [...scan.matchAll(RE_ITEM)].map((m) => {
    const rawLine = content.slice(m.index, m.index + m[0].length);
    const code = rawLine.match(RE_TRACKING_CODE);
    return {
      text: m[1].trim(),
      file,
      line: lineOf(content, m.index),
      taggedCode: code ? code[0] : null,
    };
  });

  return { kind: 'backlog', file, items, present: true };
}
