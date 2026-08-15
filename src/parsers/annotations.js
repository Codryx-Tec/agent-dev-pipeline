// Annotation scanner and sandboxed pattern search.
//
// Two jobs, both security- or correctness-sensitive.
//
// 1. Scan the configured globs for `@spec:AC-xxx` and `@principle:P-xxx`. The
//    tag is expected in the TEST TITLE rather than a comment, because a title
//    survives into every runner's reporter output — that is what lets one
//    scanner serve pytest and vitest without knowing either.
//
// 2. Run patterns supplied by the project's CONSTITUTION.md. Those are
//    arbitrary regexes written by a human. `(a+)+$` against the wrong input
//    backtracks catastrophically and would hang the gate forever, so the search
//    runs in a DISPOSABLE SUBPROCESS WITH A HARD TIMEOUT: a pathological
//    pattern degrades into a finding instead of a denial of service. This is a
//    boundary, not an optimisation.

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { walkFiles } from '../util/glob.js';

const RE_SPEC_TAG = /@spec:(AC-\d+)/g;
const RE_PRINCIPLE_TAG = /@principle:(P-\d+)/g;

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.php', '.swift',
  '.md', '.txt', '.sql', '.sh', '.vue', '.svelte', '.yaml', '.yml',
]);

export function scanAnnotations(rootDir, files) {
  const specTags = [];
  const principleTags = [];

  for (const rel of files) {
    const ext = path.extname(rel).toLowerCase();
    if (ext && !TEXT_EXTENSIONS.has(ext)) continue;
    let content;
    try {
      content = readFileSync(path.join(rootDir, rel), 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(RE_SPEC_TAG)) {
        specTags.push({ acId: m[1], file: rel, line: i + 1, text: lines[i].trim() });
      }
      for (const m of lines[i].matchAll(RE_PRINCIPLE_TAG)) {
        principleTags.push({ principleId: m[1], file: rel, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return { specTags, principleTags };
}

const GREP_TIMEOUT_MS = 5000;

const GREP_WORKER = `
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const { rootDir, pattern, files, flags } = JSON.parse(input);
  const { readFileSync } = require('fs');
  const path = require('path');
  let re;
  try { re = new RegExp(pattern, flags || ''); } catch (err) {
    console.log(JSON.stringify({ error: 'invalid regex: ' + pattern + ' (' + err.message + ')', hits: [] }));
    return;
  }
  const hits = [];
  for (const rel of files) {
    let content;
    try { content = readFileSync(path.join(rootDir, rel), 'utf-8'); } catch { continue; }
    const lines = content.split(/\\r?\\n/);
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      if (re.test(lines[i])) hits.push({ file: rel, line: i + 1, text: lines[i].trim() });
    }
  }
  console.log(JSON.stringify({ error: null, hits }));
});
`;

// `flags` is optional and defaults to case-sensitive, matching every
// existing caller (a constitution's `verification(forbidden|required)`
// pattern is written by a human who chooses their own case) — PRD_WITH_
// SOLUTION's vocabulary check is the first caller that needs `i`, since
// prose capitalizes "PostgreSQL" and "postgresql" interchangeably.
export function grepPattern(rootDir, pattern, glob, ignoreGlobs, flags = '') {
  const files = walkFiles(rootDir, { includeGlobs: [glob], ignoreGlobs });

  // Compiling is cheap and safe, and an invalid pattern must be reported even
  // when the glob matches nothing — otherwise a broken principle looks inert
  // rather than broken.
  try {
    new RegExp(pattern, flags);
  } catch (err) {
    return { error: `invalid regex: ${pattern} (${err.message})`, hits: [], files };
  }
  if (files.length === 0) return { error: null, hits: [], files };

  const proc = spawnSync(process.execPath, ['-e', GREP_WORKER], {
    input: JSON.stringify({ rootDir, pattern, files, flags }),
    encoding: 'utf-8',
    timeout: GREP_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (proc.signal || proc.status === null) {
    return {
      error: `regex \`${pattern}\` exceeded ${GREP_TIMEOUT_MS / 1000}s (possible catastrophic backtracking) — simplify the pattern`,
      hits: [],
      files,
    };
  }
  try {
    const out = JSON.parse(proc.stdout);
    return { error: out.error, hits: out.hits, files };
  } catch {
    return { error: `failed to run the pattern check \`${pattern}\``, hits: [], files };
  }
}
