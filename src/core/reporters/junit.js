// JUnit XML — pytest --junitxml, and most CI-oriented runners.
//
//   <testcase name="..." classname="..."> ... </testcase>
//
// A <failure> or <error> child means failed; <skipped> means skipped; nothing
// means passed. Parsed with regex rather than an XML library on purpose: pulling
// in a parser would be this package's first runtime dependency, spent on reading
// one shallow element. The trade-off is that exotic XML (CDATA in an attribute,
// namespaced tags) is not handled — and that shows up as a read error, which is
// the safe direction.

const RE_CASE = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase\s*>)/g;
const RE_ATTR = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;

function attrs(s) {
  const out = {};
  for (const m of s.matchAll(RE_ATTR)) out[m[1]] = m[2];
  return out;
}

function unescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseJUnit(text) {
  const raw = String(text);
  if (!raw.trim()) return { tests: [], error: 'the reporter produced no output' };

  const tests = [];
  for (const m of raw.matchAll(RE_CASE)) {
    const a = attrs(m[1]);
    const body = m[3] ?? '';
    const name = unescape(a.name ?? '');
    const cls = unescape(a.classname ?? '');

    let status = 'pass';
    if (/<(failure|error)\b/.test(body)) status = 'fail';
    else if (/<skipped\b/.test(body)) status = 'skip';

    // classname first, then name: an annotation may sit on either, and joining
    // them means one substring search finds it wherever the author put it.
    tests.push({ title: [cls, name].filter(Boolean).join(' ').trim(), status });
  }

  return {
    tests,
    error: tests.length ? null : 'no <testcase> elements found — is this JUnit XML?',
  };
}
