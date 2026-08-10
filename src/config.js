// Project configuration.
//
// Everything is defaulted, so the engine runs against a repository that has no
// config file at all — that is what lets `adp audit` be the first command
// anyone ever types. Two filenames are accepted: the tool's own
// `adp.config.json`, and `.spec/spec.config.json`, which Projeto_Agent
// already carries. The tool's own file wins when both exist.

import { readFileSync, existsSync } from 'fs';
import path from 'path';

export const DEFAULT_CONFIG = {
  specDir: '.spec',
  featuresDir: '.spec/features',
  verificationDir: '.spec/verification',
  // RFCs are flat and global, not nested per feature — one RFC can serve
  // several PRDs, and one PRD often needs several (Q-001, SCOPE-0.6.0.md).
  rfcDir: '.spec/rfc',
  constitutionFile: '.spec/CONSTITUTION.md',
  scopeFile: '.spec/SCOPE.md',

  // the four per-feature documents, each owning its own family of codes.
  // PRD is prose (what, for whom, why); RFC owns D-xxx decisions; SPEC owns
  // US-xxx/AC-xxx/ASM-xxx/Q-xxx/T-xxx — "the layer the machine confers";
  // DESIGN is prose (how, in detail), the blueprint a human reads.
  documents: { prd: 'PRD.md', rfc: 'RFC.md', spec: 'SPEC.md', design: 'DESIGN.md' },

  // where @spec / @principle annotations are looked for
  testGlobs: [
    'test/**',
    'tests/**',
    'src/**/*.test.*',
    'src/**/*.spec.*',
    '__tests__/**',
    'backend/tests/**',
    'backend/**/test_*.py',
    'backend/**/*_test.py',
    'frontend/src/**/*.test.*',
    'frontend/src/**/*.spec.*',
  ],
  // implementation files that should be mapped by some task
  srcGlobs: ['src/**', 'backend/app/**', 'frontend/src/**'],
  ignoreGlobs: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.spec/**',
    '.venv/**',
    '__pycache__/**',
    // the worked example is a project of its own; auditing it from here would
    // mix its traceability codes into this repository's
    '.exemplo/**',
  ],

  // M4 — the read-only monitor. Loopback by default and never anything else
  // unless the operator says so: the page has no authentication, so the bind
  // address is the entire boundary.
  port: 7788,
  host: '127.0.0.1',

  // M2 — how proof is obtained
  testCommand: null,
  reporter: 'tap', // tap | vitest-json | junit | exitcode
  reporterOutputFile: null,

  // M6 — background execution
  parallel: { maxParallel: 3, model: null, effort: 'medium' },

  // D-008: local-only is the default; GitHub is a mode, never a requirement
  delivery: 'local-only', // local-only | direct-PR

  // D-007: execution telemetry lives outside the repository
  stateDir: null, // null resolves to <home>/.adp at use time
};

const CONFIG_FILENAMES = ['adp.config.json', '.spec/spec.config.json'];

export function loadConfig(rootDir) {
  for (const name of CONFIG_FILENAMES) {
    const configPath = path.join(rootDir, name);
    if (!existsSync(configPath)) continue;
    let raw;
    try {
      raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (err) {
      // A malformed config is loud. Falling back to defaults here would audit
      // the wrong globs and report a clean run over the wrong files.
      throw new Error(`${name} is not valid JSON: ${err.message}`);
    }
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      documents: { ...DEFAULT_CONFIG.documents, ...(raw.documents || {}) },
      parallel: { ...DEFAULT_CONFIG.parallel, ...(raw.parallel || {}) },
      rootDir,
      configPath,
    };
  }
  return { ...DEFAULT_CONFIG, rootDir, configPath: null };
}
