// DEFERRALS.md parser (M5b, SCOPE-0.6.0.md §12.1 "camada 2").
//
// The mechanism for the honest kind of "living with a real finding": the
// finding does not disappear, a dated, owned DECISION to keep it exists
// instead — same posture as `Door:` on an open question. One file, project-
// wide, optional, owner of the DEF-xxx family — a single file because
// scattered debt is debt nobody sums.
//
// Grammar (hand-written by a human, so it stays close to prose):
//
//   ## DEF-001 — TEST_ORPHAN in test/legacy/
//
//   - Finding: TEST_ORPHAN
//   - Scope: test/legacy/**
//   - Owner: alice
//   - Reason: the old suite leaves with the billing migration
//   - Opened: 2026-08-05
//   - Until: 2026-11-03
//
// Renewing is a SECOND `- Until:` line under the same block, never an edit
// of the first one ("renovação acrescenta linha, não edita a anterior") —
// the file keeps the whole history of a deferral instead of silently
// overwriting it. The LAST `Until:` line is the active deadline; every line
// before it is a past renewal. Three or more renewals is
// DEFERRAL_RENEWED_REPEATEDLY (audit.js): at that point the debt is not
// deferred, it is accepted, and belongs in BASELINE.md or BACKLOG.md instead.

import { lineOf } from '../util/text.js';

const RE_BLOCK_HEADER = /^##\s+(DEF-\d+)\s*(?:—|-)?\s*(.*)$/gm;
const RE_FIELD = (name) => new RegExp(`^-\\s+${name}:\\s*(.+)$`, 'gm');

function fieldValues(block, name) {
  return [...block.matchAll(RE_FIELD(name))].map((m) => m[1].trim());
}

function fieldValue(block, name) {
  return fieldValues(block, name)[0] ?? null;
}

export function parseDeferrals(content, file) {
  if (content == null) return { kind: 'deferrals', file, present: false, items: [] };

  const headers = [...content.matchAll(RE_BLOCK_HEADER)];
  const items = headers.map((m, i) => {
    const id = m[1];
    const title = m[2].trim();
    const start = m.index + m[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    const block = content.slice(start, end);
    const line = lineOf(content, m.index);

    const untilDates = fieldValues(block, 'Until');

    return {
      id,
      title,
      file,
      line,
      finding: fieldValue(block, 'Finding'),
      scope: fieldValue(block, 'Scope'),
      owner: fieldValue(block, 'Owner'),
      reason: fieldValue(block, 'Reason'),
      opened: fieldValue(block, 'Opened'),
      untilDates,
      // The active deadline is always the LAST Until: line — see file header.
      until: untilDates.length ? untilDates[untilDates.length - 1] : null,
      renewals: Math.max(0, untilDates.length - 1),
    };
  });

  return { kind: 'deferrals', file, present: true, items };
}
