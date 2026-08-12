// The viability report — `adp report`.
//
// A SNAPSHOT, not a live page. `server/server.js`'s renderPage() fetches
// `/api/state` client-side and needs a running server; this bakes the state
// in at generation time, so the file it produces opens with no server, no
// fetch, and no network request — the "hand this to someone, or to another
// tool" artifact the viability-analysis workflow asked for. Same source
// data (server/state.js's buildState()), two renderings: this file, and
// renderReportText() below for the terminal.
//
// What this deliberately does NOT show: an effort or date estimate, or a
// comparison of scenarios. Neither exists yet — that is Function Point
// estimation (SCOPE-0.6.0.md PRD-003), not built. Faking a number here
// would be exactly the "false precision" that document itself warns
// against. The "shape of the work" section shows only counts the engine
// already has for certain, and says in the open why the rest is missing.

import { GATES } from './gates.js';

const MARK = { green: '✔', red: '✘', blocked: '·', 'n/a': '○' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function gateDetail(g) {
  if (g.state === 'blocked') return `blocked by ${g.blockedBy}`;
  if (g.state === 'n/a') return `n/a — ${g.reason}`;
  if (g.state === 'red') return `${g.errors} error(s)${g.warnings ? `, ${g.warnings} warning(s)` : ''}`;
  return g.warnings ? `clean (${g.warnings} warning(s))` : 'clean';
}

function ceremonyDistribution(features) {
  const counts = { light: 0, medium: 0, 'rfc-first': 0, full: 0 };
  for (const f of features) {
    if (f.ceremony) counts[f.ceremony.level] = (counts[f.ceremony.level] ?? 0) + 1;
  }
  return counts;
}

const DECISION_LABEL = { pending: 'pending — no decision recorded yet', go: 'GO', 'no-go': 'NO-GO' };

export function renderReportText(state) {
  const out = [];
  out.push(`viability report — ${state.root}`);
  out.push(`generated : ${state.generatedAt}`);
  out.push(`scope     : ${state.scope.present ? state.scope.status || 'no status' : 'MISSING'}`);
  out.push(`decision  : ${DECISION_LABEL[state.scope.decision] ?? state.scope.decision}`);
  out.push('');
  out.push('gates:');
  for (const g of state.gates) out.push(`  ${MARK[g.state] ?? '?'} ${g.id} ${g.title.padEnd(26)} ${gateDetail(g)}`);
  out.push('');
  out.push('features:');
  for (const f of state.features) {
    const cer = f.ceremony ? `${f.ceremony.level}${f.ceremony.signals.length ? ` (${f.ceremony.signals.join(', ')})` : ''}` : 'n/a';
    out.push(`  ${f.name.padEnd(24)} ceremony: ${cer.padEnd(24)} ${f.inMvp ? 'in MVP' : 'NOT in MVP checklist'}`);
    out.push(`    ${f.counts.stories} stor(ies) · ${f.counts.criteria} criteria (${f.counts.proven} proven) · ${f.counts.tasks} task(s) (${f.counts.done} done)`);
  }
  out.push('');
  out.push(`backlog   : ${state.backlog.present ? `${state.backlog.items} item(s)` : 'none (.spec/BACKLOG.md absent)'}`);
  out.push('');
  const dist = ceremonyDistribution(state.features);
  out.push('shape of the work:');
  out.push(`  ${state.features.length} feature(s) — ceremony: ${Object.entries(dist).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (state.estimate) {
    const e = state.estimate;
    out.push(`  effort: ${e.pf} PF x ${e.rowUsed} (source: ${e.source}) -> low ${e.hours.low}h · likely ${e.hours.likely}h · high ${e.hours.high}h`);
    if (e.calibration) out.push(`  calibration: ${e.calibration} — run \`adp close --hours <n>\` after this feature ships to improve it`);
    out.push('  declared, not counted — the PF figure above is human-entered (`adp estimate --pf`), not machine-counted. Not proof.');
    if (e.lowFit) out.push(`  APF measures ${e.profile.appType} poorly — treat this range as weaker evidence than usual.`);
  } else {
    out.push('  no estimate yet — run `adp profile` then `adp estimate --pf <n>` for a real hours range.');
  }
  out.push('');
  out.push('scenario comparison: not available — needs the automated counting interview, which does not exist yet.');
  return out.join('\n');
}

