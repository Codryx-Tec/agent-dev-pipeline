// Glob matching and a physical directory walk, with zero dependencies.
//
// The walk starts from each glob's STATIC PREFIX rather than from the root.
// Globs do no I/O of their own, so without this a pattern like
// `../other-repo/src/**` would match nothing: the walker would never visit a
// directory outside the root to offer it a path to test.

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` crosses directories and also matches zero of them, so
        // `src/**/*.js` matches `src/a.js` as well as `src/deep/a.js`.
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

export function anyGlobMatch(rel, regexps) {
  return regexps.some((re) => re.test(rel));
}

// Everything before the first wildcard, cut at the last slash.
// 'src/**' -> 'src' | 'src/**/*.test.*' -> 'src' | '*.md' -> ''
export function staticDirOf(glob) {
  const wildcard = glob.search(/[*?]/);
  const prefix = wildcard === -1 ? glob : glob.slice(0, wildcard);
  const slash = prefix.lastIndexOf('/');
  return slash === -1 ? '' : prefix.slice(0, slash);
}

export function walkFiles(rootDir, { includeGlobs, ignoreGlobs }) {
  const include = includeGlobs.map(globToRegExp);
  const ignore = (ignoreGlobs || []).map(globToRegExp);
  const found = new Set();

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not a crash; it is simply not scanned
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(rootDir, full).split(path.sep).join('/');
      if (anyGlobMatch(rel, ignore)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && anyGlobMatch(rel, include)) found.add(rel);
    }
  }

  const roots = new Set(includeGlobs.map((g) => path.resolve(rootDir, staticDirOf(g))));
  for (const root of roots) walk(root);
  return [...found].sort();
}

// Most recent modification time across a set of files, in ms. Used to detect
// that code moved after the last recorded proof (VERIFY_OBSOLETO).
export function latestMtime(rootDir, files) {
  let latest = 0;
  for (const rel of files) {
    try {
      const { mtimeMs } = statSync(path.join(rootDir, rel));
      if (mtimeMs > latest) latest = mtimeMs;
    } catch {
      // a file that vanished between the walk and the stat is reported
      // elsewhere as ARQUIVO_INEXISTENTE, not swallowed here
    }
  }
  return latest;
}

export function readIfExists(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
