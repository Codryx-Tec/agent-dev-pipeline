// The audit engine.
//
// Answers mechanically:
//   "which requirement has no test?"      -> AC_WITHOUT_TEST
//   "which test points at nothing?"       -> TEST_ORPHAN
//   "which code maps to no task?"         -> FILE_ORPHAN
//   "which principle is decoration?"      -> PRINCIPLE_WITHOUT_VERIFICATION
//
// Every finding carries a STABLE CODE. The code is the compatibility surface
// for CI and for the page, and it never varies by locale.
//
// Traceability codes are unique PROJECT-WIDE, not per document, so a task in one
// feature's SPEC may legally reference a criterion defined in another
// feature's SPEC. Reference resolution is therefore global — see RFC D-003.

import { existsSync, statSync, readFileSync } from 'fs';
import path from 'path';
import { CI_ESCALATES, isDeferrable } from './gates.js';
import { checkPrinciples } from './principles.js';
import { SIGNALS, projectCeremony, computeCeremonySignals, capabilityGapMultiplier } from './ceremony.js';
import { loadProfile } from './estimate.js';
import { grepPattern } from '../parsers/annotations.js';
import { globToRegExp } from '../util/glob.js';

// PRD_WITH_SOLUTION's default vocabulary (M3b) — used only when the project
// has no `.spec/PRD_VOCABULARY.json` of its own yet (pre-`adp init`, or an
// upgrade that hasn't seeded one). Kept tiny and unambiguous on purpose: the
// full, editable list ships in payload/vocabulary/prd-forbidden.default.json.
const FALLBACK_PRD_VOCABULARY = ['postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'react', 'django'];

// SCOPE-0.6.0.md §2.4 — same spirit as CONTEXT_WITHOUT_NUMBERS (a claim
// grounded in a figure, not an impression), narrowed to a single option's own
// prose and only checked once that decision has opted into the scored
// structure (rfc.js's parseScoredStructure).
// The symbol alternatives (%, currency) sit outside the trailing `\b`: a
// word boundary can never follow a non-word character like `%` when what's
// next is whitespace or end of string, so folding them into the same `\b`
// as the word alternatives would make them permanently unmatchable.
const RE_OPTION_NUMERIC_CLAIM =
  /\d[\d.,]*\s*(?:%|r\$|us\$|\$|\b(?:ms|s|sec(?:onds?)?|segundos?|min(?:s|utos?|utes?)?|h(?:ours?|oras?)?|dias?|days?|semanas?|weeks?|meses?|months?|anos?|years?|usu[áa]rios?|users?|requests?|reqs?|rps)\b)/i;
const RE_OPTION_SOURCE_CITED = /\[[^\]]*\]\([^)]+\)|\bsource:|\bfonte:|https?:\/\//i;

// M3b, antipattern #7 (AI-review rule, not one of the six classics): a vague
// adjective with no number attached is not something a test can check.
// "responds quickly" fails; "responds in under 300ms" passes.
const RE_VAGUE_ADJECTIVE =
  /\b(r[áa]pid[oa]s?|f[áa]cil|f[áa]ceis|simples|eficiente|robust[oa]|amig[áa]vel|intuitiv[oa]|razo[áa]vel|aceit[áa]vel|adequad[oa]|respons[íi]v[oa]|escal[áa]vel|bo[am]|melhor|fast|easy|simple|efficient|robust|friendly|intuitive|reasonable|acceptable|appropriate|responsive|scalable|good|better)\b/i;
const RE_HAS_NUMBER = /\d/;
const RE_GWT_LINE = /^\s*[-*]\s*\*\*(?:Given|Dado|When|Quando|Then|Ent[ãa]o)\*\*.*$/gim;

// `ac.body` runs to the next AC/US OR, for the last criterion in a document,
// to end of file — which swallows unrelated trailing sections (Assumptions,
// tasks, their own ASM-xxx/T-xxx codes). AC_NOT_OBSERVABLE only cares about
// the Given/When/Then lines themselves, so it scopes to those, not the body.
function gwtText(ac) {
  return (ac.body.match(RE_GWT_LINE) || []).join(' ');
}

const RE_SHORT_ID = /^(US|AC|T|ASM|Q|P|RFC)-\d{1,2}$/;

/**
 * Has the code moved since proof was taken?
 *
 * The git revision is preferred when both sides have one and the tree was clean:
 * a commit hash is the same code on any machine, so proof survives a clone or a
 * tarball extraction, where every modification time becomes "now" and would make
 * perfectly good proof look stale.
 *
 * mtime is the fallback — for a project with no git, and for a dirty tree, where
 * the hash describes something other than what was tested.
 */
/** How many lines a project-relative document has. Used by DOC_TOO_LONG. */
function lineCount(rootDir, relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8').split('\n').length;
}

// M3b, antipattern #6 (DUPLICATE_PROSE): "the documents point at each other,
// they don't copy" — PRD ← RFC ← DESIGN. Paragraphs under 25 words are
// skipped: short boilerplate and headers are expected to repeat and are not
// what this check is for.
const MIN_DUPLICATE_WORDS = 25;
const DUPLICATE_SIMILARITY_THRESHOLD = 0.75;

function paragraphsOf(rootDir, relPath) {
  const full = path.join(rootDir, relPath);
  if (!existsSync(full)) return [];
  const raw = readFileSync(full, 'utf8');
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= MIN_DUPLICATE_WORDS);
}

function wordSet(text) {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
}

function jaccard(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / (setA.size + setB.size - shared);
}

