// The retroactive 0.4 -> 0.5 codemod.
//
// 0.5.0 renamed every Portuguese engine token to English (CHANGELOG.md,
// "[0.5.0] Breaking") and shipped with no migration — the documented fix was
// "find-and-replace by hand." This is that migration, written after the fact
// so `adp upgrade` has a first entry to chain from.
//
// Scope is `.spec/**/*.md` only. Two things never get touched here, on
// purpose: engine source (a finding code inside `check-preflight.mjs`-style
// scripts is the user's code, not a document) and anything the parsers don't
// actually read — no parser ever reads a finding code back out of a document,
// so that part of this migration is prose fidelity, not a functional fix.
//
// Idempotent by construction: every regex below only matches the OLD,
// Portuguese spelling. A document already in English matches nothing, so a
// second run is a byte-for-byte no-op — that's what check() and apply() both
// rely on instead of a separate "already migrated" flag.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

export const version = '0.5.0';
export const description = 'rename every Portuguese engine token to English (0.4.x -> 0.5.0)';

const TASK_STATUS_MAP = {
  pendente: 'pending',
  'em-andamento': 'in-progress',
  'em-teste': 'in-test',
  concluida: 'done',
};

const DOC_STATUS_MAP = {
  rascunho: 'draft',
  pronta: 'ready',
  'em-implementacao': 'in-implementation',
  implementada: 'implemented',
  auditada: 'audited',
};

// aberta->open covers both ASM-xxx and Q-xxx; confirmada/respondida are
// unambiguous on their own, so this table does not need to know which family
// a given status line belongs to.
const ITEM_STATUS_MAP = {
  aberta: 'open',
  confirmada: 'confirmed',
  invalidada: 'invalidated',
  respondida: 'answered',
};

// Keyed by the normalised (lower-case, single-spaced) label text; values
// already carry the trailing colon the English spelling is written with.
const FIELD_LABEL_MAP = {
  arquivos: 'Files:',
  'lê': 'Reads:',
  le: 'Reads:',
  depende: 'Depends on:',
  'depende de': 'Depends on:',
  notas: 'Notes:',
};

// All 40 finding codes renamed in 0.5.0 (src/core/gates.js's GATES + LABELS,
// cross-checked against CHANGELOG.md's Breaking table).
const FINDING_CODE_MAP = {
  SCOPE_AUSENTE: 'SCOPE_MISSING',
  SCOPE_NAO_APROVADO: 'SCOPE_NOT_APPROVED',
  SCOPE_CAMPO_VAZIO: 'SCOPE_FIELD_EMPTY',
  PRD_AUSENTE: 'PRD_MISSING',
  SPEC_SEM_US: 'SPEC_WITHOUT_US',
  US_SEM_AC: 'US_WITHOUT_AC',
  AC_INCOMPLETO: 'AC_INCOMPLETE',
  AC_FORA_DE_US: 'AC_OUTSIDE_US',
  ID_DUPLICADO: 'ID_DUPLICATE',
  ID_CURTO: 'ID_TOO_SHORT',
  RFC_AUSENTE: 'RFC_MISSING',
  DECISAO_SEM_ALTERNATIVA: 'DECISION_WITHOUT_ALTERNATIVE',
  DECISAO_SEM_ESCOLHA: 'DECISION_WITHOUT_CHOICE',
  SECAO_AUSENTE: 'SECTION_MISSING',
  Q_BLOQUEANTE_ABERTA: 'Q_BLOCKING_OPEN',
  STATUS_INVALIDO: 'STATUS_INVALID',
  ASM_SEM_CODIGO: 'ASM_WITHOUT_CODE',
  TDD_AUSENTE: 'TDD_MISSING',
  AC_SEM_TASK: 'AC_WITHOUT_TASK',
  REF_QUEBRADA: 'REF_BROKEN',
  REF_SEM_CRITERIO: 'REF_WITHOUT_AC',
  TASK_SEM_ARQUIVOS: 'TASK_WITHOUT_FILES',
  TASK_STATUS_INVALIDO: 'TASK_STATUS_INVALID',
  ARQUIVO_INEXISTENTE: 'FILE_MISSING',
  AC_SEM_TESTE: 'AC_WITHOUT_TEST',
  AC_SEM_PROVA: 'AC_WITHOUT_PROOF',
  VERIFY_OBSOLETO: 'PROOF_STALE',
  PROVA_FRACA: 'PROOF_WEAK',
  TESTE_ORFAO: 'TEST_ORPHAN',
  TASK_CONCLUIDA_SEM_PROVA: 'TASK_DONE_WITHOUT_PROOF',
  ASM_ABERTA: 'ASM_OPEN',
  Q_ABERTA: 'Q_OPEN',
  PRINCIPIO_SEM_VERIFICACAO: 'PRINCIPLE_WITHOUT_VERIFICATION',
  PRINCIPIO_VIOLADO: 'PRINCIPLE_VIOLATED',
  NIVEL_INVALIDO: 'LEVEL_INVALID',
  VERIFICACAO_MALFORMADA: 'VERIFICATION_MALFORMED',
  GLOB_SEM_ARQUIVOS: 'GLOB_WITHOUT_FILES',
  ARQUIVO_ORFAO: 'FILE_ORPHAN',
  FEATURE_DIVERGENTE: 'FEATURE_MISMATCH',
  PROJETO_INVALIDO: 'PROJECT_INVALID',
};

