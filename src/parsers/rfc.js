// RFC parser — owns D-xxx (decisions), ASM-xxx (assumptions) and Q-xxx
// (open questions).
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
//
// Assumptions and questions are read from bullets OR from a table, because
// dialect B tabulates them.

import { lineOf, blocksBetween, stripCode, fold } from '../util/text.js';

const RE_DECISION = /^###\s+(D-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_ITEM = /^\s*[-*]\s*\*\*((?:ASM|Q)-\d+)\*\*/gm;
const RE_NUMBERED = /^\s*\d+\.\s+/gm;
const RE_DECIDED = /\*\*Decision:/;
const RE_STATUS_IN = /status:\s*([a-zà-ú-]+)/i;

// dialect B
const RE_OPTIONS_SECTION = /^##\s+(?:Options Considered|Op[çc][õo]es Consideradas)\s*$/m;
const RE_OPTION = /^###\s+(?:Option|Op[çc][ãa]o)\s+(\d+)\s*[:.]?\s*(.+?)\s*$/gm;
const RE_OUTCOME_SECTION = /^##\s+(?:Outcome|Resultado)\s*$/m;
const RE_OUTCOME_DECISION = /^\*\*(?:Decision|Decis[ãa]o)\*\*\s*:\s*(.+)$/m;
const RE_RECOMMENDED = /⭐|\*\*(?:Recommended|Recomendado|Recomendada)\*\*\s*:/;
// table rows: | ASM-001 | text | ... |   or   | 1 | text | ... |
const RE_TABLE_ROW = /^\|\s*((?:ASM|Q)-\d+|\d+)\s*\|([^|]*)\|(.*)$/gm;

export const ASM_STATUSES = ['aberta', 'confirmada', 'invalidada'];
export const Q_STATUSES = ['aberta', 'respondida'];

const SECTIONS = {
  assumptions: /^##\s+(?:Assumptions|Suposi[çc][õo]es|Premissas)\s*$/m,
  questions: /^##\s+(?:Open questions|Open Questions|Perguntas em aberto|Quest[õo]es em aberto)\s*$/m,
};

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

function parseTableItems(scan, content, file, sectionRe, kind) {
  const at = scan.search(sectionRe);
  if (at === -1) return { items: [], uncoded: 0 };
  // the section runs to the next `## ` heading
  const rest = scan.slice(at + 1);
  const nextHeading = rest.search(/^##\s+/m);
  const body = nextHeading === -1 ? scan.slice(at) : scan.slice(at, at + 1 + nextHeading);

  const items = [];
  let uncoded = 0;
  for (const m of body.matchAll(RE_TABLE_ROW)) {
    const id = m[1];
    const text = m[2].trim();
    if (!text || /^-+$/.test(text) || /^(assumption|suposi|question|pergunta)/i.test(text)) continue;
    if (/^\d+$/.test(id)) {
      uncoded++;
      continue;
    }
    const tail = `${m[2]}|${m[3]}`;
    const raw = tail.match(RE_STATUS_IN)?.[1] ?? null;
    items.push({
      id,
      kind,
      file,
      line: lineOf(content, at + m.index),
      // Dialect B tabulates a Confidence column instead of a status. Confidence
      // is not status — "High confidence" does not mean "confirmed" — so it is
      // reported as missing rather than silently mapped onto one.
      status: raw ? fold(raw) : null,
      blocking: /\*\*blocking\*\*|\*\*bloqueante\*\*/i.test(tail),
      text,
      fromTable: true,
    });
  }
  return { items, uncoded };
}

export function parseRfc(content, file) {
  const scan = stripCode(content);

  const decisions = parseNativeDecisions(scan, content, file);
  const optionsDecision = parseOptionsDecision(scan, content, file);
  if (optionsDecision) decisions.push(optionsDecision);

  const bulletItems = blocksBetween(scan, [...scan.matchAll(RE_ITEM)]).map(({ match, body }) => {
    const raw = body.match(RE_STATUS_IN)?.[1] ?? null;
    return {
      id: match[1],
      kind: match[1].startsWith('ASM') ? 'assumption' : 'question',
      file,
      line: lineOf(content, match.index),
      status: raw ? fold(raw) : null,
      blocking: /\*\*blocking\*\*|\*\*bloqueante\*\*/i.test(body),
      text: body.split('\n')[0].trim(),
      fromTable: false,
    };
  });

  const asmTable = parseTableItems(scan, content, file, SECTIONS.assumptions, 'assumption');
  const qTable = parseTableItems(scan, content, file, SECTIONS.questions, 'question');

  const byId = new Map();
  for (const item of [...bulletItems, ...asmTable.items, ...qTable.items]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const items = [...byId.values()];

  return {
    kind: 'rfc',
    file,
    dialect: optionsDecision ? (decisions.length > 1 ? 'mixed' : 'create-rfc') : 'native',
    decisions,
    assumptions: items.filter((i) => i.kind === 'assumption'),
    questions: items.filter((i) => i.kind === 'question'),
    // Rows carrying a bare number instead of a traceability code: the assumption
    // is written down, but it cannot be referenced, tracked or closed.
    uncodedAssumptions: asmTable.uncoded,
    uncodedQuestions: qTable.uncoded,
    hasAssumptionsSection: SECTIONS.assumptions.test(scan),
    hasQuestionsSection: SECTIONS.questions.test(scan),
    hasOutcomeSection: RE_OUTCOME_SECTION.test(scan),
  };
}
