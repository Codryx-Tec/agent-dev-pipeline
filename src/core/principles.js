// Execute the constitution's declared verifications.
//
// This is the gap Projeto_Agent's own audit.js leaves open, and its P-007 says
// so in writing: "reviewed by hand, not by audit.js ... a companion automated
// check is a reasonable future improvement, not yet built". A principle that is
// declared but never executed is decoration.
//
// Four forms:
//   gate      — a human promise; satisfies "declared", proves nothing
//   test      — a test tagged @principle:P-xxx must exist (and, from M2, pass)
//   forbidden — the pattern must NOT appear in any file matching the glob
//   required  — the pattern MUST appear in at least one file matching the glob

import { grepPattern } from '../parsers/annotations.js';

export function checkPrinciples(project, emit) {
  const { config, constitution, annotations } = project;
  const taggedPrinciples = new Set(annotations.principleTags.map((t) => t.principleId));

  for (const p of constitution.principles) {
    if (!p.levelValid) {
      // An unknown level is treated as MUST and reported — never ignored.
      // Silently downgrading it would let a typo disable a rule.
      emit('LEVEL_INVALID', 'error',
        `${p.id} declares level "${p.rawLevel}" — use [MUST], [SHOULD] or [MAY]; treated as MUST`,
        { file: p.file, line: p.line });
    }

    const enforced = !p.levelValid || p.level === 'MUST';

    if (enforced && p.verifications.length === 0) {
      emit('PRINCIPLE_WITHOUT_VERIFICATION', 'error',
        `${p.id} (${p.title}) is a MUST with no verification declared`,
        { file: p.file, line: p.line });
      continue;
    }
    if (enforced && !p.executable) {
      emit('PRINCIPLE_WITHOUT_VERIFICATION', 'warning',
        `${p.id} (${p.title}) declares only a manual gate — nothing about it is machine-checked`,
        { file: p.file, line: p.line });
    }

    for (const v of p.verifications) {
      if (v.kind === 'gate') continue;

      if (v.malformed) {
        emit('VERIFICATION_MALFORMED', 'error',
          `${p.id} has a malformed ${v.kind} verification: ${v.raw}`,
          { file: p.file, line: p.line });
        continue;
      }

      if (v.kind === 'test') {
        if (!taggedPrinciples.has(v.tag) && enforced) {
          emit('PRINCIPLE_VIOLATED', 'error',
            `${p.id} requires a test tagged @principle:${v.tag} and none exists`,
            { file: p.file, line: p.line });
        }
        continue;
      }

      const { error, hits, files } = grepPattern(
        project.rootDir, v.pattern, v.glob, config.ignoreGlobs
      );

      if (error) {
        emit('VERIFICATION_MALFORMED', 'error', `${p.id}: ${error}`,
          { file: p.file, line: p.line });
        continue;
      }
      if (files.length === 0) {
        // An inert check that looks like a passing one is worse than no check.
        emit('GLOB_WITHOUT_FILES', 'warning',
          `${p.id} checks \`${v.glob}\`, which matches no file — the verification is inert`,
          { file: p.file, line: p.line });
        continue;
      }

      if (v.kind === 'forbidden' && hits.length) {
        for (const hit of hits.slice(0, 10)) {
          emit('PRINCIPLE_VIOLATED', enforced ? 'error' : 'warning',
            `${p.id} (${p.title}): forbidden pattern found — ${hit.text.slice(0, 120)}`,
            { file: hit.file, line: hit.line });
        }
        if (hits.length > 10) {
          emit('PRINCIPLE_VIOLATED', enforced ? 'error' : 'warning',
            `${p.id}: ${hits.length - 10} further occurrence(s) not listed`,
            { file: p.file, line: p.line });
        }
      }
      if (v.kind === 'required' && hits.length === 0) {
        emit('PRINCIPLE_VIOLATED', enforced ? 'error' : 'warning',
          `${p.id} (${p.title}): required pattern \`${v.pattern}\` appears in no file matching \`${v.glob}\``,
          { file: p.file, line: p.line });
      }
    }
  }
}
