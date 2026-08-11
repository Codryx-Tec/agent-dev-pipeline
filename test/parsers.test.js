// Parser tests. The first suites exist because both bugs they describe were
// found in Projeto_Agent's original audit.js, by dogfooding this very document
// chain against it.
//
// US-xxx/AC-xxx/ASM-xxx/Q-xxx/T-xxx moved from prd.js/rfc.js/tdd.js into
// spec.js in 0.6.0 (SPEC.md is "the layer the machine confers" — Q-003 in
// .spec/SCOPE-0.6.0.md). The tests below moved with them; the regexes and
// fixtures are unchanged, only the function under test is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec } from '../src/parsers/spec.js';
import { parsePrd } from '../src/parsers/prd.js';
import { parseRfc } from '../src/parsers/rfc.js';
import { parseDesign } from '../src/parsers/design.js';
import { parseConstitution } from '../src/parsers/constitution.js';
import { parseBacklog } from '../src/parsers/backlog.js';

test('a task heading shown inside a code span is documentation, not a task @spec:AC-011', () => {
  const doc = `# SPEC

| task | \`## T-001 — Title [pending|done]\` then Refs |

## T-005 — The only real task [pending]

- Refs: AC-001
- Files: a.js
`;
  const { tasks } = parseSpec(doc, 'SPEC.md');
  assert.equal(tasks.length, 1, 'the code span must not invent a task');
  assert.equal(tasks[0].id, 'T-005');
});

test('task status comes from the heading line, never from later prose @spec:AC-011', () => {
  const doc = `## T-001 — Last task [pending]

- Refs: AC-001
- Files: a.js

## Migration notes

Tasks marked [done] may fall back to TEST until real tests exist.
`;
  const { tasks } = parseSpec(doc, 'SPEC.md');
  // The block of the last task runs to end of file. Searching it for a status
  // token would read the migration paragraph as this task's own status.
  assert.equal(tasks[0].status, 'pending');
});

test('an unrecognised task status is reported, never silently skipped @spec:AC-011', () => {
  const { tasks } = parseSpec('## T-001 — Done-ish [feito]\n\n- Refs: AC-001\n', 'SPEC.md');
  assert.equal(tasks.length, 1, 'the task must still be visible to the audit');
  assert.equal(tasks[0].statusValid, false);
  assert.equal(tasks[0].rawStatus, 'feito');
});

test('a status written in any case folds to the canonical token @spec:AC-011', () => {
  for (const written of ['DONE', 'Done', 'done', ' done ']) {
    const { tasks } = parseSpec(`## T-001 — x [${written}]\n\n- Refs: AC-001\n`, 'SPEC.md');
    assert.equal(tasks[0].status, 'done', `[${written}] must fold`);
    assert.equal(tasks[0].statusValid, true);
  }
  // The multi-word statuses are hyphenated, and the hyphen is part of the token.
  assert.equal(parseSpec('## T-001 — x [IN-PROGRESS]\n', 'SPEC.md').tasks[0].status, 'in-progress');
});

test('file lists keep spaces inside paths and drop empties @spec:AC-012', () => {
  const doc = '## T-001 — x [pending]\n\n- Refs: AC-001\n- Files: a b/c.js, , d.js\n';
  const { tasks } = parseSpec(doc, 'SPEC.md');
  assert.deepEqual(tasks[0].files, ['a b/c.js', 'd.js']);
});

test('what a task writes, what it reads and what it follows are three claims @spec:AC-045', () => {
  const doc = [
    '## T-004 — Integration [pending]',
    '',
    '- Refs: AC-001',
    '- Files: src/join.js',
    '- Reads: src/a.js, src/b.js',
    '- Depends on: T-001, T-002',
    '',
  ].join('\n');
  const { tasks } = parseSpec(doc, 'SPEC.md');

  assert.deepEqual(tasks[0].files, ['src/join.js']);
  assert.deepEqual(tasks[0].reads, ['src/a.js', 'src/b.js']);
  assert.deepEqual(tasks[0].dependsOn, ['T-001', 'T-002']);
});

