// PRD parser — owns US-xxx (stories) and AC-xxx (acceptance criteria).
//
// Grammar:
//   ### US-001 — Title
//   #### AC-001 — Title
//   - **Given** ... / - **When** ... / - **Then** ...
//
// Every structural regex is LINE-ANCHORED and runs over a code-stripped copy of
// the document. A heading shown inside backticks is documentation about the
// grammar, not an element of it.

import { lineOf, blocksBetween, stripNonGrammar } from '../util/text.js';

// Both languages are accepted: Projeto_Agent's documents already mix them, and
// rejecting one would make the migration a rewrite.
const CLAUSES = {
  given: /^\s*[-*]\s*\*\*(Given|Dado)\*\*/m,
  when: /^\s*[-*]\s*\*\*(When|Quando)\*\*/m,
  then: /^\s*[-*]\s*\*\*(Then|Ent[ãa]o)\*\*/m,
};

const RE_STORY = /^###\s+(US-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_AC = /^####\s+(AC-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_STATUS = /^>\s*status:\s*(\S+)/m;
const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

export const SPEC_STATUSES = [
  'draft',
  'ready',
  'in-implementation',
  'implemented',
  'audited',
];

export function parsePrd(content, file) {
  const scan = stripNonGrammar(content);

  const storyMatches = [...scan.matchAll(RE_STORY)];
  const acMatches = [...scan.matchAll(RE_AC)];

  const acs = acMatches.map((m) => {
    const id = m[1];
    const index = m.index;
    const start = index + m[0].length;
    // the criterion body runs to the next criterion OR the next story,
    // whichever comes first — otherwise the last criterion of a story would
    // swallow the next story's prose
    const nextAc = acMatches.find((x) => x.index > index)?.index ?? Infinity;
    const nextUs = storyMatches.find((x) => x.index > index)?.index ?? Infinity;
    const body = content.slice(start, Math.min(nextAc, nextUs, content.length));
    const missing = Object.entries(CLAUSES)
      .filter(([, re]) => !re.test(body))
      .map(([name]) => name);
    return {
      id,
      title: m[2],
      file,
      line: lineOf(content, index),
      index,
      body,
      missingClauses: missing,
      complete: missing.length === 0,
    };
  });

  const stories = blocksBetween(scan, storyMatches).map(({ match, start, end }) => ({
    id: match[1],
    title: match[2],
    file,
    line: lineOf(content, match.index),
    index: match.index,
    acs: acs.filter((ac) => ac.index > start && ac.index < end),
  }));

  // A criterion that sits before the first story belongs to no story. It is not
  // an error the parser decides on — audit.js reports it as AC_OUTSIDE_US.
  const firstStoryIndex = storyMatches.length ? storyMatches[0].index : Infinity;
  const orphanAcs = acs.filter((ac) => ac.index < firstStoryIndex);

  return {
    kind: 'prd',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    status: content.match(RE_STATUS)?.[1] ?? null,
    stories,
    acs,
    orphanAcs,
  };
}

export function allAcs(prd) {
  return prd ? prd.acs : [];
}