export function renderReportHtml(state) {
  const dist = ceremonyDistribution(state.features);
  const decisionClass = state.scope.decision === 'go' ? 'go' : state.scope.decision === 'no-go' ? 'nogo' : 'pending';

  const gateRows = state.gates
    .map(
      (g) => `<tr class="g-${g.state.replace('/', '')}"><td>${g.id}</td><td>${esc(g.title)}</td><td>${MARK[g.state] ?? '?'} ${esc(g.state)}</td><td>${esc(gateDetail(g))}</td></tr>`
    )
    .join('\n');

  const featureRows = state.features
    .map((f) => {
      const cer = f.ceremony ? `${esc(f.ceremony.level)}${f.ceremony.signals.length ? ` (${esc(f.ceremony.signals.join(', '))})` : ''}` : 'n/a';
      return `<tr>
        <td>${esc(f.name)}</td>
        <td>${cer}</td>
        <td>${f.inMvp ? 'in MVP' : '<strong>not in MVP checklist</strong>'}</td>
        <td>${f.counts.stories}</td>
        <td>${f.counts.criteria} (${f.counts.proven} proven)</td>
        <td>${f.counts.tasks} (${f.counts.done} done)</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Viability report — ${esc(state.root)}</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.3rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: .3rem; }
  table { width: 100%; border-collapse: collapse; margin-top: .5rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #eee; font-size: .92rem; }
  th { color: #666; font-weight: 600; }
  .meta { color: #555; font-size: .9rem; }
  .decision { display: inline-block; padding: .15rem .6rem; border-radius: 4px; font-weight: 700; }
  .decision.go { background: #d7f5df; color: #146c2e; }
  .decision.nogo { background: #fbdada; color: #9c1f1f; }
  .decision.pending { background: #eee; color: #555; }
  .g-red { color: #9c1f1f; }
  .g-na { color: #888; }
  .note { color: #555; font-size: .9rem; background: #f8f8f8; border-left: 3px solid #ccc; padding: .5rem .75rem; margin-top: .5rem; }
</style>
</head>
<body>
<h1>Viability report</h1>
<p class="meta">${esc(state.root)} — generated ${esc(state.generatedAt)}</p>
<p>Scope: <strong>${esc(state.scope.present ? state.scope.status || 'no status' : 'MISSING')}</strong>
&nbsp; Decision: <span class="decision ${decisionClass}">${esc(DECISION_LABEL[state.scope.decision] ?? state.scope.decision)}</span></p>

<h2>Gates</h2>
<table>
<thead><tr><th>Gate</th><th>Title</th><th>State</th><th>Detail</th></tr></thead>
<tbody>
${gateRows}
</tbody>
</table>

<h2>Features</h2>
<table>
<thead><tr><th>Feature</th><th>Ceremony</th><th>MVP placement</th><th>Stories</th><th>Criteria</th><th>Tasks</th></tr></thead>
<tbody>
${featureRows || '<tr><td colspan="6">none yet</td></tr>'}
</tbody>
</table>

<h2>Backlog</h2>
<p>${state.backlog.present ? `${state.backlog.items} item(s) in .spec/BACKLOG.md` : 'none (.spec/BACKLOG.md absent)'}</p>

<h2>Shape of the work</h2>
<p>${state.features.length} feature(s) — ceremony: ${Object.entries(dist).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}</p>
${
  state.estimate
    ? `<p>Effort: <strong>${state.estimate.pf} PF</strong> × <code>${esc(state.estimate.rowUsed)}</code> (source: ${esc(state.estimate.source)}) &rarr; low <strong>${state.estimate.hours.low}h</strong> · likely <strong>${state.estimate.hours.likely}h</strong> · high <strong>${state.estimate.hours.high}h</strong></p>
       ${state.estimate.calibration ? `<p>Calibration: <strong>${esc(state.estimate.calibration)}</strong> — run <code>adp close --hours &lt;n&gt;</code> after this feature ships to improve it further</p>` : ''}
       <p class="note">Declared, not counted: the PF figure is human-entered (\`adp estimate --pf\`), not machine-counted. Not proof.${state.estimate.lowFit ? ` APF measures ${esc(state.estimate.profile.appType)} poorly — treat this range as weaker evidence than usual.` : ''}</p>`
    : `<p class="note">This is a count, not an estimate. Effort and date numbers need Function Point estimation, which this tool does not implement yet (SCOPE-0.6.0.md PRD-003).</p>`
}

<h2>Scenario comparison</h2>
<p class="note">Not available — comparing alternative scenarios needs the automated counting interview, which this tool does not implement yet. Showing an invented number here would be exactly the false precision this tool exists to avoid.</p>
</body>
</html>
`;
}