test('the English spellings and a lower-case id parse the same @spec:AC-045', () => {
  const doc = [
    '## T-004 — Integration [pending]',
    '',
    '- Files: src/join.js',
    '- Reads: src/a.js',
    '- Depends on: t-001',
    '',
  ].join('\n');
  const { tasks } = parseSpec(doc, 'SPEC.md');
  assert.deepEqual(tasks[0].reads, ['src/a.js']);
  // Upper-cased because ids are compared: a `Depends on: t-001` matching nothing
  // would drop the constraint, and a dropped constraint is invisible until the
  // run produces the wrong result.
  assert.deepEqual(tasks[0].dependsOn, ['T-001']);
});

test('a task declaring neither reads nor dependencies gets empty lists @spec:AC-045', () => {
  const { tasks } = parseSpec('## T-001 — x [pending]\n\n- Files: a.js\n', 'SPEC.md');
  assert.deepEqual(tasks[0].reads, []);
  assert.deepEqual(tasks[0].dependsOn, []);
});

test('a criterion body stops at the next story, not at the next criterion only @spec:AC-006', () => {
  const doc = `### US-001 — first

#### AC-001 — only clause here

- **Given** a
- **When** b
- **Then** c

### US-002 — second

#### AC-002 — incomplete

- **Given** a
`;
  const spec = parseSpec(doc, 'SPEC.md');
  assert.equal(spec.acs[0].complete, true);
  assert.equal(spec.acs[1].complete, false);
  assert.deepEqual(spec.acs[1].missingClauses, ['when', 'then']);
});

test('both English and Portuguese clause keywords are accepted @spec:AC-006', () => {
  const doc = `### US-001 — x

#### AC-001 — y

- **Dado** a
- **Quando** b
- **Então** c
`;
  assert.equal(parseSpec(doc, 'SPEC.md').acs[0].complete, true);
});

test('a criterion before the first story is flagged as orphan @spec:AC-006', () => {
  const doc = `#### AC-001 — loose

- **Given** a
- **When** b
- **Then** c

### US-001 — later
`;
  const spec = parseSpec(doc, 'SPEC.md');
  assert.equal(spec.orphanAcs.length, 1);
});

test('PRD.md reports its own feature and status, and owns no stories or criteria @spec:AC-001', () => {
  const doc = '> feature: greet\n> status: draft\n\n## Context\n\nWhat this solves.\n';
  const prd = parsePrd(doc, 'PRD.md');
  assert.equal(prd.kind, 'prd');
  assert.equal(prd.feature, 'greet');
  assert.equal(prd.status, 'draft');
  assert.equal('stories' in prd, false, 'PRD.md no longer owns stories');
  assert.equal('acs' in prd, false, 'PRD.md no longer owns acceptance criteria');
});

test('PRD.md declares which RFCs it links, comma-separated @spec:AC-007', () => {
  const doc = '> feature: greet\n> status: draft\n> rfcs: RFC-001, rfc-002\n';
  assert.deepEqual(parsePrd(doc, 'PRD.md').rfcs, ['RFC-001', 'RFC-002']);
});

test('an empty "rfcs:" field never swallows the prose on a later line @spec:AC-007', () => {
  // A regex anchored with \s* instead of [ \t]* would cross the blank line
  // after an empty field and capture the next paragraph as if it were an id.
  const doc = '> feature: greet\n> status: draft\n> rfcs:\n\nThis is prose, not an RFC id.\n';
  assert.deepEqual(parsePrd(doc, 'PRD.md').rfcs, []);
});

test('an absent BACKLOG.md parses as present:false with no items, never an error @spec:AC-061', () => {
  const backlog = parseBacklog(null, 'BACKLOG.md');
  assert.equal(backlog.present, false);
  assert.deepEqual(backlog.items, []);
});

test('BACKLOG.md reads bullet and numbered items as plain prose @spec:AC-061', () => {
  const doc = '## Product\n\n- a public API for reading progress\n\n## Technical\n\n1. CSV export of the hours ledger\n';
  const backlog = parseBacklog(doc, 'BACKLOG.md');
  assert.equal(backlog.present, true);
  assert.deepEqual(
    backlog.items.map((i) => i.text),
    ['a public API for reading progress', 'CSV export of the hours ledger']
  );
  assert.ok(backlog.items.every((i) => i.taggedCode === null));
});

test('an item that already carries a real tracking code is flagged, not silently accepted @spec:AC-061', () => {
  const doc = '- extend AC-002 to cover refunds\n';
  const backlog = parseBacklog(doc, 'BACKLOG.md');
  assert.equal(backlog.items[0].taggedCode, 'AC-002');
});

