// The audit engine.
//
// Answers mechanically:
//   "which requirement has no test?"      -> AC_SEM_TESTE
//   "which test points at nothing?"       -> TESTE_ORFAO
//   "which code maps to no task?"         -> ARQUIVO_ORFAO
//   "which principle is decoration?"      -> PRINCIPIO_SEM_VERIFICACAO
//
// Every finding carries a STABLE CODE. The code is the compatibility surface
// for CI and for the page, and per AGENTS.md it is never translated.
//
// Traceability codes are unique PROJECT-WIDE, not per document, so a task in one
// feature's TDD may legally reference a criterion defined in another feature's
// PRD. Reference resolution is therefore global — see RFC D-003.

import { existsSync } from 'fs';
import path from 'path';
import { CI_ESCALATES } from './gates.js';
import { checkPrinciples } from './principles.js';

const RE_SHORT_ID = /^(US|AC|T|ASM|Q|P)-\d{1,2}$/;

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
  const { config, features, scope } = project;

  const emit = (code, severity, message, extra = {}) => {
    const finalSeverity =
      ci && severity === 'warning' && CI_ESCALATES.has(code) ? 'error' : severity;
    findings.push({ code, severity: finalSeverity, message, ...extra });
  };

  for (const err of project.errors) emit('PROJETO_INVALIDO', 'error', err);

  // ---------------------------------------------------------------- G0 scope
  if (!scope.present) {
    emit('SCOPE_AUSENTE', 'error', `${scope.file} not found — the chain starts at the scope`,
      { file: scope.file });
  } else {
    const status = (scope.status || '').toLowerCase();
    if (!status.startsWith('approved') && !status.startsWith('aprovado')) {
      emit('SCOPE_NAO_APROVADO', 'error',
        `scope status is "${scope.status || 'absent'}" — development must not start before it is Approved`,
        { file: scope.file });
    }
    for (const field of scope.placeholders) {
      emit('SCOPE_CAMPO_VAZIO', 'warning', `scope field "${field}" is still a placeholder`,
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
      emit('ID_DUPLICADO', 'error',
        `${id} is defined in ${first.file}:${first.line} and again here`,
        { file: el.file, line: el.line, feature });
    } else {
      seen.set(id, el);
    }
    if (RE_SHORT_ID.test(id)) {
      emit('ID_CURTO', 'warning', `${id} uses fewer than 3 digits — the grammar expects US-001, not US-1`,
        { file: el.file, line: el.line, feature });
    }
  };

  for (const f of features) {
    if (f.prd) {
      for (const s of f.prd.stories) {
        register(s.id, s, f.name);
        knownUs.set(s.id, { story: s, feature: f });
      }
      for (const ac of f.prd.acs) {
        register(ac.id, ac, f.name);
        knownAc.set(ac.id, { ac, feature: f });
      }
    }
    if (f.rfc) {
      for (const item of [...f.rfc.assumptions, ...f.rfc.questions]) register(item.id, item, f.name);
    }
    if (f.tdd) {
      for (const t of f.tdd.tasks) {
        register(t.id, t, f.name);
        knownTask.set(t.id, { task: t, feature: f });
      }
    }
  }

  // -------------------------------------------------------------- per feature
  for (const f of features) {
    // ---- G1 PRD ----
    if (!f.hasPrd) {
      emit('PRD_AUSENTE', 'error', `${f.name} has no ${config.documents.prd}`, { feature: f.name, file: f.prdPath });
    } else {
      if (f.prd.feature && f.prd.feature !== f.name) {
        emit('FEATURE_DIVERGENTE', 'warning',
          `${f.prdPath} declares feature "${f.prd.feature}" but lives in "${f.name}"`,
          { feature: f.name, file: f.prdPath });
      }
      if (!f.prd.stories.length) {
        emit('SPEC_SEM_US', 'error', `${f.prdPath} contains no user story`, { feature: f.name, file: f.prdPath });
      }
      for (const s of f.prd.stories) {
        if (!s.acs.length) {
          emit('US_SEM_AC', 'error', `${s.id} (${s.title}) has no acceptance criterion`,
            { feature: f.name, file: s.file, line: s.line });
        }
      }
      for (const ac of f.prd.acs) {
        if (!ac.complete) {
          emit('AC_INCOMPLETO', 'error',
            `${ac.id} (${ac.title}) is missing its ${ac.missingClauses.join(' and ')} clause`,
            { feature: f.name, file: ac.file, line: ac.line });
        }
      }
      for (const ac of f.prd.orphanAcs) {
        emit('AC_FORA_DE_US', 'error', `${ac.id} appears before any user story`,
          { feature: f.name, file: ac.file, line: ac.line });
      }
    }

    // ---- G2 RFC ----
    if (!f.hasRfc) {
      emit('RFC_AUSENTE', 'error', `${f.name} has no ${config.documents.rfc}`, { feature: f.name, file: f.rfcPath });
    } else {
      for (const d of f.rfc.decisions) {
        const noun = d.dialect === 'create-rfc' ? 'option' : 'alternative';
        if (d.alternatives < 2) {
          emit('DECISAO_SEM_ALTERNATIVA', 'error',
            `${d.id} (${d.title}) records ${d.alternatives} ${noun}(s) — a decision without alternatives is indistinguishable from a habit`,
            { feature: f.name, file: d.file, line: d.line });
        }
        if (!d.decided) {
          emit('DECISAO_SEM_ESCOLHA', 'error',
            d.dialect === 'create-rfc'
              ? `${d.id}: no option is marked recommended and the Outcome still holds the template placeholder — nothing was decided yet`
              : `${d.id} (${d.title}) records no chosen option`,
            { feature: f.name, file: d.file, line: d.line });
        }
      }
      // An assumption written as a bare numbered row is recorded but not
      // trackable: nothing can reference it, and it can never be closed.
      if (f.rfc.uncodedAssumptions) {
        emit('ASM_SEM_CODIGO', 'warning',
          `${f.rfcPath} has ${f.rfc.uncodedAssumptions} assumption row(s) numbered instead of coded — use ASM-001 so they can be referenced and closed`,
          { feature: f.name, file: f.rfcPath });
      }
      if (f.rfc.uncodedQuestions) {
        emit('ASM_SEM_CODIGO', 'warning',
          `${f.rfcPath} has ${f.rfc.uncodedQuestions} question row(s) numbered instead of coded — use Q-001`,
          { feature: f.name, file: f.rfcPath });
      }
      if (!f.rfc.hasAssumptionsSection) {
        emit('SECAO_AUSENTE', 'error', `${f.rfcPath} has no Assumptions section — if there are none, write "None." and be suspicious`,
          { feature: f.name, file: f.rfcPath });
      }
      if (!f.rfc.hasQuestionsSection) {
        emit('SECAO_AUSENTE', 'error', `${f.rfcPath} has no Open questions section`,
          { feature: f.name, file: f.rfcPath });
      }
      for (const a of f.rfc.assumptions) {
        if (!a.status) {
          emit('STATUS_INVALIDO', 'error', `${a.id} carries no status — use aberta, confirmada or invalidada`,
            { feature: f.name, file: a.file, line: a.line });
        }
      }
      for (const q of f.rfc.questions) {
        if (!q.status) {
          emit('STATUS_INVALIDO', 'error', `${q.id} carries no status — use aberta or respondida`,
            { feature: f.name, file: q.file, line: q.line });
        } else if (q.status === 'aberta') {
          if (q.blocking) {
            emit('Q_BLOQUEANTE_ABERTA', 'error',
              `${q.id} is marked blocking and still open — it must be answered before the path is settled`,
              { feature: f.name, file: q.file, line: q.line });
          } else {
            emit('Q_ABERTA', 'warning', `${q.id} is still open`,
              { feature: f.name, file: q.file, line: q.line });
          }
        }
      }
      // An open assumption is a warning while the work runs and an error once
      // the feature claims to be done — the same fact, two postures.
      const featureDone = ['implementada', 'auditada'].includes(f.prd?.status);
      for (const a of f.rfc.assumptions) {
        if (a.status === 'aberta') {
          emit('ASM_ABERTA', featureDone ? 'error' : 'warning',
            `${a.id} is still an open assumption${featureDone ? ' in a feature declared done' : ''}`,
            { feature: f.name, file: a.file, line: a.line });
        }
      }
    }

    // ---- G3 TDD ----
    if (!f.hasTdd) {
      emit('TDD_AUSENTE', 'error', `${f.name} has no ${config.documents.tdd}`, { feature: f.name, file: f.tddPath });
    } else {
      for (const t of f.tdd.tasks) {
        if (!t.statusValid) {
          emit('TASK_STATUS_INVALIDO', 'error',
            `${t.id} has status "${t.rawStatus ?? 'none'}" — use pendente, em-andamento, em-teste or concluida`,
            { feature: f.name, file: t.file, line: t.line });
        }
        if (!t.files.length) {
          emit('TASK_SEM_ARQUIVOS', 'warning',
            `${t.id} declares no files — it can never be parallelized and will run alone`,
            { feature: f.name, file: t.file, line: t.line });
        }
        for (const rf of t.files) {
          if (!existsSync(path.join(project.rootDir, rf))) {
            emit('ARQUIVO_INEXISTENTE', t.status === 'concluida' ? 'error' : 'warning',
              `${t.id} maps ${rf}, which does not exist`,
              { feature: f.name, file: t.file, line: t.line });
          }
        }
        for (const ref of t.refs) {
          if (!knownAc.has(ref) && !knownUs.has(ref)) {
            emit('REF_QUEBRADA', 'error', `${t.id} references ${ref}, which no document defines`,
              { feature: f.name, file: t.file, line: t.line });
          }
        }
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
      emit('AC_SEM_TASK', 'warning', `${id} (${ac.title}) is covered by no task`,
        { feature: feature.name, file: ac.file, line: ac.line });
    }
  }

  // ------------------------------------------------ G4/G5 tests and proof
  const testFileSet = new Set(project.testFiles);
  const specTags = project.annotations.specTags.filter((t) => testFileSet.has(t.file));
  const taggedAcs = new Set(specTags.map((t) => t.acId));

  for (const [id, { ac, feature }] of knownAc) {
    if (!taggedAcs.has(id)) {
      emit('AC_SEM_TESTE', 'error',
        `${id} (${ac.title}) has no test annotated @spec:${id}`,
        { feature: feature.name, file: ac.file, line: ac.line });
    }
  }
  for (const tag of specTags) {
    if (!knownAc.has(tag.acId)) {
      emit('TESTE_ORFAO', 'error',
        `a test claims @spec:${tag.acId}, which no document defines — the specification moved and the test did not`,
        { file: tag.file, line: tag.line });
    }
  }

  // Proof records are written by M2's verify. Until they exist, proof is simply
  // absent — reported, never assumed.
  for (const f of features) {
    const record = project.verification[f.name];
    const acs = f.prd ? f.prd.acs : [];
    for (const ac of acs) {
      if (!taggedAcs.has(ac.id)) continue; // already reported as AC_SEM_TESTE
      const result = record?.results?.[ac.id];
      if (!result || result.status !== 'pass') {
        emit('AC_SEM_PROVA', 'warning',
          `${ac.id} has a test but no PASS proof${result?.status === 'skip' ? ' — the test was SKIPPED, and a skip is never proof' : ''}`,
          { feature: f.name, file: ac.file, line: ac.line });
      }
    }
    if (record?.reporter === 'exitcode') {
      emit('PROVA_FRACA', 'warning',
        `${f.name} was proven only by the runner's global exit code — prefer a per-test reporter`,
        { feature: f.name, file: f.prdPath });
    }
    if (record && isProofStale(project, record)) {
      emit('VERIFY_OBSOLETO', 'warning',
        `${f.name}: code changed after the last proof — run verify again`,
        { feature: f.name, file: f.prdPath });
    }
  }

  // A task cannot declare itself done. This is the rule the whole product rests
  // on: "done" is a verdict of the test runner, never a word in a document.
  for (const [id, { task, feature }] of knownTask) {
    if (task.status !== 'concluida') continue;
    const record = project.verification[feature.name];
    const acRefs = task.refs.filter((r) => knownAc.has(r));
    const proven = acRefs.filter((r) => record?.results?.[r]?.status === 'pass');
    if (acRefs.length === 0 || proven.length < acRefs.length) {
      emit('TASK_CONCLUIDA_SEM_PROVA', 'error',
        `${id} is [concluida] but ${acRefs.length ? `${acRefs.length - proven.length} of its ${acRefs.length} criteria have` : 'it references no criterion that has'} no PASS proof`,
        { feature: feature.name, file: task.file, line: task.line });
    }
  }

  // ------------------------------------------------------- orphan source files
  const mappedFiles = new Set();
  for (const { task } of knownTask.values()) for (const rf of task.files) mappedFiles.add(rf);
  for (const src of project.srcFiles) {
    if (!mappedFiles.has(src)) {
      emit('ARQUIVO_ORFAO', 'warning', `${src} is mapped by no task`, { file: src });
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
