// Vitest / Jest JSON output (`--reporter=json`, or jest `--json`).
//
// Both emit the same shape:
//   { testResults: [ { assertionResults: [ { fullName, title, status } ] } ] }
//
// `fullName` is preferred over `title` because it carries the describe() chain,
// and an annotation may well sit on the describe rather than the it.

const MAP = {
  passed: 'pass',
  failed: 'fail',
  skipped: 'skip',
  pending: 'skip',
  todo: 'skip',
  disabled: 'skip',
};

export function parseVitestJson(text) {
  const raw = String(text).trim();
  if (!raw) return { tests: [], error: 'the reporter produced no output' };

  const data = JSON.parse(raw);
  const files = Array.isArray(data.testResults) ? data.testResults : [];
  const tests = [];

  for (const file of files) {
    const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    for (const a of assertions) {
      tests.push({
        title: String(a.fullName ?? a.title ?? '').trim(),
        // An unknown status is treated as a skip, never as a pass. Guessing
        // upward would grant proof on a word we did not recognise.
        status: MAP[a.status] ?? 'skip',
      });
    }
  }

  return {
    tests,
    error: files.length ? null : 'no testResults in the JSON — wrong reporter?',
  };
}