test('an example wrapped in an HTML comment is documentation, not a real item @spec:AC-061', () => {
  const doc = '<!--\n- one item per line, plain prose:\n  - example item\n-->\n\n- a real item\n';
  const backlog = parseBacklog(doc, 'BACKLOG.md');
  assert.deepEqual(
    backlog.items.map((i) => i.text),
    ['a real item']
  );
});

test('DESIGN.md reports its feature and status, with no structure beyond that @spec:AC-001', () => {
  const doc = '> feature: greet\n> status: draft\n\n## 1. Shape of the solution\n';
  const design = parseDesign(doc, 'DESIGN.md');
  assert.equal(design.kind, 'design');
  assert.equal(design.feature, 'greet');
  assert.equal(design.status, 'draft');
});

test('only the numbered list under the alternatives marker counts @spec:AC-007', () => {
  const doc = `### D-001 — x

Some steps we followed:

1. did this
2. did that

**Decision: alternative 1 — x.**
`;
  // The numbered list is prose, not a list of alternatives. Counting every
  // numbered list in the block would let unrelated steps satisfy the rule.
  assert.equal(parseRfc(doc, 'RFC.md').decisions[0].alternatives, 0);
});

test('a question marked blocking is a distinct field, not a text convention @spec:AC-008', () => {
  const doc = `## Assumptions

- **ASM-001** — a *(status: open)*

## Open questions

- **Q-001** — a *(status: open — **blocking**)*
- **Q-002** — b *(status: open)*
`;
  const spec = parseSpec(doc, 'SPEC.md');
  assert.equal(spec.questions[0].blocking, true);
  assert.equal(spec.questions[1].blocking, false);
  assert.equal(spec.assumptions[0].status, 'open');
});

test('principle levels are read in both vocabularies @spec:AC-029', () => {
  const doc = `## P-001 [MUST] a

- verification(gate): manual

## P-002 [DEVE] b

- verification(forbidden): \`secret\` in \`src/**\`

## P-003 [WHATEVER] c
`;
  const { principles } = parseConstitution(doc, 'CONSTITUTION.md');
  assert.equal(principles[0].level, 'MUST');
  assert.equal(principles[1].level, 'MUST');
  assert.equal(principles[2].levelValid, false);
});

test('pattern and glob are read from inside backticks @spec:AC-030', () => {
  const doc = '## P-001 [MUST] a\n\n- verification(forbidden): `password\\s*=` in `src/**/*.py`\n';
  const v = parseConstitution(doc, 'CONSTITUTION.md').principles[0].verifications[0];
  assert.equal(v.kind, 'forbidden');
  assert.equal(v.pattern, 'password\\s*=');
  assert.equal(v.glob, 'src/**/*.py');
  assert.equal(v.malformed, false);
});

test('a gate-only principle is declared but not executable @spec:AC-029', () => {
  const doc = '## P-001 [MUST] a\n\n- verification(gate): reviewed by hand\n';
  assert.equal(parseConstitution(doc, 'CONSTITUTION.md').principles[0].executable, false);
});

// ---- dialect B: documents produced by the `create-rfc` skill ----

const CREATE_RFC = `# RFC: Choose a queue

## Assumptions

| # | Assumption | Owner | Confidence | Invalidation Trigger |
|---|------------|-------|------------|----------------------|
| ASM-001 | traffic stays under 10k req/s *(status: open)* | @ana | High | projections change |
| 2 | the team has Q2 capacity | @bob | Medium | roadmap changes |

## Decision Criteria

| Criterion | Weight |
|---|---|
| operational cost | High |

## Options Considered

### Option 1: Managed queue ⭐ (Recommended)

**Pros**: no operations
**Cons**: vendor lock-in

### Option 2: Self-hosted

**Pros**: control
**Cons**: we carry the pager

## Outcome

**Decision**: Option 1 was chosen
`;

test('an RFC from the create-rfc skill is read natively @spec:AC-007', () => {
  const rfc = parseRfc(CREATE_RFC, 'RFC.md');
  assert.equal(rfc.dialect, 'create-rfc');
  const d = rfc.decisions[0];
  assert.equal(d.alternatives, 2, 'the Option headings are the alternatives');
  assert.equal(d.decided, true);
  assert.equal(d.outcomeRecorded, true);
});

