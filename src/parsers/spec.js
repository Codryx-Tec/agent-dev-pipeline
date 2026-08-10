// SPEC parser — owns US-xxx (stories), AC-xxx (acceptance criteria),
// ASM-xxx (assumptions), Q-xxx (open questions) and T-xxx (tasks).
//
// 0.6.0's restructuring (Q-003 in .spec/SCOPE-0.6.0.md): SPEC.md is "the
// layer the machine confers" — everything the audit engine cross-references
// lives here, in one document, instead of split across PRD/RFC/TDD the way
// 0.5.0 had it. PRD.md keeps only prose (what, for whom, why); RFC.md keeps
// only D-xxx decisions; DESIGN.md keeps only prose describing HOW.
//
// This file is a merge, not a rewrite: every regex and body-extraction rule
// below is unchanged from where it used to live (prd.js for stories/ACs,
// rfc.js for assumptions/questions, tdd.js for tasks) — only the ownership
// moved. One `stripNonGrammar` scan serves every family, which is the whole
// point of collapsing three small parsers into one: a heading shown inside
// backticks is documentation about the grammar in every family the same way,
// and this document is the one place that needs to know that just once.

import { lineOf, blocksBetween, stripNonGrammar, fold, splitList } from '../util/text.js';

// ---- stories / acceptance criteria (formerly prd.js) ----

// Both languages are accepted: Projeto_Agent's documents already mix them, and
// rejecting one would make the migration a rewrite.
const CLAUSES = {
  given: /^\s*[-*]\s*\*\*(Given|Dado)\*\*/m,
  when: /^\s*[-*]\s*\*\*(When|Quando)\*\*/m,
  then: /^\s*[-*]\s*\*\*(Then|Ent[ãa]o)\*\*/m,
};

const RE_STORY = /^###\s+(US-\d+)\s*[—–-]\s*(.+?)\s*$/gm;
const RE_AC = /^####\s+(AC-\d+)\s*[—–-]\s*(.+?)\s*$/gm;

// ---- tasks (formerly tdd.js) ----

export const TASK_STATUSES = ['pending', 'in-progress', 'in-test', 'done'];

// Any `## T-xxx —` heading, with or without a valid status. Matching the loose
// form first is what lets a heading with a bad status be REPORTED rather than
// silently skipped — skipping it would hide the task from the audit while
// leaving it visible to humans.
const RE_TASK_LOOSE = /^##\s+(T-\d+)\s*[—–-]\s*(.*)$/gm;
const RE_STATUS_TAIL = /\[([^\]]+)\]\s*$/;
const RE_REFS = /^\s*[-*]\s*Refs?:\s*(.+)$/m;
const RE_FILES = /^\s*[-*]\s*Files?:\s*(.+)$/im;
const RE_READS = /^\s*[-*]\s*Reads?:\s*(.+)$/im;
const RE_DEPENDS = /^\s*[-*]\s*Depends?(?:\s+on)?:\s*(.+)$/im;

// ---- assumptions / questions (formerly rfc.js) ----

export const ASM_STATUSES = ['open', 'confirmed', 'invalidated'];
export const Q_STATUSES = ['open', 'answered'];

const RE_ITEM = /^\s*[-*]\s*\*\*((?:ASM|Q)-\d+)\*\*/gm;
const RE_STATUS_IN = /status:\s*([a-zà-ú-]+)/i;
// table rows: | ASM-001 | text | ... |   or   | 1 | text | ... |
const RE_TABLE_ROW = /^\|\s*((?:ASM|Q)-\d+|\d+)\s*\|([^|]*)\|(.*)$/gm;

const SECTIONS = {
  assumptions: /^##\s+(?:Assumptions|Suposi[çc][õo]es|Premissas)\s*$/m,
  questions: /^##\s+(?:Open questions|Open Questions|Perguntas em aberto|Quest[õo]es em aberto)\s*$/m,
};

const RE_FEATURE = /^>\s*feature:\s*(\S+)/m;

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

export function parseSpec(content, file) {
  const scan = stripNonGrammar(content);

  // ---- stories / acceptance criteria ----
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

  // ---- tasks ----
  const taskMatches = [...scan.matchAll(RE_TASK_LOOSE)];
  const tasks = blocksBetween(scan, taskMatches).map(({ match, body }) => {
    const tail = match[2].match(RE_STATUS_TAIL);
    const rawStatus = tail ? tail[1] : null;
    const status = rawStatus ? fold(rawStatus) : null;
    const title = tail ? match[2].slice(0, tail.index).trim() : match[2].trim();

    const refs = splitList(body.match(RE_REFS)?.[1] ?? '');
    const files = splitList(body.match(RE_FILES)?.[1] ?? '');
    const reads = splitList(body.match(RE_READS)?.[1] ?? '');
    // Upper-cased because ids are compared, not displayed: a `Depends on: t-001`
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

  // ---- assumptions / questions ----
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
    kind: 'spec',
    file,
    feature: content.match(RE_FEATURE)?.[1] ?? null,
    stories,
    acs,
    orphanAcs,
    tasks,
    assumptions: items.filter((i) => i.kind === 'assumption'),
    questions: items.filter((i) => i.kind === 'question'),
    // Rows carrying a bare number instead of a traceability code: the item is
    // written down, but it cannot be referenced, tracked or closed.
    uncodedAssumptions: asmTable.uncoded,
    uncodedQuestions: qTable.uncoded,
    hasAssumptionsSection: SECTIONS.assumptions.test(scan),
    hasQuestionsSection: SECTIONS.questions.test(scan),
  };
}

export function allAcs(spec) {
  return spec ? spec.acs : [];
}
