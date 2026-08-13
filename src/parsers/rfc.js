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
//
// Two more things get checked per decision (M3b, antipatterns #1 and #3):
// whether any alternative considers not doing this at all (`hasDoNothing`,
// checked in both dialects — a name is all it takes), and whether a
// "favorite" option's Cons are real while another option's are missing or
// disproportionately thin (`strawOptions`, dialect B only — dialect A has no
// Pros/Cons structure to weigh in the first place).

import { lineOf, blocksBetween, stripNonGrammar } from '../util/text.js';

const RE_DECISION = /^###\s+(D-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_NUMBERED = /^\s*\d+\.\s+/gm;
const RE_DECIDED = /\*\*Decision:/;

// M3b, antipattern #2: "our process has some problems" proves nothing;
// "support tickets take 20 minutes" does. At least one measurable figure —
// a count, a duration, a currency, a percentage — somewhere in the prose
// BEFORE the first decision is what CONTEXT_WITHOUT_NUMBERS checks for.
const RE_NUMERIC_CONTEXT =
  /\d[\d.,]*\s*(ms|s|sec(?:onds?)?|segundos?|min(?:s|utos?|utes?)?|h(?:ours?|oras?)?|dias?|days?|semanas?|weeks?|meses?|months?|anos?|years?|%|r\$|us\$|\$|usu[áa]rios?|users?|clientes?|customers?|requests?|reqs?|rps|linhas?|lines?|registros?|records?|pedidos?|orders?|vendas?|sales?|vagas?|seats?|itens?|items?|casos?|cases?|decis(?:[ãa]o|[õo]es|ions?)|linha|pf|pontos? de fun[çc][ãa]o|vezes?|times?)\b/i;

// dialect B
const RE_OPTIONS_SECTION = /^##\s+(?:Options Considered|Op[çc][õo]es Consideradas)\s*$/m;
const RE_OPTION = /^###\s+(?:Option|Op[çc][ãa]o)\s+(\d+)\s*[:.]?\s*(.+?)\s*$/gm;
const RE_OUTCOME_SECTION = /^##\s+(?:Outcome|Resultado)\s*$/m;
const RE_OUTCOME_DECISION = /^\*\*(?:Decision|Decis[ãa]o)\*\*\s*:\s*(.+)$/m;
const RE_RECOMMENDED = /⭐|\*\*(?:Recommended|Recomendado|Recomendada)\*\*\s*:/;

// M3b, antipattern #3: no option ever considers not doing this at all — the
// name match works across both dialects, since a name exists either way even
// though only dialect B has a Pros/Cons structure to weigh (below).
const RE_DO_NOTHING_NAME = /\bdo nothing\b|\bn[ãa]o fazer nada\b|\bstatus quo\b|\bmanter como est[áa]\b/i;
// Dialect A: "1. *Name.* prose" — just the name, no Cons structure exists.
const RE_ALT_NAME = /^\s*\d+\.\s+\*(.+?)\*/gm;
// Any heading, any level — bounds one option's body at the next `### Option`
// or `## Outcome`, whichever comes first. Local to this file rather than
// imported from migrations/0.6.0.js's own version of the same idea: five
// lines is not worth a dependency between two otherwise-unrelated files.
const RE_ANY_HEADING = /^#{1,6}\s+.*$/gm;
const RE_CONS_MARKER = /\*\*(?:Cons|Contras)\*\*\s*:/i;
const RE_ANY_BOLD_MARKER = /\*\*[^*]+\*\*\s*:/;

// M3b, antipattern #1: a straw option props up the favorite with cons that
// don't exist or don't compare. Word count, not character count, so a Cons
// list with three short bullets doesn't read as "shorter" than one long one.
function consWordCount(body) {
  const consMatch = body.match(RE_CONS_MARKER);
  if (!consMatch) return 0;
  const rest = body.slice(consMatch.index + consMatch[0].length);
  // Search from character 1 so this doesn't immediately re-match its own
  // marker at position 0.
  const nextMarkerAt = rest.slice(1).search(RE_ANY_BOLD_MARKER);
  const consText = nextMarkerAt === -1 ? rest : rest.slice(0, nextMarkerAt + 1);
  return (consText.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).length;
}