function alternation(keys) {
  // Longest first, so e.g. "em-implementacao" is never shadowed by a shorter
  // prefix that happens to also be a key.
  return [...keys].sort((a, b) => b.length - a.length).join('|');
}

const RE_TASK_STATUS = new RegExp(
  `^(##\\s+T-\\d+\\s*[—–-].*\\[)(${alternation(Object.keys(TASK_STATUS_MAP))})(\\]\\s*)$`,
  'gim'
);
const RE_DOC_STATUS = new RegExp(`^(>\\s*status:\\s*)(${alternation(Object.keys(DOC_STATUS_MAP))})\\b`, 'gim');
const RE_ITEM_STATUS = new RegExp(`(\\bstatus:\\s*)(${alternation(Object.keys(ITEM_STATUS_MAP))})\\b`, 'gi');
const RE_FIELD_LABEL = /^(\s*[-*]\s*)(Arquivos|Lê|Le|Depende(?:\s+de)?|Notas):/gim;
const RE_FINDING_CODE = new RegExp(`\\b(${Object.keys(FINDING_CODE_MAP).join('|')})\\b`, 'g');

function rewrite(content) {
  let count = 0;
  let text = content;

  text = text.replace(RE_TASK_STATUS, (_, pre, word, post) => {
    count++;
    return `${pre}${TASK_STATUS_MAP[word.toLowerCase()]}${post}`;
  });
  text = text.replace(RE_DOC_STATUS, (_, pre, word) => {
    count++;
    return `${pre}${DOC_STATUS_MAP[word.toLowerCase()]}`;
  });
  text = text.replace(RE_ITEM_STATUS, (_, pre, word) => {
    count++;
    return `${pre}${ITEM_STATUS_MAP[word.toLowerCase()]}`;
  });
  text = text.replace(RE_FIELD_LABEL, (_, pre, word) => {
    count++;
    return `${pre}${FIELD_LABEL_MAP[word.toLowerCase().replace(/\s+/g, ' ')]}`;
  });
  text = text.replace(RE_FINDING_CODE, (word) => {
    count++;
    return FINDING_CODE_MAP[word];
  });

  return { text, count };
}

function collectMarkdownFiles(specDir) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  };
  walk(specDir);
  return out;
}

/** True once no old token remains in any `.spec/**\/*.md` document. */
export function check(specDir) {
  return collectMarkdownFiles(specDir).every((file) => rewrite(readFileSync(file, 'utf8')).count === 0);
}

/**
 * Apply the rename. Dry-run by default, matching every other write path in
 * this tool: `{ changed: [{file, replacements}], notes: [] }`.
 */
export function apply(specDir, { dryRun = true } = {}) {
  const changed = [];
  for (const file of collectMarkdownFiles(specDir)) {
    const content = readFileSync(file, 'utf8');
    const { text, count } = rewrite(content);
    if (count === 0) continue;
    changed.push({ file: path.relative(specDir, file).split(path.sep).join('/'), replacements: count });
    if (!dryRun) writeFileSync(file, text);
  }
  return { changed, notes: [] };
}
