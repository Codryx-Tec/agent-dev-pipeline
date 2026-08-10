// The 0.5 -> 0.6 codemod: splits PRD/RFC/TDD into PRD/RFC/SPEC/DESIGN.
//
// 0.6.0 moved US-xxx/AC-xxx out of PRD.md, ASM-xxx/Q-xxx out of RFC.md and
// T-xxx out of TDD.md, all three into a new SPEC.md — "the layer the machine
// confers" (Q-003 in .spec/SCOPE-0.6.0.md). TDD.md keeps its remaining prose
// and is renamed DESIGN.md.
//
// This is a structural rewrite, not a text substitution — content crosses
// file boundaries — so the shape of this migration differs from 0.5.0.js's
// in three ways worth stating:
//
//   1. It operates per FEATURE DIRECTORY (`<specDir>/features/*/`), not per
//      file, because it has to read up to three source documents to write
//      two of the destination ones.
//   2. Idempotency is keyed on TDD.md's EXISTENCE, not on a content scan.
//      The transformation crosses file boundaries, so "already migrated" is
//      a structural fact (no TDD.md left) rather than a text-similarity
//      guess a regex could make.
//   3. It never overwrites a SPEC.md section that already exists. A human
//      may have started SPEC.md by hand, or a previous partial run may have
//      left one — either way, clobbering it is worse than leaving a note
//      that says what was not merged and why.
//
// Detection regexes are self-contained copies of what prd.js/rfc.js/tdd.js
// used to match before this release slimmed or deleted them — copied,
// not imported, because importing a moving target from a migration is the
// coupling 0.5.0.js's self-contained-regex precedent already avoids.

import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { stripNonGrammar } from '../util/text.js';

export const version = '0.6.0';
export const description = 'split PRD/RFC/TDD into PRD/RFC/SPEC/DESIGN, moving US/AC/ASM/Q/T ownership (0.5.0 -> 0.6.0)';

