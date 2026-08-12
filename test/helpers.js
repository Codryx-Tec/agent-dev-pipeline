// Fixture builder: a throwaway project on disk, so tests exercise the real
// loader rather than a hand-built object that could drift from it.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';
import { auditProject } from '../src/core/audit.js';
import { evaluateGates } from '../src/core/gates.js';
import { projectCeremony } from '../src/core/ceremony.js';

// A function, not a bare string, since M2c-core: a scope fixture now has to
// say which feature slug(s) it declares in the MVP checklist, or every
// feature using it trips PRD_UNPLACED.
export const approvedScope = (mvp = ['f']) => `# Project Scope

**Scope status:** Approved
**Scope owner:** test

## 3. Features

- **MVP (prioritized):**
${mvp.map((slug) => `  - [ ] ${slug}`).join('\n')}
`;

export const MINIMAL_RFC = `# RFC: t

## Purpose

Support tickets about this take 20 minutes to resolve.

### D-001 — A choice

**Alternatives considered**

1. *One.* first
2. *Two.* second

**Decision: alternative 1 — one.**
`;

// ASM-xxx/Q-xxx moved from RFC.md to SPEC.md in 0.6.0 — see spec.js.
export const MINIMAL_SPEC_TAIL = `## Assumptions

- **ASM-001** — something assumed *(status: confirmed)*

## Open questions

- **Q-001** — something asked *(status: answered)*
`;

export function makeProject(files, configOverrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'adp-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  writeFileSync(
    path.join(root, 'adp.config.json'),
    JSON.stringify({ testGlobs: ['test/**'], srcGlobs: ['src/**'], ...configOverrides })
  );
  return root;
}

export function auditOf(files, { ci = false, config = {} } = {}) {
  const root = makeProject(files, config);
  try {
    const project = loadProject(loadConfig(root));
    const audit = auditProject(project, { ci });
    const ceremony = projectCeremony(project.features);
    return { audit, gates: evaluateGates(audit.findings, { ceremony }), ceremony, project, root };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export const codes = (audit) => audit.findings.map((f) => f.code);
export const has = (audit, code) => codes(audit).includes(code);
export const findingsFor = (audit, code) => audit.findings.filter((f) => f.code === code);
export const gate = (gates, id) => gates.gates.find((g) => g.id === id);
