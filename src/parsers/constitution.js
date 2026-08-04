// Constitution parser — owns P-xxx (principles) and their declared
// verifications.
//
// Grammar:
//   ## P-001 [MUST] Title
//   - verification(gate): free text — reviewed by a human
//   - verification(test): @principle:P-001
//   - verification(forbidden): `regex` in `glob`
//   - verification(required): `regex` in `glob`
//
// Levels are accepted in both vocabularies, because Projeto_Agent uses
// MUST/SHOULD/MAY and the reference engine uses DEVE/RECOMENDADO/PODE.

import { lineOf, blocksBetween, stripNonGrammar, fold } from '../util/text.js';

const RE_PRINCIPLE = /^##\s+(P-\d+)\s*\[([^\]]+)\]\s*(.*)$/gm;
const RE_VERIFICATION = /^\s*[-*]\s*verifica(?:tion|ção|cao)\((gate|test|teste|forbidden|proibido|required|obrigatorio|obrigat[óo]rio)\)\s*:\s*(.+)$/gim;
// `regex` in `glob` — backticks are required on both sides so a pattern
// containing the word "in" cannot be split at the wrong place.
const RE_PATTERN_IN_GLOB = /`([^`]+)`\s+(?:in|em)\s+`([^`]+)`/;
const RE_TEST_TAG = /@principle:(P-\d+)/;

const LEVELS = {
  must: 'MUST',
  deve: 'MUST',
  should: 'SHOULD',
  recomendado: 'SHOULD',
  may: 'MAY',
  pode: 'MAY',
};

const KINDS = {
  gate: 'gate',
  test: 'test',
  teste: 'test',
  forbidden: 'forbidden',
  proibido: 'forbidden',
  required: 'required',
  obrigatorio: 'required',
  obrigatório: 'required',
};

export function parseConstitution(content, file) {
  if (content == null) return { kind: 'constitution', file, principles: [], present: false };
  const scan = stripNonGrammar(content);

  const principles = blocksBetween(scan, [...scan.matchAll(RE_PRINCIPLE)]).map(
    ({ match, start, end }) => {
      // verifications are read from the ORIGINAL text: their patterns and globs
      // live inside backticks, which stripNonGrammar() blanked out for scanning
      const body = content.slice(start, end);
      const rawLevel = fold(match[2]);
      const level = LEVELS[rawLevel] ?? null;

      const verifications = [...body.matchAll(RE_VERIFICATION)].map((v) => {
        const kind = KINDS[fold(v[1])];
        const value = v[2].trim();
        if (kind === 'forbidden' || kind === 'required') {
          const pg = value.match(RE_PATTERN_IN_GLOB);
          return pg
            ? { kind, pattern: pg[1], glob: pg[2], raw: value, malformed: false }
            : { kind, pattern: null, glob: null, raw: value, malformed: true };
        }
        if (kind === 'test') {
          const tag = value.match(RE_TEST_TAG);
          return { kind, tag: tag ? tag[1] : null, raw: value, malformed: !tag };
        }
        return { kind: 'gate', raw: value, malformed: false };
      });

      return {
        id: match[1],
        title: match[3].trim(),
        rawLevel: match[2],
        level,
        levelValid: level !== null,
        file,
        line: lineOf(content, match.index),
        verifications,
        // a gate-only verification is a human promise, not machine-checkable;
        // it satisfies the "declared" requirement but never proves anything
        executable: verifications.some((v) => v.kind !== 'gate'),
      };
    }
  );

  return { kind: 'constitution', file, principles, present: true };
}