// M5b — DEFERRALS.md. `Scope:` is a path or an instance (§12.1): a glob
// (containing `*` or `?`) is matched with the engine's one glob dialect,
// same as every other glob in this project; a plain string matches only
// that exact file, or — for a finding with no file, like most G6 project-
// wide checks — the exact feature name. That is the whole idea of
// "instance": a scope that names one thing, not a pattern.
function scopeMatches(finding, scope) {
  const target = finding.file ?? finding.feature ?? null;
  if (target == null || !scope) return false;
  return /[*?]/.test(scope) ? globToRegExp(scope).test(target) : target === scope;
}

function parseDeferralDate(s) {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isProofStale(project, record) {
  if (record.gitRev && project.gitRev && record.gitDirty === false) {
    return record.gitRev !== project.gitRev;
  }
  if (record.codeMtime == null || project.codeMtime == null) return false;
  return project.codeMtime > record.codeMtime;
}

export function auditProject(project, { ci = false, strict = false, now = new Date() } = {}) {
  const findings = [];
  const { config, features, scope, rfcs, backlog, baseline } = project;

  // The declared team profile (`adp profile --capabilities`) — read once,
  // used both by the ceremony auto-light below and by OPTION_BEYOND_TEAM
  // further down. Absent entirely (nobody ever ran `adp profile`) reads as
  // no declared capabilities, the same posture an undeclared stack/
  // familiarity already takes for `adp estimate`.
  const capabilities = new Set((loadProfile(project.rootDir, config).capabilities ?? []).map((c) => c.toLowerCase()));

  // The ceremony matrix (M2b, SCOPE-0.6.0.md §2.5): what each feature's
  // declared signals say G2/G3 are due, and whether the gate is due at all,
  // project-wide. Computed once, read by both the per-feature G2/G3 checks
  // below and by gates.js's evaluateGates() (see the CLI, which threads it
  // through as `{ ceremony }`). SCOPE-0.6.0.md §2.4: a capability gap in a
  // linked RFC's scored decision auto-lights `new-tech` here, on top of
  // whatever `> signals:` a PRD declares by hand — see computeCeremonySignals.
  const ceremony = projectCeremony(features, computeCeremonySignals(features, rfcs, capabilities));

  const emit = (code, severity, message, extra = {}) => {
    // The brownfield ratchet (M4-readonly-core): a finding tied to a file
    // present at adoption time, and untouched since, never escalates under
    // --ci — general, not FILE_ORPHAN-specific, matching the source text's
    // own framing ("findings são warning", not one particular code). A
    // project with no BASELINE.md sees no change: baseline.files is empty.
    const baselineExempt =
      baseline?.present && extra.file && baseline.files.has(extra.file) && !baseline.touchedSet.has(extra.file);
    const finalSeverity =
      ci && severity === 'warning' && CI_ESCALATES.has(code) && !baselineExempt ? 'error' : severity;
    findings.push({ code, severity: finalSeverity, message, ...extra });
  };

  for (const err of project.errors) emit('PROJECT_INVALID', 'error', err);

  // ---------------------------------------------------------------- G0 scope
  if (!scope.present) {
    emit('SCOPE_MISSING', 'error', `${scope.file} not found — the chain starts at the scope`,
      { file: scope.file });
  } else {
    const status = (scope.status || '').toLowerCase();
    if (!status.startsWith('approved') && !status.startsWith('aprovado')) {
      emit('SCOPE_NOT_APPROVED', 'error',
        `scope status is "${scope.status || 'absent'}" — development must not start before it is Approved`,
        { file: scope.file });
    }
    for (const field of scope.placeholders) {
      emit('SCOPE_FIELD_EMPTY', 'warning', `scope field "${field}" is still a placeholder`,
        { file: scope.file });
    }
  }

  // ---------------------------------------------- BASELINE_WIDENED (global)
  // SCOPE-0.6.0.md PRD-002: "o baseline só encolhe" — the one mechanism in
  // this tool that turns findings off, so the one rule it cannot bend on is
  // that the exemption never legitimately grows back. Never deferrable
  // (gates.js's NEVER_DEFERRABLE) — the same posture RFC_REQUIRED takes
  // toward a decision, not a fact about the world changing underneath it.
  if (baseline?.present) {
    for (const f of baseline.widened) {
      emit('BASELINE_WIDENED', 'error',
        `${f} left the baseline before and is back — the baseline only shrinks; a file that needs the discount again earns a fresh, honest look, not a re-add`,
        { file: baseline.file });
    }
  }

  // ------------------------------------------------ global traceability index
  const seen = new Map();
  const knownAc = new Map();
  const knownUs = new Map();
  const knownTask = new Map();

  const register = (id, el, feature) => {
    if (seen.has(id)) {
      const first = seen.get(id);
      emit('ID_DUPLICATE', 'error',
        `${id} is defined in ${first.file}:${first.line} and again here`,
        { file: el.file, line: el.line, feature });
    } else {
      seen.set(id, el);
    }
    if (RE_SHORT_ID.test(id)) {
      emit('ID_TOO_SHORT', 'warning', `${id} uses fewer than 3 digits — the grammar expects US-001, not US-1`,
        { file: el.file, line: el.line, feature });
    }
  };

  // SPEC.md owns every family the audit cross-references — US/AC, ASM/Q and
  // T-xxx all moved here in 0.6.0, so one block feeds every index instead of
  // three separate per-document ones.
  for (const f of features) {
    if (f.spec) {
      for (const s of f.spec.stories) {
        register(s.id, s, f.name);
        knownUs.set(s.id, { story: s, feature: f });
      }
      for (const ac of f.spec.acs) {
        register(ac.id, ac, f.name);
        knownAc.set(ac.id, { ac, feature: f });
      }
      for (const item of [...f.spec.assumptions, ...f.spec.questions]) register(item.id, item, f.name);
      for (const t of f.spec.tasks) {
        register(t.id, t, f.name);
        knownTask.set(t.id, { task: t, feature: f });
      }
    }
  }

  // ---------------------------------------------------- RFCs (global, once)
  // An RFC's own validity does not depend on who references it — checking it
  // once here (rather than once per feature that links it) is the actual
  // point of un-nesting it (Q-001): two PRDs sharing one incomplete RFC get
  // one finding, not two duplicates pointing at the same file.
  for (const [id, entry] of rfcs) {
    register(id, { file: entry.file, line: 1 }, null);
    // M3b, antipattern #2: "our process has some problems" proves nothing.
    if (!entry.rfc.contextHasNumbers) {
      emit('CONTEXT_WITHOUT_NUMBERS', 'error',
        `${entry.file} has no measurable figure before its first decision — ground the context in a number ("support tickets take 20 minutes"), not an impression ("the process has some problems")`,
        { file: entry.file, line: 1 });
    }
    for (const d of entry.rfc.decisions) {
      const noun = d.dialect === 'create-rfc' ? 'option' : 'alternative';
      if (d.alternatives < 2) {
        emit('DECISION_WITHOUT_ALTERNATIVE', 'error',
          `${d.id} (${d.title}) records ${d.alternatives} ${noun}(s) — a decision without alternatives is indistinguishable from a habit`,
          { file: d.file, line: d.line });
      }
      if (!d.decided) {
        emit('DECISION_WITHOUT_CHOICE', 'error',
          d.dialect === 'create-rfc'
            ? `${d.id}: no option is marked recommended and the Outcome still holds the template placeholder — nothing was decided yet`
            : `${d.id} (${d.title}) records no chosen option`,
          { file: d.file, line: d.line });
      }
      // M3b, antipattern #3: not considering doing nothing at all is its
      // own kind of unweighed decision. A plain warning, not the "erro
      // (G2)" SCOPE-0.6.0.md's own text specifies — even CI_ESCALATES
      // broke the shipped .exemplo/ example's own RFC retroactively under
      // --ci, which is a stronger signal than this pass should ship with.
      if (!d.hasDoNothing) {
        emit('OPTION_DO_NOTHING_MISSING', 'warning',
          `${d.id} (${d.title}) never considers not doing this — a "do nothing" ${noun} makes the case for acting explicit instead of assumed`,
          { file: d.file, line: d.line });
      }
      // M3b, antipattern #1: a straw option exists to lose. Only checked
      // when a favorite is identifiable and its own Cons are real — see
      // rfc.js's parseOptionsDecision for exactly what that requires.
      for (const opt of d.strawOptions ?? []) {
        emit('STRAW_OPTION', 'warning',
          `${d.id}: "${opt.name}" ${opt.consWords === 0 ? 'declares no cons at all' : `declares only ${opt.consWords} words of cons, far short of the favorite's`} — a real option has real drawbacks, or it isn't really being weighed`,
          { file: d.file, line: d.line });
      }

      // SCOPE-0.6.0.md §2.4 — opt-in only: a decision reaches these the
      // moment it declares `**Decision criteria:**` or `**Options
      // considered**` itself. Every decision that predates this stays
      // exactly as it was, unaffected — see rfc.js's parseScoredStructure.
      if (d.scored) {
        const { scored } = d;
        const matrixDeclared = scored.matrixHeader.length > 0;

        // Order (and presence, once a matrix exists) — folded under one
        // code rather than a family of new ones, matching how
        // DECISION_WITHOUT_ALTERNATIVE already covers "not enough options"
        // generically.
        if (scored.criteriaDeclared && !scored.criteriaBeforeOptions) {
          emit('CRITERIA_AFTER_OPTIONS', 'error',
            `${d.id} declares **Decision criteria:** after **Options considered** — criteria decided in light of the options already picked are not criteria, they are a rationalization`,
            { file: d.file, line: d.line });
        } else if (!scored.criteriaDeclared && matrixDeclared) {
          emit('CRITERIA_AFTER_OPTIONS', 'error',
            `${d.id} has a scoring matrix but never declares **Decision criteria:** — a score with nothing it is scoring against is not a score`,
            { file: d.file, line: d.line });
        }

        if (scored.options.length > 0 && scored.options.length < 3) {
          emit('CRITERIA_AFTER_OPTIONS', 'error',
            `${d.id} opts into the scored structure with only ${scored.options.length} option(s) — a scoring matrix needs at least 3, including a "do nothing" (OPT-000)`,
            { file: d.file, line: d.line });
        }
        if (scored.options.length > 0 && !scored.options.some((o) => o.id === 'OPT-000')) {
          emit('CRITERIA_AFTER_OPTIONS', 'error',
            `${d.id} opts into the scored structure with no OPT-000 — the "do nothing" option is not optional here, it is the baseline every score is measured against`,
            { file: d.file, line: d.line });
        }

        // Matrix completeness: every declared option scored against every
        // declared criterion, no gaps.
        if (scored.criteriaIds.length > 0 && scored.options.length > 0) {
          for (const opt of scored.options) {
            const row = scored.matrix[opt.id];
            if (!row) {
              emit('CRITERIA_AFTER_OPTIONS', 'error',
                `${d.id}: ${opt.id} has no row in the scoring matrix — every option needs a score, or it isn't really being weighed`,
                { file: d.file, line: d.line });
              continue;
            }
            const gaps = scored.criteriaIds.filter((w) => row[w] === undefined || row[w] === null || row[w] === '');
            if (gaps.length > 0) {
              emit('CRITERIA_AFTER_OPTIONS', 'error',
                `${d.id}: ${opt.id} has no score for ${gaps.join(', ')} — a gap in the matrix is a decision hiding inside a spreadsheet`,
                { file: d.file, line: d.line });
            }
          }
        }

        // The recommendation may depart from the top score — but only with
        // real justification prose, not silently.
        if (scored.recommendation) {
          // Weighted, not a plain sum: a raw per-criterion score means
          // nothing on its own once criteria carry different weights — a 9
          // on a weight-3 criterion should not out-rank a 7 on a weight-5
          // one, and a plain sum let it. Normalizes by the actual weight
          // SUM of the criteria this decision cited (via SCOPE.md's own
          // `## 11. Decision criteria`), not an assumed 100 — a project's
          // weights can be on any scale, 1–5 or otherwise. No weights
          // declared for any cited criterion (most projects, most of the
          // time): falls back to the plain sum this mechanism always used,
          // unchanged — a hand-typed `Total` column is no longer read as
          // authoritative either way, since a human's own arithmetic is
          // exactly what this check exists to verify, not trust.
          const weightOf = (id) => scope.criteria.find((c) => c.id === id)?.weight ?? null;
          const scoreOf = (optId) => {
            const row = scored.matrix[optId];
            if (!row) return null;
            let weightedSum = 0;
            let weightSum = 0;
            for (const critId of scored.criteriaIds) {
              const cell = Number(row[critId]);
              const w = weightOf(critId);
              if (!Number.isFinite(cell) || w == null) continue;
              weightedSum += cell * w;
              weightSum += w;
            }
            if (weightSum > 0) return weightedSum / weightSum;
            const sum = Object.values(row)
              .map(Number)
              .filter((n) => Number.isFinite(n))
              .reduce((a, b) => a + b, 0);
            return sum;
          };
          const scores = scored.options.map((o) => ({ id: o.id, score: scoreOf(o.id) })).filter((s) => s.score !== null);
          const top = scores.reduce((best, s) => (best === null || s.score > best.score ? s : best), null);
          const recScore = scoreOf(scored.recommendation.optId);
          const isPlaceholder = /^\[.*\]$/.test(scored.recommendation.justification);
          const hasJustification = scored.recommendation.justification.length > 0 && !isPlaceholder;
          if (top && recScore !== null && recScore < top.score && !hasJustification) {
            const round = (n) => Math.round(n * 100) / 100;
            emit('RECOMMENDATION_AGAINST_SCORE', 'error',
              `${d.id} recommends ${scored.recommendation.optId} (score ${round(recScore)}) over the top-scored ${top.id} (score ${round(top.score)}) with no justification prose — a recommendation against the score needs a reason, not just a name`,
              { file: d.file, line: d.line });
          }
        }

        // A numeric claim inside an option's own prose, uncited — narrower
        // than CONTEXT_WITHOUT_NUMBERS on purpose: only opted-in decisions
        // reach this, not every RFC's free prose.
        for (const opt of scored.options) {
          if (RE_OPTION_NUMERIC_CLAIM.test(opt.prose) && !RE_OPTION_SOURCE_CITED.test(opt.prose)) {
            emit('CONTEXT_NUMBER_WITHOUT_SOURCE', 'warning',
              `${d.id}: ${opt.id} states a figure with no cited source — a number nobody can trace back is an impression wearing a costume`,
              { file: d.file, line: d.line });
          }
          // A capability the team profile doesn't declare — informational,
          // not enforced: no closure yet measures the real cost of a gap
          // like this, so the multiplier reported is a flat guess, not a
          // computed one (see ceremony.js's capabilityGapMultiplier).
          const gaps = opt.requires.filter((r) => !capabilities.has(r.toLowerCase()));
          if (gaps.length > 0) {
            emit('OPTION_BEYOND_TEAM', 'warning',
              `${d.id}: ${opt.id} requires ${gaps.join(', ')} — outside the team's declared capabilities (see \`adp profile --capabilities\`); treat this option's estimate as roughly ${capabilityGapMultiplier}x until it's been done once`,
              { file: d.file, line: d.line });
          }
        }
      }
    }
  }

  // ---------------------------------------------------- BACKLOG (global, once)
  // Optional — its absence just means nothing has been pushed out of the MVP
  // yet (M2c-core). What it must never do is smuggle a real tracking code:
  // "só ao ser promovido a PRD é que o item ganha códigos" (SCOPE-0.6.0.md §2.2).
  if (backlog.present) {
    for (const item of backlog.items) {
      if (item.taggedCode) {
        emit('BACKLOG_ITEM_WITH_CODE', 'warning',
          `backlog item carries ${item.taggedCode} — codes belong to a promoted PRD, not a backlog entry`,
          { file: item.file, line: item.line });
      }
    }
  }

  // -------------------------------------------------- PRD_WITH_SOLUTION (global, once)
  // M3b, antipattern #4: "the PRD that became a spec." A PRD describes the
  // problem, never the technical solution — reuses the same sandboxed,
  // timeout-bounded regex primitive the constitution's verification(forbidden)
  // already runs on, pointed at every PRD.md instead of at a human-declared
  // principle, because this rule isn't optional per project the way a
  // constitution principle is.
  {
    const vocabPath = path.join(project.rootDir, config.prdVocabularyFile ?? '.spec/PRD_VOCABULARY.json');
    let terms = FALLBACK_PRD_VOCABULARY;
    if (existsSync(vocabPath)) {
      try {
        const parsed = JSON.parse(readFileSync(vocabPath, 'utf8'));
        if (Array.isArray(parsed.terms)) terms = parsed.terms;
      } catch {
        /* a malformed vocabulary file falls back rather than crashing the audit */
      }
    }
    if (terms.length) {
      const pattern = `\\b(${terms.join('|')})\\b`;
      const glob = `${config.featuresDir}/**/${config.documents.prd}`;
      // No ignoreGlobs here on purpose: the default list excludes `.spec/**`
      // (kept out of test/src scanning elsewhere), but PRD.md lives exactly
      // there — passing it through would silently exclude every file this
      // check exists to look at.
      const { error, hits } = grepPattern(project.rootDir, pattern, glob, [], 'i');
      if (error) {
        emit('PROJECT_INVALID', 'error', `PRD_WITH_SOLUTION check could not run: ${error}`);
      } else {
        for (const hit of hits.slice(0, 10)) {
          emit('PRD_WITH_SOLUTION', 'error',
            `${hit.file} names a technical solution — "${hit.text.slice(0, 120)}" — a PRD describes the problem, never the technology; that belongs in the RFC or DESIGN`,
            { file: hit.file, line: hit.line });
        }
        if (hits.length > 10) {
          emit('PRD_WITH_SOLUTION', 'error', `${hits.length - 10} further occurrence(s) not listed`);
        }
      }
    }
  }

  // -------------------------------------------------------------- per feature
  for (const f of features) {
    // ---- G1 PRD — prose only: what, for whom, why ----
    if (!f.hasPrd) {
      emit('PRD_MISSING', 'error', `${f.name} has no ${config.documents.prd}`, { feature: f.name, file: f.prdPath });
    } else if (f.prd.feature && f.prd.feature !== f.name) {
      emit('FEATURE_MISMATCH', 'warning',
        `${f.prdPath} declares feature "${f.prd.feature}" but lives in "${f.name}"`,
        { feature: f.name, file: f.prdPath });
    }
    // A PRD that exists must be accounted for: in the MVP boundary or
    // nowhere is never a legal state (M2c-core, SCOPE-0.6.0.md §2.2).
    if (f.hasPrd && !scope.mvp.includes(f.name)) {
      emit('PRD_UNPLACED', 'error',
        `${f.name} has a PRD but is not declared in ${scope.file}'s MVP checklist — add "- [ ] ${f.name}" under "MVP (prioritized):"`,
        { feature: f.name, file: f.prdPath });
    }
    for (const s of f.prd?.signals ?? []) {
      if (!SIGNALS.includes(s)) {
        emit('SIGNAL_UNKNOWN', 'warning',
          `${f.prdPath} declares signal "${s}", which the ceremony matrix does not recognize — use one of: ${SIGNALS.join(', ')}`,
          { feature: f.name, file: f.prdPath });
      }
    }
    // M3b, antipattern #5: "the 40 pages." A PRD is meant to stay prose a
    // product owner can read in one sitting — SPEC.md is exempt from this
    // check on purpose (its length scales with real content, not padding).
    if (f.hasPrd && config.docLengthLimits?.prd) {
      const lines = lineCount(project.rootDir, f.prdPath);
      if (lines > config.docLengthLimits.prd) {
        emit('DOC_TOO_LONG', 'warning',
          `${f.prdPath} is ${lines} lines, over the ${config.docLengthLimits.prd}-line PRD ceiling — a PRD this long has probably drifted into being a spec`,
          { feature: f.name, file: f.prdPath });
      }
    }

    // ---- G2 RFC — linked by id, not a fixed sibling file (Q-001). Due only
    // when this feature's ceremony level requires it (M2b) ----
    const featureCeremony = ceremony.perFeature.get(f.name);
    if (featureCeremony.requiresRfc) {
      if (!f.rfcRefs.length) {
        emit('RFC_MISSING', 'error', `${f.prdPath} declares no RFC — add an "rfcs:" line naming at least one`,
          { feature: f.name, file: f.prdPath });
      } else {
        for (const ref of f.rfcRefs) {
          if (!rfcs.has(ref)) {
            emit('RFC_MISSING', 'error', `${f.prdPath} references ${ref}, which does not exist`,
              { feature: f.name, file: f.prdPath });
          }
        }
      }
    }

    // ---- G3 DESIGN — presence only; the blueprint a human reads. Due only
    // above light ceremony (M2b) ----
    if (featureCeremony.requiresDesign && !f.hasDesign) {
      emit('DESIGN_MISSING', 'error', `${f.name} has no ${config.documents.design}`,
        { feature: f.name, file: f.designPath });
    }
    if (f.hasDesign && config.docLengthLimits?.design) {
      const lines = lineCount(project.rootDir, f.designPath);
      if (lines > config.docLengthLimits.design) {
        emit('DOC_TOO_LONG', 'warning',
          `${f.designPath} is ${lines} lines, over the ${config.docLengthLimits.design}-line DESIGN ceiling`,
          { feature: f.name, file: f.designPath });
      }
    }
    // M3b, antipattern #6: "the fossil document" — PROOF_STALE applied to a
    // document instead of a proof record. mtime, not git log per file: the
    // same simplicity/precision trade the rest of this engine already makes
    // when git isn't available or the tree is dirty (see isProofStale above).
    // A tolerance window, not a bare ">" comparison, for the same reason
    // isProofStale prefers a git rev when it can: "every modification time
    // becomes now" after a clone or a tarball extraction, and copying a
    // whole tree does not write every file in the same microsecond — real
    // drift happens over hours or days, not milliseconds of copy jitter.
    const DOC_FOSSIL_TOLERANCE_MS = 5 * 60 * 1000;
    if (f.hasDesign) {
      const designMtime = statSync(path.join(project.rootDir, f.designPath)).mtimeMs;
      const mappedFilesForFeature = [...new Set((f.spec?.tasks ?? []).flatMap((t) => t.files))];
      let newestMapped = 0;
      for (const rf of mappedFilesForFeature) {
        const full = path.join(project.rootDir, rf);
        if (existsSync(full)) newestMapped = Math.max(newestMapped, statSync(full).mtimeMs);
      }
      if (newestMapped > designMtime + DOC_FOSSIL_TOLERANCE_MS) {
        emit('DOC_FOSSIL', 'warning',
          `${f.designPath} is older than the code it maps — the code moved and the blueprint did not; a document that lies is worse than no document`,
          { feature: f.name, file: f.designPath });
      }
    }

    // M3b, antipattern #8 (AI-review rule, not one of the six classics): "the
    // documents point at each other, they don't copy" — PRD ← RFC ← DESIGN.
    // Scoped to this one feature's own trio, matching that framing exactly —
    // not a project-wide or cross-feature scan.
    {
      const docs = [];
      if (f.hasPrd) docs.push({ file: f.prdPath, paragraphs: paragraphsOf(project.rootDir, f.prdPath) });
      for (const ref of f.rfcRefs) {
        const entry = rfcs.get(ref);
        if (entry) docs.push({ file: entry.file, paragraphs: paragraphsOf(project.rootDir, entry.file) });
      }
      if (f.hasDesign) docs.push({ file: f.designPath, paragraphs: paragraphsOf(project.rootDir, f.designPath) });

      for (let i = 0; i < docs.length; i++) {
        for (let j = i + 1; j < docs.length; j++) {
          for (const pa of docs[i].paragraphs) {
            for (const pb of docs[j].paragraphs) {
              if (jaccard(pa, pb) >= DUPLICATE_SIMILARITY_THRESHOLD) {
                emit('DUPLICATE_PROSE', 'warning',
                  `${docs[i].file} and ${docs[j].file} share a substantial passage — point at it from one document instead of copying it, or the copy will drift`,
                  { feature: f.name, file: docs[i].file });
              }
            }
          }
        }
      }
    }

    // ---- G4 SPEC — the layer the machine confers: US/AC, ASM/Q, T-xxx ----
    if (!f.hasSpec) {
      emit('SPEC_MISSING', 'error', `${f.name} has no ${config.documents.spec}`, { feature: f.name, file: f.specPath });
      continue;
    }

    if (!f.spec.stories.length) {
      emit('SPEC_WITHOUT_US', 'error', `${f.specPath} contains no user story`, { feature: f.name, file: f.specPath });
    }
    for (const s of f.spec.stories) {
      if (!s.acs.length) {
        emit('US_WITHOUT_AC', 'error', `${s.id} (${s.title}) has no acceptance criterion`,
          { feature: f.name, file: s.file, line: s.line });
      }
    }
    for (const ac of f.spec.acs) {
      if (!ac.complete) {
        emit('AC_INCOMPLETE', 'error',
          `${ac.id} (${ac.title}) is missing its ${ac.missingClauses.join(' and ')} clause`,
          { feature: f.name, file: ac.file, line: ac.line });
      }
      // M3b (AI-review rule): a vague adjective with no number attached is
      // not something a test can check. "responds quickly" fails;
      // "responds in under 300ms" passes. A heuristic, not a proof — false
      // positives are possible, same posture as every other lexical check
      // in this file (ASM_WITHOUT_CODE, PRD_WITH_SOLUTION).
      else if (
        RE_VAGUE_ADJECTIVE.test(ac.title + ' ' + gwtText(ac)) &&
        !RE_HAS_NUMBER.test(ac.title + ' ' + gwtText(ac))
      ) {
        emit('AC_NOT_OBSERVABLE', 'error',
          `${ac.id} (${ac.title}) reads like a feeling, not a measurement — a criterion a test can check names a number ("in under 300ms"), not an adjective ("fast")`,
          { feature: f.name, file: ac.file, line: ac.line });
      }
    }
    for (const ac of f.spec.orphanAcs) {
      emit('AC_OUTSIDE_US', 'error', `${ac.id} appears before any user story`,
        { feature: f.name, file: ac.file, line: ac.line });
    }

    // An assumption or question written as a bare numbered row is recorded but
    // not trackable: nothing can reference it, and it can never be closed.
    if (f.spec.uncodedAssumptions) {
      emit('ASM_WITHOUT_CODE', 'warning',
        `${f.specPath} has ${f.spec.uncodedAssumptions} assumption row(s) numbered instead of coded — use ASM-001 so they can be referenced and closed`,
        { feature: f.name, file: f.specPath });
    }
    if (f.spec.uncodedQuestions) {
      emit('ASM_WITHOUT_CODE', 'warning',
        `${f.specPath} has ${f.spec.uncodedQuestions} question row(s) numbered instead of coded — use Q-001`,
        { feature: f.name, file: f.specPath });
    }
    if (!f.spec.hasAssumptionsSection) {
      emit('SECTION_MISSING', 'error', `${f.specPath} has no Assumptions section — if there are none, write "None." and be suspicious`,
        { feature: f.name, file: f.specPath });
    }
    if (!f.spec.hasQuestionsSection) {
      emit('SECTION_MISSING', 'error', `${f.specPath} has no Open questions section`,
        { feature: f.name, file: f.specPath });
    }
    for (const a of f.spec.assumptions) {
      if (!a.status) {
        emit('STATUS_INVALID', 'error', `${a.id} carries no status — use open, confirmed or invalidated`,
          { feature: f.name, file: a.file, line: a.line });
      }
    }
    for (const q of f.spec.questions) {
      if (!q.status) {
        emit('STATUS_INVALID', 'error', `${q.id} carries no status — use open or answered`,
          { feature: f.name, file: q.file, line: q.line });
      } else if (q.status === 'open') {
        if (q.blocking) {
          emit('Q_BLOCKING_OPEN', 'error',
            `${q.id} is marked blocking and still open — it must be answered before the path is settled`,
            { feature: f.name, file: q.file, line: q.line });
        } else {
          emit('Q_OPEN', 'warning', `${q.id} is still open`,
            { feature: f.name, file: q.file, line: q.line });
        }
      }
      // SCOPE-0.6.0.md §2.3, "a RFC condicional": the machine cannot know
      // whether a decision is a one-way door, but it can know whether anyone
      // was ever asked — so every question must declare it, answered or not,
      // the same unconditional posture STATUS_INVALID already takes toward a
      // missing status. A one-way door left open is DIFFERENT from an
      // ordinary open question: silence on "was this ever answered with a
      // real path recorded" is exactly the loophole this closes.
      if (!q.door) {
        emit('DOOR_UNDECLARED', 'error',
          `${q.id} declares no Door: — is this one-way (needs an RFC) or two-way (fine to proceed without one)?`,
          { feature: f.name, file: q.file, line: q.line });
      } else if (q.door === 'one-way' && q.status === 'open') {
        emit('RFC_REQUIRED', 'error',
          `${q.id} is a one-way door and still open — an irreversible or expensive-to-undo decision needs a real RFC, not a guess`,
          { feature: f.name, file: q.file, line: q.line });
      }
    }
    // An open assumption is a warning while the work runs and an error once
    // the feature claims to be done — the same fact, two postures. Document
    // status still comes from PRD.md: that stays a PRD concern even though
    // the assumption itself moved to SPEC.md.
    const featureDone = ['implemented', 'audited'].includes(f.prd?.status);
    for (const a of f.spec.assumptions) {
      if (a.status === 'open') {
        emit('ASM_OPEN', featureDone ? 'error' : 'warning',
          `${a.id} is still an open assumption${featureDone ? ' in a feature declared done' : ''}`,
          { feature: f.name, file: a.file, line: a.line });
      }
    }

    for (const t of f.spec.tasks) {
      if (!t.statusValid) {
        emit('TASK_STATUS_INVALID', 'error',
          `${t.id} has status "${t.rawStatus ?? 'none'}" — use pending, in-progress, in-test or done`,
          { feature: f.name, file: t.file, line: t.line });
      }
      if (!t.files.length) {
        emit('TASK_WITHOUT_FILES', 'warning',
          `${t.id} declares no files — it can never be parallelized and will run alone`,
          { feature: f.name, file: t.file, line: t.line });
      }
      for (const rf of t.files) {
        if (!existsSync(path.join(project.rootDir, rf))) {
          emit('FILE_MISSING', t.status === 'done' ? 'error' : 'warning',
            `${t.id} maps ${rf}, which does not exist`,
            { feature: f.name, file: t.file, line: t.line });
        }
      }
      for (const ref of t.refs) {
        if (!knownAc.has(ref) && !knownUs.has(ref)) {
          emit('REF_BROKEN', 'error', `${t.id} references ${ref}, which no document defines`,
            { feature: f.name, file: t.file, line: t.line });
        }
      }

      // Proof is granted per CRITERION, so a task whose references reach none
      // of them can never be proven and can never legitimately reach
      // [done]. Its story references resolve, so REF_BROKEN stays quiet
      // and the task looks fine — and the proof check silently drops every one
      // of them, which is an absence of information read as a guarantee. This
      // says out loud what that filter discards.
      if (t.refs.length && !t.refs.some((ref) => knownAc.has(ref))) {
        emit('REF_WITHOUT_AC', 'warning',
          `${t.id} references ${t.refs.join(', ')} — ${t.refs.length > 1 ? 'none of them is' : 'that is not'} ` +
            'a criterion, so nothing here can grant it proof',
          { feature: f.name, file: t.file, line: t.line });
      }
    }
  }

  // ----------------------------------- coverage of criteria by tasks (global)
  const covered = new Set();
  for (const { task } of knownTask.values()) {
    for (const ref of task.refs) {
      if (knownAc.has(ref)) covered.add(ref);
      else if (knownUs.has(ref)) for (const ac of knownUs.get(ref).story.acs) covered.add(ac.id);
    }
  }
  for (const [id, { ac, feature }] of knownAc) {
    if (!covered.has(id)) {
      emit('AC_WITHOUT_TASK', 'warning', `${id} (${ac.title}) is covered by no task`,
        { feature: feature.name, file: ac.file, line: ac.line });
    }
  }

  // ------------------------------------------------ G4/G5 tests and proof
  const testFileSet = new Set(project.testFiles);
  const specTags = project.annotations.specTags.filter((t) => testFileSet.has(t.file));
  const taggedAcs = new Set(specTags.map((t) => t.acId));

  for (const [id, { ac, feature }] of knownAc) {
    if (!taggedAcs.has(id)) {
      emit('AC_WITHOUT_TEST', 'error',
        `${id} (${ac.title}) has no test annotated @spec:${id}`,
        { feature: feature.name, file: ac.file, line: ac.line });
    }
  }
  for (const tag of specTags) {
    if (!knownAc.has(tag.acId)) {
      emit('TEST_ORPHAN', 'error',
        `a test claims @spec:${tag.acId}, which no document defines — the specification moved and the test did not`,
        { file: tag.file, line: tag.line });
    }
  }

  // Proof records are written by M2's verify. Until they exist, proof is simply
  // absent — reported, never assumed.
  for (const f of features) {
    const record = project.verification[f.name];
    const acs = f.spec ? f.spec.acs : [];
    for (const ac of acs) {
      if (!taggedAcs.has(ac.id)) continue; // already reported as AC_WITHOUT_TEST
      const result = record?.results?.[ac.id];
      if (!result || result.status !== 'pass') {
        emit('AC_WITHOUT_PROOF', 'warning',
          `${ac.id} has a test but no PASS proof${result?.status === 'skip' ? ' — the test was SKIPPED, and a skip is never proof' : ''}`,
          { feature: f.name, file: ac.file, line: ac.line });
      }
    }
    if (record?.reporter === 'exitcode') {
      emit('PROOF_WEAK', 'warning',
        `${f.name} was proven only by the runner's global exit code — prefer a per-test reporter`,
        { feature: f.name, file: f.specPath });
    }
    if (record && isProofStale(project, record)) {
      emit('PROOF_STALE', 'warning',
        `${f.name}: code changed after the last proof — run verify again`,
        { feature: f.name, file: f.specPath });
    }
  }

  // A task cannot declare itself done. This is the rule the whole product rests
  // on: "done" is a verdict of the test runner, never a word in a document.
  for (const [id, { task, feature }] of knownTask) {
    if (task.status !== 'done') continue;
    const record = project.verification[feature.name];
    const acRefs = task.refs.filter((r) => knownAc.has(r));
    const proven = acRefs.filter((r) => record?.results?.[r]?.status === 'pass');
    if (acRefs.length === 0 || proven.length < acRefs.length) {
      emit('TASK_DONE_WITHOUT_PROOF', 'error',
        `${id} is [done] but ${acRefs.length ? `${acRefs.length - proven.length} of its ${acRefs.length} criteria have` : 'it references no criterion that has'} no PASS proof`,
        { feature: feature.name, file: task.file, line: task.line });
    }
  }

  // ------------------------------------------------------- orphan source files
  const mappedFiles = new Set();
  for (const { task } of knownTask.values()) for (const rf of task.files) mappedFiles.add(rf);
  for (const src of project.srcFiles) {
    if (!mappedFiles.has(src)) {
      emit('FILE_ORPHAN', 'warning', `${src} is mapped by no task`, { file: src });
    }
  }

  // ------------------------------------------------------------- constitution
  checkPrinciples(project, emit);

  // ------------------------------------------------------- deferrals (M5b)
  // `strict` shows the real state: nothing here runs, so every finding sits
  // at its own severity as if DEFERRALS.md did not exist — the "uma vez por
  // mês" run, not the everyday one (§12.1).
  const deferredSet = new Set();
  if (!strict && project.deferrals?.present) {
    const { maxMatches, maxDays } = config.deferrals;
    const ceilingMs = now.getTime() + maxDays * 24 * 60 * 60 * 1000;

    for (const item of project.deferrals.items) {
      const loc = { file: item.file, line: item.line };
      let valid = true;

      if (!item.owner || !item.reason) {
        emit('DEFERRAL_WITHOUT_OWNER', 'error',
          `${item.id} names no ${!item.owner ? 'Owner' : 'Reason'} — deferred debt with no owner is debt nobody pays`,
          loc);
        valid = false;
      }

      const untilDate = item.until ? parseDeferralDate(item.until) : null;
      if (!item.until) {
        emit('DEFERRAL_WITHOUT_DEADLINE', 'error',
          `${item.id} has no Until: date — a deferral with no deadline deletes the finding with extra steps`,
          loc);
        valid = false;
      } else if (untilDate && untilDate.getTime() > ceilingMs) {
        emit('DEFERRAL_TOO_LONG', 'error',
          `${item.id}'s Until (${item.until}) is more than ${maxDays} days out — renew closer to the deadline instead of deferring past the ceiling`,
          loc);
        valid = false;
      }

      if (!item.finding || !isDeferrable(item.finding)) {
        emit('DEFERRAL_NOT_ELIGIBLE', 'error',
          `${item.id} defers ${item.finding ?? '(no Finding: code)'} — only a finding that belongs to G5 or G6, and is not on the never-deferrable list, can be deferred`,
          loc);
        valid = false;
      }

      if (item.renewals >= 3) {
        emit('DEFERRAL_RENEWED_REPEATEDLY', 'warning',
          `${item.id} has been renewed ${item.renewals} times — this is not deferred anymore, it is accepted; move it to BASELINE.md or BACKLOG.md`,
          loc);
      }

      const expired = untilDate ? untilDate.getTime() < now.getTime() : false;
      if (expired) {
        emit('DEFERRAL_EXPIRED', 'warning',
          `${item.id} expired on ${item.until} — the finding it covered is back at full severity`,
          loc);
      }

      if (!valid || expired) continue;

      const matches = findings.filter(
        (f) => f.code === item.finding && !deferredSet.has(f) && scopeMatches(f, item.scope)
      );
      if (matches.length > maxMatches) {
        emit('DEFERRAL_TOO_BROAD', 'error',
          `${item.id}'s scope "${item.scope}" matches ${matches.length} finding(s), over the ${maxMatches}-match ceiling — deferring this broadly is the same as turning the gate off`,
          loc);
        continue;
      }
      for (const f of matches) {
        f.deferred = true;
        f.deferredBy = item.id;
        deferredSet.add(f);
      }
    }
  }

  const activeFindings = findings.filter((f) => !f.deferred);
  const errors = activeFindings.filter((f) => f.severity === 'error').length;
  const warnings = activeFindings.length - errors;
  const deferredCount = deferredSet.size;

  return {
    findings,
    errors,
    warnings,
    deferredCount,
    summary: {
      features: features.length,
      stories: knownUs.size,
      criteria: knownAc.size,
      tasks: knownTask.size,
      withTest: [...knownAc.keys()].filter((id) => taggedAcs.has(id)).length,
      principles: project.constitution.principles.length,
    },
  };
}
