// TAP 13/14 — what `node --test --test-reporter=tap` and most runners emit.
//
//   ok 1 - a passing test
//   not ok 2 - a failing test
//   ok 3 - a skipped test # SKIP reason
//
// Two details that are easy to get wrong and both matter here.
//
// A trailing `# SKIP` or `# TODO` directive turns an `ok` line into a NON-result.
// TAP says a skipped test reports `ok`, so a parser that only looks at ok/not ok
// records a skip as a pass — which is exactly the lie this tool exists to stop.
//
// And a `not ok` inside a subtest block is reported again by its parent, so
// counting every line would double-count. We take lines at any indentation but
// key results by title, and the caller matches by annotation, so a repeat is
// idempotent rather than additive.

const RE_LINE = /^\s*(not ok|ok)\s+(\d+)\s*(?:-\s*)?(.*)$/;
const RE_DIRECTIVE = /#\s*(SKIP|TODO)\b/i;

export function parseTap(text) {
  const tests = [];
  let sawPlanOrTest = false;

  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(RE_LINE);
    if (!m) continue;
    sawPlanOrTest = true;

    const okness = m[1] === 'ok';
    let title = m[3] ?? '';

    // A directive lives after the description, separated by a #. Strip it from
    // the title so the annotation matcher sees the same text a human would.
    const directive = title.match(RE_DIRECTIVE);
    if (directive) title = title.slice(0, directive.index).trim();

    tests.push({
      title: title.trim(),
      status: directive ? 'skip' : okness ? 'pass' : 'fail',
    });
  }

  return {
    tests,
    error: sawPlanOrTest ? null : 'no TAP result lines found — is the runner emitting TAP?',
  };
}
