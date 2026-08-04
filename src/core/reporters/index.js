// Reporter adapters: whatever the runner emitted → [{ title, status }].
//
// `status` is exactly one of 'pass' | 'fail' | 'skip'. Everything a runner might
// call pending, todo, xfail or ignored collapses into 'skip', and skip is never
// proof — that collapse is the point, not a simplification. A criterion whose
// test was skipped must look identical to a criterion whose test never ran,
// because it is.
//
// Each adapter is total: given garbage it returns an empty list and an error
// string rather than throwing. A runner that changed its output format should
// produce "I could not read this" and a red gate, never a crash and never —
// worse — an empty result that silently reads as "nothing failed".

import { parseTap } from './tap.js';
import { parseVitestJson } from './vitest.js';
import { parseJUnit } from './junit.js';

export const REPORTERS = {
  tap: { parse: parseTap, perTest: true },
  'vitest-json': { parse: parseVitestJson, perTest: true },
  junit: { parse: parseJUnit, perTest: true },
  // No parsing at all: the runner's exit code is the only signal. Kept because
  // it works with literally any runner, and marked perTest:false so the audit
  // can report PROOF_WEAK on anything proven this way.
  exitcode: { parse: () => ({ tests: [], error: null }), perTest: false },
};

export function reporterNames() {
  return Object.keys(REPORTERS);
}

export function parseWith(reporter, text) {
  const adapter = REPORTERS[reporter];
  if (!adapter) {
    return {
      tests: [],
      error: `unknown reporter "${reporter}" — use one of: ${reporterNames().join(', ')}`,
    };
  }
  try {
    return adapter.parse(text ?? '');
  } catch (err) {
    return { tests: [], error: `could not read ${reporter} output: ${err.message}` };
  }
}