function parseNativeDecisions(scan, content, file) {
  return blocksBetween(scan, [...scan.matchAll(RE_DECISION)]).map(({ match, body }) => {
    // Only the numbered list that follows the "Alternatives" marker counts.
    // Counting every numbered list in the block would let an unrelated list of
    // steps satisfy the rule.
    const altStart = body.search(/\*\*Alternatives considered\*\*|\*\*Alternativas consideradas\*\*/);
    const decidedAt = body.search(RE_DECIDED);
    const altRegion =
      altStart === -1 ? '' : body.slice(altStart, decidedAt === -1 ? body.length : decidedAt);
    const altNames = [...altRegion.matchAll(RE_ALT_NAME)].map((m) => m[1]);
    return {
      id: match[1],
      title: match[2],
      dialect: 'native',
      file,
      line: lineOf(content, match.index),
      alternatives: (altRegion.match(RE_NUMBERED) || []).length,
      decided: RE_DECIDED.test(body),
      hasDoNothing: altNames.some((n) => RE_DO_NOTHING_NAME.test(n)),
      strawOptions: [], // no Cons structure in this dialect to compare — see rfc.js's header
    };
  });
}

// Dialect B carries no D-xxx codes: the whole document IS one decision. It is
// reported under the synthetic code D-000 so a finding has something to point
// at, and so a document mixing both dialects does not collide.
function parseOptionsDecision(scan, content, file) {
  const optionsAt = scan.search(RE_OPTIONS_SECTION);
  if (optionsAt === -1) return null;

  const headingIdxs = [...scan.matchAll(RE_ANY_HEADING)].map((m) => m.index);
  const optionMatches = [...scan.matchAll(RE_OPTION)].filter((m) => m.index >= optionsAt);
  const options = optionMatches.map((m) => {
    const start = m.index + m[0].length;
    const end = headingIdxs.find((h) => h > m.index) ?? content.length;
    return {
      name: m[2],
      consWords: consWordCount(content.slice(start, end)),
      // The ⭐/Recommended marker lives right on the option's own heading
      // line in the upstream template ("### Option 1: Name ⭐ (Recommended)").
      recommended: RE_RECOMMENDED.test(m[0]),
    };
  });

  const outcomeAt = scan.search(RE_OUTCOME_SECTION);
  const outcomeBody = outcomeAt === -1 ? '' : scan.slice(outcomeAt);
  const outcomeLine = outcomeBody.match(RE_OUTCOME_DECISION)?.[1]?.trim() ?? null;

  // A placeholder Outcome is not a decision. The upstream template ships that
  // line as "[Option X was chosen / RFC was rejected / deferred]", and
  // accepting it would mean every freshly generated RFC passes the gate having
  // decided precisely nothing.
  const outcomeReal = Boolean(outcomeLine) && !/^\[.*\]$/.test(outcomeLine);
  const recommended = options.some((o) => o.recommended);

  // Only checked when a favorite is identifiable (the ⭐/Recommended marker)
  // AND that favorite itself declares real Cons — otherwise the Pros/Cons
  // structure either isn't in use in this document or there is nothing
  // trustworthy to compare against.
  const favorite = options.find((o) => o.recommended) ?? null;
  const strawOptions =
    favorite && favorite.consWords > 0
      ? options.filter((o) => o !== favorite && (o.consWords === 0 || o.consWords < favorite.consWords * 0.4))
      : [];

  const hasDoNothing = options.some((o) => RE_DO_NOTHING_NAME.test(o.name));

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
    hasDoNothing,
    strawOptions,
  };
}

export function parseRfc(content, file) {
  const scan = stripNonGrammar(content);

  const decisions = parseNativeDecisions(scan, content, file);
  const optionsDecision = parseOptionsDecision(scan, content, file);
  if (optionsDecision) decisions.push(optionsDecision);

  // The prose before the first decision — whichever dialect's marker comes
  // first — is "context." Neither marker present means the whole file is
  // context (or the file is empty either way).
  const firstDecisionAt = Math.min(
    ...[RE_DECISION, RE_OPTIONS_SECTION]
      .map((re) => scan.search(re))
      .filter((i) => i !== -1),
    scan.length
  );
  const contextHasNumbers = RE_NUMERIC_CONTEXT.test(content.slice(0, firstDecisionAt));

  return {
    kind: 'rfc',
    file,
    dialect: optionsDecision ? (decisions.length > 1 ? 'mixed' : 'create-rfc') : 'native',
    decisions,
    hasOutcomeSection: RE_OUTCOME_SECTION.test(scan),
    contextHasNumbers,
  };
}