test('a template placeholder in Outcome is not a decision @spec:AC-007', () => {
  // The upstream template ships this line verbatim. Accepting it would mean
  // every freshly generated RFC passes the gate having decided nothing.
  const doc = CREATE_RFC
    .replace('**Decision**: Option 1 was chosen', '**Decision**: [Option X was chosen / rejected / deferred]')
    .replace(' ⭐ (Recommended)', '');
  const d = parseRfc(doc, 'RFC.md').decisions[0];
  assert.equal(d.decided, false);
});

test('a single option is still not a decision @spec:AC-007', () => {
  const doc = CREATE_RFC.replace(/### Option 2: Self-hosted[\s\S]*?(?=## Outcome)/, '');
  assert.equal(parseRfc(doc, 'RFC.md').decisions[0].alternatives, 1);
});

test('assumptions are read from a table as well as from bullets @spec:AC-008', () => {
  // CREATE_RFC's Assumptions/Options/Outcome content is representative of what
  // a SPEC.md produced by the create-rfc-adjacent workflow looks like —
  // parseSpec extracts only what it owns (assumptions) and ignores the rest.
  const spec = parseSpec(CREATE_RFC, 'SPEC.md');
  assert.equal(spec.assumptions.length, 1);
  assert.equal(spec.assumptions[0].id, 'ASM-001');
  assert.equal(spec.assumptions[0].status, 'open');
});

test('a numbered assumption row is counted as uncoded, not silently dropped @spec:AC-008', () => {
  // It is written down but cannot be referenced, tracked or closed — so it is
  // reported rather than quietly accepted.
  assert.equal(parseSpec(CREATE_RFC, 'SPEC.md').uncodedAssumptions, 1);
});

test('confidence is not mapped onto status @spec:AC-008', () => {
  const doc = CREATE_RFC.replace(' *(status: open)*', '');
  // "High confidence" does not mean "confirmed". Missing status stays missing.
  assert.equal(parseSpec(doc, 'SPEC.md').assumptions[0].status, null);
});

// The grammar is documented inside the documents it governs. Every file `adp new`
// scaffolds opens with an HTML comment showing the shapes, and those examples
// were parsed as real elements — so a brand-new project failed G2 on a blocking
// question that existed only in the instructions explaining how to write one.
// Found by running the tool on a fresh project rather than on .exemplo, whose
// comments had long since been deleted.

test('the grammar shown in an HTML comment is documentation, not an element @spec:AC-008', () => {
  const doc = [
    '# SPEC: thing',
    '',
    '<!--',
    'GRAMMAR:',
    '  - **ASM-001** — text *(status: open|confirmed)*',
    '  - **Q-001** — text *(status: open)*  add **blocking** if it gates the path',
    '-->',
    '',
    '## Assumptions',
    '',
    '- **ASM-010** — a real assumption *(status: confirmed)*',
    '',
    '## Open questions',
    '',
    '- **Q-010** — a real question *(status: answered)*',
  ].join('\n');

  const parsed = parseSpec(doc, 'SPEC.md');
  assert.deepEqual(parsed.assumptions.map((a) => a.id), ['ASM-010']);
  assert.deepEqual(parsed.questions.map((q) => q.id), ['Q-010']);
  // The one that actually broke G2: `blocking` inside the comment made the
  // engine believe the path was gated by a question nobody had written.
  assert.equal(parsed.questions.filter((q) => q.blocking).length, 0);
});

test('blanking a comment does not move the lines after it @spec:AC-008', () => {
  // Findings point at file:line. A strip that removed the comment instead of
  // blanking it would report every element below at the wrong line, which is
  // worse than not reporting it — it sends you somewhere else in the file.
  //
  // Asserted as a difference rather than an absolute, because the absolute
  // would also encode where this parser chooses to anchor a block, and that is
  // a separate question from whether stripping moved anything.
  const tail = ['## Assumptions', '', '- **ASM-020** — real *(status: open)*'];
  const without = parseSpec(['# SPEC: thing', '', ...tail].join('\n'), 'SPEC.md');
  const withComment = parseSpec(
    ['# SPEC: thing', '', '<!--', 'two', 'lines', '-->', '', ...tail].join('\n'),
    'SPEC.md'
  );
  // Five lines of comment were inserted, so the element moved down by exactly five.
  assert.equal(withComment.assumptions[0].line - without.assumptions[0].line, 5);
});
