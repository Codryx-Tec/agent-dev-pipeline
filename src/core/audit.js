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

import { existsSync } from 'fs';
import path from 'path';
import { CI_ESCALATES } from './gates.js';
import { checkPrinciples } from './principles.js';

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
export function isProofStale(project, record) {
  if (record.gitRev && project.gitRev && record.gitDirty === false) {
    return record.gitRev !== project.gitRev;
  }
  if (record.codeMtime == null || project.codeMtime == null) return false;
  return project.codeMtime > record.codeMtime;
}

export function auditProject(project, { ci = false } = {}) {
  const findings = [];
  const { config, features, scope, rfcs } = project;

  const emit = (code, severity, message, extra = {}) => {
    const finalSeverity =
      ci && severity === 'warning' && CI_ESCALATES.has(code) ? 'error' : severity;
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

    // ---- G2 RFC — linked by id, not a fixed sibling file (Q-001) ----
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

    // ---- G3 DESIGN — presence only; the blueprint a human reads ----
    if (!f.hasDesign) {
      emit('DESIGN_MISSING', 'error', `${f.name} has no ${config.documents.design}`,
        { feature: f.name, file: f.designPath });
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

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  return {
    findings,
    errors,
    warnings,
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
