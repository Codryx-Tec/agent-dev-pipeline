// RFC parser — owns D-xxx (decisions).
//
// ASM-xxx (assumptions) and Q-xxx (open questions) moved to SPEC.md in
// 0.6.0 (see spec.js) — they are owned by the layer the machine confers, not
// by the document that argues for a path. RFC.md keeps exactly the part that
// makes it a decision record: was more than one path weighed, and was one of
// them actually chosen.
//
// TWO DIALECTS, because two tools write this document and neither should be
// forced to imitate the other.
//
// Dialect A — native, what `adp new` scaffolds:
//   ### D-001 — Title
//     **Alternatives considered**
//     1. *Name.* ...
//     2. *Name.* ...
//     **Decision: alternative 2 — name.**
//
// Dialect B — what the `create-rfc` skill produces (Tech Leads Club):
//   ## Options Considered
//   ### Option 1: Name ⭐ (Recommended)
//   ### Option 2: Name
//   ## Outcome
//   **Decision**: Option 1 was chosen
//
// The engine cares about the same thing in both: were at least two paths
// weighed, and was one of them actually chosen. Everything else is house style.

import { lineOf, blocksBetween, stripNonGrammar } from '../util/text.js';

const RE_DECISION = /^###\s+(D-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_NUMBERED = /^\s*\d+\.\s+/gm;
const RE_DECIDED = /\*\*Decision:/;

// dialect B
const RE_OPTIONS_SECTION = /^##\s+(?:Options Considered|Op[çc][õo]es Consideradas)\s*$/m;
const RE_OPTION = /^###\s+(?:Option|Op[çc][ãa]o)\s+(\d+)\s*[:.]?\s*(.+?)\s*$/gm;
const RE_OUTCOME_SECTION = /^##\s+(?:Outcome|Resultado)\s*$/m;
const RE_OUTCOME_DECISION = /^\*\*(?:Decision|Decis[ãa]o)\*\*\s*:\s*(.+)$/m;
const RE_RECOMMENDED = /⭐|\*\*(?:Recommended|Recomendado|Recomendada)\*\*\s*:/;

function parseNativeDecisions(scan, content, file) {
  return blocksBetween(scan, [...scan.matchAll(RE_DECISION)]).map(({ match, body }) => {
    // Only the numbered list that follows the "Alternatives" marker counts.
    // Counting every numbered list in the block would let an unrelated list of
    // steps satisfy the rule.
    const altStart = body.search(/\*\*Alternatives considered\*\*|\*\*Alternativas consideradas\*\*/);
    const decidedAt = body.search(RE_DECIDED);
    const altRegion =
      altStart === -1 ? '' : body.slice(altStart, decidedAt === -1 ? body.length : decidedAt);
    return {
      id: match[1],
      title: match[2],
      dialect: 'native',
      file,
      line: lineOf(content, match.index),
      alternatives: (altRegion.match(RE_NUMBERED) || []).length,
      decided: RE_DECIDED.test(body),
    };
  });
}

// Dialect B carries no D-xxx codes: the whole document IS one decision. It is
// reported under the synthetic code D-000 so a finding has something to point
// at, and so a document mixing both dialects does not collide.
function parseOptionsDecision(scan, content, file) {
  const optionsAt = scan.search(RE_OPTIONS_SECTION);
  if (optionsAt === -1) return null;

  const options = [...scan.slice(optionsAt).matchAll(RE_OPTION)];
  const outcomeAt = scan.search(RE_OUTCOME_SECTION);
  const outcomeBody = outcomeAt === -1 ? '' : scan.slice(outcomeAt);
  const outcomeLine = outcomeBody.match(RE_OUTCOME_DECISION)?.[1]?.trim() ?? null;

  // A placeholder Outcome is not a decision. The upstream template ships that
  // line as "[Option X was chosen / RFC was rejected / deferred]", and
  // accepting it would mean every freshly generated RFC passes the gate having
  // decided precisely nothing.
  const outcomeReal = Boolean(outcomeLine) && !/^\[.*\]$/.test(outcomeLine);
  const recommended = RE_RECOMMENDED.test(scan.slice(optionsAt));

  return {
    id: 'D-000',
    title: 'Options Considered',
    dialect: 'create-rfc',
    file,
    line: lineOf(content, optionsAt),
    alternatives: options.length,
    decided: outcomeReal || recommended,
    outcome: outcomeLine,
    outcomeRecorded: outcomeReal,
  };
}

export function parseRfc(content, file) {
  const scan = stripNonGrammar(content);

  const decisions = parseNativeDecisions(scan, content, file);
  const optionsDecision = parseOptionsDecision(scan, content, file);
  if (optionsDecision) decisions.push(optionsDecision);

  return {
    kind: 'rfc',
    file,
    dialect: optionsDecision ? (decisions.length > 1 ? 'mixed' : 'create-rfc') : 'native',
    decisions,
    hasOutcomeSection: RE_OUTCOME_SECTION.test(scan),
  };
}
