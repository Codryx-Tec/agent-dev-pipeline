// `adp report` — the portable viability snapshot, and the SCOPE.md
// `**Decision:**` field it reads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'fs';
import { loadConfig } from '../src/config.js';
import { loadProject } from '../src/core/project.js';
import { buildState } from '../src/server/state.js';
import { renderReportHtml, renderReportText } from '../src/core/report-html.js';
import { makeProject } from './helpers.js';

// makeProject() alone leaves the temp dir on disk (auditOf() in helpers.js
// is the only caller that cleans up); this file needs the project loaded in
// three different shapes (raw project, state, rendered text/html), so it
// wraps the same create-then-remove discipline itself.
function withProject(fileset, fn) {
  const root = makeProject(fileset);
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SCOPE_OK = (decision, docsLanguage) => `# Project Scope

**Scope status:** Approved
**Scope owner:** test
${decision ? `**Decision:** ${decision}\n` : ''}${docsLanguage ? `**Docs language:** ${docsLanguage}\n` : ''}
## 3. Features

- **MVP (prioritized):**
  - [ ] f
`;

const PRD_OK = `# PRD

> rfcs: RFC-001
> signals: multiple-teams

Prose only.
`;

const files = (decision, docsLanguage) => ({
  '.spec/SCOPE.md': SCOPE_OK(decision, docsLanguage),
  '.spec/features/f/PRD.md': PRD_OK,
});

test('an absent Decision line defaults to pending @spec:AC-062', () => {
  withProject(files(null), (root) => {
    const project = loadProject(loadConfig(root));
    assert.equal(project.scope.decision, 'pending');
  });
});

test('go and no-go are read case-insensitively @spec:AC-062', () => {
  for (const [written, expected] of [['GO', 'go'], ['No-Go', 'no-go'], ['pending', 'pending']]) {
    withProject(files(written), (root) => {
      const project = loadProject(loadConfig(root));
      assert.equal(project.scope.decision, expected);
    });
  }
});

test('an unrecognized decision value falls back to pending, never throws @spec:AC-062', () => {
  withProject(files('maybe later'), (root) => {
    const project = loadProject(loadConfig(root));
    assert.equal(project.scope.decision, 'pending');
  });
});

test('an absent Docs language line defaults to English @spec:AC-130', () => {
  withProject(files(null), (root) => {
    const project = loadProject(loadConfig(root));
    assert.equal(project.scope.docsLanguage, 'English');
  });
});

test('a declared Docs language is read back as free text, no fixed vocabulary @spec:AC-130', () => {
  withProject(files(null, 'Portuguese (Brazil)'), (root) => {
    const project = loadProject(loadConfig(root));
    assert.equal(project.scope.docsLanguage, 'Portuguese (Brazil)');
  });
});

test('buildState carries the decision, ceremony and MVP placement @spec:AC-063', () => {
  withProject(files('go'), (root) => {
    const state = buildState(loadConfig(root));
    assert.equal(state.scope.decision, 'go');
    assert.deepEqual(state.scope.mvp, ['f']);
    assert.equal(state.features[0].ceremony.level, 'rfc-first');
    assert.equal(state.features[0].inMvp, true);
    assert.equal(state.backlog.present, false);
  });
});

test('a feature outside the MVP checklist is reported as such, not silently omitted @spec:AC-063', () => {
  withProject(
    {
      '.spec/SCOPE.md': SCOPE_OK('pending').replace('- [ ] f', '- [ ] someone-else'),
      '.spec/features/f/PRD.md': PRD_OK,
    },
    (root) => {
      const state = buildState(loadConfig(root));
      assert.equal(state.features[0].inMvp, false);
    }
  );
});

test('the HTML report is self-contained, with no external reference @spec:AC-064', () => {
  withProject(files('go'), (root) => {
    const html = renderReportHtml(buildState(loadConfig(root)));
    assert.match(html, /<!doctype html>/i);
    assert.equal(/<script\s+src=/i.test(html), false);
    assert.equal(/<link\s+rel="stylesheet"/i.test(html), false);
    assert.equal(/https?:\/\//.test(html), false, 'no external reference of any kind');
  });
});

test('the HTML report never invents an effort or date estimate @spec:AC-064', () => {
  withProject(files('go'), (root) => {
    const html = renderReportHtml(buildState(loadConfig(root)));
    assert.match(html, /does not implement yet/);
    assert.match(html, /Not available/);
  });
});

test('the text report shows the recorded decision and every gate @spec:AC-064', () => {
  withProject(files('no-go'), (root) => {
    const text = renderReportText(buildState(loadConfig(root)));
    assert.match(text, /decision {2}: NO-GO/);
    for (const id of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']) assert.match(text, new RegExp(id));
  });
});