const RE_STORY = /^###\s+US-\d+\s*[—–-].*$/gm;
const RE_TASK = /^##\s+T-\d+\s*[—–-].*$/gm;
const RE_ASSUMPTIONS_SECTION = /^##\s+(?:Assumptions|Suposi[çc][õo]es|Premissas)\s*$/m;
const RE_QUESTIONS_SECTION = /^##\s+(?:Open questions|Open Questions|Perguntas em aberto|Quest[õo]es em aberto)\s*$/m;
const RE_ANY_HEADING = /^(#{1,6})\s+.*$/gm;

function headingStarts(scan, maxLevel) {
  const starts = [];
  for (const m of scan.matchAll(RE_ANY_HEADING)) {
    if (m[1].length <= maxLevel) starts.push(m.index);
  }
  return starts;
}

/** Spans for each match, each bounded by the next heading at or above maxLevel. */
function spansBoundedByHeading(content, scan, matches, maxLevel) {
  const boundaries = headingStarts(scan, maxLevel);
  return matches.map((m) => {
    const end = boundaries.find((b) => b > m.index) ?? content.length;
    return { start: m.index, end, text: content.slice(m.index, end) };
  });
}

/** A `## Section` heading's body (heading excluded) and its full span (heading included, for removal). */
function namedSection(content, scan, sectionRe) {
  const at = scan.search(sectionRe);
  if (at === -1) return null;
  const end = headingStarts(scan, 2).find((b) => b > at) ?? content.length;
  const headingLineEnd = content.indexOf('\n', at);
  const bodyStart = headingLineEnd === -1 ? content.length : headingLineEnd + 1;
  return { start: at, end, body: content.slice(bodyStart, end) };
}

/** Remove a set of [start,end) spans from content, keeping everything else in place. */
function removeSpans(content, spans) {
  let out = '';
  let cursor = 0;
  for (const { start, end } of [...spans].sort((a, b) => a.start - b.start)) {
    if (start < cursor) continue; // overlapping/duplicate span, already covered
    out += content.slice(cursor, start);
    cursor = end;
  }
  out += content.slice(cursor);
  return out;
}

function trimBlank(text) {
  return text.replace(/^\n+/, '').replace(/\s+$/, '');
}

// Which `## <Heading>` sections a SPEC.md already carries, so a re-run or a
// hand-started SPEC.md never gets a section silently duplicated or clobbered.
function existingSpecSections(specContent) {
  const found = new Set();
  for (const m of specContent.matchAll(RE_ANY_HEADING)) {
    if (m[1].length === 2) found.add(m[0].replace(/^#{1,6}\s+/, '').trim());
  }
  return found;
}

function listFeatureDirs(featuresRoot) {
  if (!existsSync(featuresRoot)) return [];
  return readdirSync(featuresRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function migrateFeature(dir) {
  const prdPath = path.join(dir, 'PRD.md');
  const rfcPath = path.join(dir, 'RFC.md');
  const tddPath = path.join(dir, 'TDD.md');
  const designPath = path.join(dir, 'DESIGN.md');
  const specPath = path.join(dir, 'SPEC.md');

  if (!existsSync(tddPath)) return null; // already migrated — see check()

  const prd = existsSync(prdPath) ? readFileSync(prdPath, 'utf8') : null;
  const rfc = existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : null;
  const tdd = readFileSync(tddPath, 'utf8');

  const sections = {}; // heading -> body text to merge into SPEC.md
  const notes = [];
  const writes = [];

  if (prd !== null) {
    const scan = stripNonGrammar(prd);
    const storySpans = spansBoundedByHeading(prd, scan, [...scan.matchAll(RE_STORY)], 3);
    if (storySpans.length) {
      sections['Stories'] = storySpans.map((s) => trimBlank(s.text)).join('\n\n');
      writes.push({ path: prdPath, content: removeSpans(prd, storySpans) });
    }
  }

  if (rfc !== null) {
    const scan = stripNonGrammar(rfc);
    const asm = namedSection(rfc, scan, RE_ASSUMPTIONS_SECTION);
    const q = namedSection(rfc, scan, RE_QUESTIONS_SECTION);
    const removedFromRfc = [];
    if (asm) {
      sections['Assumptions'] = trimBlank(asm.body);
      removedFromRfc.push(asm);
    }
    if (q) {
      sections['Open questions'] = trimBlank(q.body);
      removedFromRfc.push(q);
    }
    if (removedFromRfc.length) writes.push({ path: rfcPath, content: removeSpans(rfc, removedFromRfc) });
  }

  const tddScan = stripNonGrammar(tdd);
  const taskSpans = spansBoundedByHeading(tdd, tddScan, [...tddScan.matchAll(RE_TASK)], 2);
  if (taskSpans.length) {
    sections['Tasks'] = taskSpans.map((s) => trimBlank(s.text)).join('\n\n');
  }
  writes.push({ path: designPath, content: removeSpans(tdd, taskSpans) });

  // Merge into SPEC.md — order fixed as Stories, Assumptions, Open questions,
  // Tasks, matching payload/templates/SPEC.md. Never overwrite a section
  // that already exists there: append what SPEC.md does not have, and name
  // what was skipped instead of silently dropping or duplicating it.
  const already = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
  const knownSections = existingSpecSections(already);
  const order = ['Stories', 'Assumptions', 'Open questions', 'Tasks'];
  const toAppend = [];
  for (const name of order) {
    if (!(name in sections)) continue;
    if (knownSections.has(name)) {
      notes.push(`SPEC.md already has a "${name}" section — content from the old document was not merged; move it by hand`);
      continue;
    }
    toAppend.push(`## ${name}\n\n${sections[name]}`);
  }
  if (toAppend.length) {
    const merged = already && !already.endsWith('\n\n') ? `${already.replace(/\s+$/, '')}\n\n` : already;
    writes.push({ path: specPath, content: merged + toAppend.join('\n\n') + '\n' });
  }

  return { writes, deletes: [tddPath], notes };
}

export function check(specDir) {
  const featuresRoot = path.join(specDir, 'features');
  return listFeatureDirs(featuresRoot).every((name) => !existsSync(path.join(featuresRoot, name, 'TDD.md')));
}

export function apply(specDir, { dryRun = true } = {}) {
  const featuresRoot = path.join(specDir, 'features');
  const changed = [];
  const notes = [];

  for (const name of listFeatureDirs(featuresRoot)) {
    const dir = path.join(featuresRoot, name);
    const result = migrateFeature(dir);
    if (!result) continue;

    for (const { path: p } of result.writes) changed.push({ file: path.relative(specDir, p).split(path.sep).join('/') });
    for (const p of result.deletes) changed.push({ file: path.relative(specDir, p).split(path.sep).join('/'), deleted: true });
    for (const n of result.notes) notes.push({ feature: name, note: n });

    if (!dryRun) {
      for (const { path: p, content } of result.writes) writeFileSync(p, content);
      for (const p of result.deletes) unlinkSync(p);
    }
  }

  return { changed, notes };
}
