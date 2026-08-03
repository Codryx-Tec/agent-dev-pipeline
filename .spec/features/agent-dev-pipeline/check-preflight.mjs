// Pre-flight check of the agent-dev-pipeline document chain.
// Enforces, by hand, exactly the G1/G2/G3 rules the future engine will own.
import { readFileSync } from 'fs';

const DIR = new URL('.', import.meta.url).pathname;
const prd = readFileSync(`${DIR}PRD.md`, 'utf-8');
const rfc = readFileSync(`${DIR}RFC.md`, 'utf-8');
const tdd = readFileSync(`${DIR}TDD.md`, 'utf-8');

const findings = [];
const F = (code, msg) => findings.push(`${code.padEnd(26)} ${msg}`);

// ---------- G1: PRD ----------
const stories = [...prd.matchAll(/^### (US-\d{3}) — (.+)$/gm)].map((m) => ({ id: m[1], title: m[2], idx: m.index }));
const acs = [...prd.matchAll(/^#### (AC-\d{3}) — (.+)$/gm)].map((m) => ({ id: m[1], title: m[2], idx: m.index }));

const seen = new Map();
for (const el of [...stories, ...acs]) {
  if (seen.has(el.id)) F('ID_DUPLICADO', `${el.id} defined twice in PRD.md`);
  seen.set(el.id, el);
}

// every story owns at least one criterion (criterion between this story and the next)
for (let i = 0; i < stories.length; i++) {
  const from = stories[i].idx;
  const to = i + 1 < stories.length ? stories[i + 1].idx : prd.length;
  const owned = acs.filter((a) => a.idx > from && a.idx < to);
  if (!owned.length) F('US_SEM_AC', `${stories[i].id} has no acceptance criterion`);
}

// every criterion has a complete Given/When/Then
const acBlocks = prd.split(/^#### AC-/m).slice(1);
for (const block of acBlocks) {
  const id = 'AC-' + block.slice(0, 3);
  for (const [clause, re] of [['Given', /- \*\*Given\*\*/], ['When', /- \*\*When\*\*/], ['Then', /- \*\*Then\*\*/]]) {
    if (!re.test(block)) F('AC_INCOMPLETO', `${id} is missing its ${clause} clause`);
  }
}

// ---------- G2: RFC ----------
const decisions = [...rfc.matchAll(/^### (D-\d{3}) — (.+)$/gm)].map((m) => ({ id: m[1], idx: m.index }));
for (let i = 0; i < decisions.length; i++) {
  const from = decisions[i].idx;
  const to = i + 1 < decisions.length ? decisions[i + 1].idx : rfc.length;
  const body = rfc.slice(from, to);
  const alts = (body.match(/^\d+\. \*/gm) || []).length;
  if (alts < 2) F('DECISAO_SEM_ALTERNATIVA', `${decisions[i].id} records ${alts} alternative(s), needs 2+`);
  if (!/\*\*Decision: /.test(body)) F('DECISAO_SEM_ESCOLHA', `${decisions[i].id} records no decision line`);
}
const asms = [...rfc.matchAll(/^- \*\*(ASM-\d{3})\*\*/gm)].map((m) => m[1]);
const qs = [...rfc.matchAll(/^- \*\*(Q-\d{3})\*\*/gm)].map((m) => m[1]);
for (const list of [asms, qs]) {
  const dup = list.filter((id, i) => list.indexOf(id) !== i);
  for (const d of dup) F('ID_DUPLICADO', `${d} defined twice in RFC.md`);
}
for (const section of ['## Assumptions', '## Open questions']) {
  if (!rfc.includes(section)) F('SECAO_AUSENTE', `RFC.md is missing "${section}"`);
}
// every assumption and question carries a status
for (const m of rfc.matchAll(/^- \*\*((?:ASM|Q)-\d{3})\*\*(.*)$/gm)) {
  const tail = rfc.slice(m.index, rfc.indexOf('\n- **', m.index + 5) === -1 ? m.index + 900 : rfc.indexOf('\n- **', m.index + 5));
  if (!/status:\s*(aberta|confirmada|invalidada|respondida)/.test(tail)) F('STATUS_INVALIDO', `${m[1]} carries no recognized status`);
}

// ---------- G3: TDD ----------
const tasks = [...tdd.matchAll(/^## (T-\d{3}) — (.+?) \[(pendente|em-andamento|em-teste|concluida)\]$/gm)]
  .map((m) => ({ id: m[1], title: m[2], status: m[3], idx: m.index }));
const rawTaskHeads = [...tdd.matchAll(/^## (T-\d{3})/gm)].length;
if (rawTaskHeads !== tasks.length) F('TASK_STATUS_INVALIDO', `${rawTaskHeads - tasks.length} task heading(s) carry no valid status`);

const tSeen = new Set();
const knownAc = new Set(acs.map((a) => a.id));
const knownUs = new Set(stories.map((s) => s.id));
const covered = new Set();

for (let i = 0; i < tasks.length; i++) {
  const t = tasks[i];
  if (tSeen.has(t.id)) F('ID_DUPLICADO', `${t.id} defined twice in TDD.md`);
  tSeen.add(t.id);
  const to = i + 1 < tasks.length ? tasks[i + 1].idx : tdd.length;
  const body = tdd.slice(t.idx, to);

  const refsLine = body.match(/^- Refs:\s*(.+)$/m);
  const filesLine = body.match(/^- Arquivos:\s*(.+)$/m);
  if (!refsLine) { F('REF_QUEBRADA', `${t.id} declares no Refs`); continue; }
  if (!filesLine) F('TASK_SEM_ARQUIVOS', `${t.id} declares no file list — will never be parallelized`);

  for (const ref of refsLine[1].split(',').map((r) => r.trim())) {
    if (knownAc.has(ref)) covered.add(ref);
    else if (knownUs.has(ref)) {
      const si = stories.findIndex((s) => s.id === ref);
      const from = stories[si].idx;
      const end = si + 1 < stories.length ? stories[si + 1].idx : prd.length;
      acs.filter((a) => a.idx > from && a.idx < end).forEach((a) => covered.add(a.id));
    } else F('REF_QUEBRADA', `${t.id} references ${ref}, which no document defines`);
  }
}

for (const ac of knownAc) if (!covered.has(ac)) F('AC_SEM_TASK', `${ac} is covered by no task`);

// ---------- verdict ----------
console.log(`documents : PRD ${stories.length} stories / ${acs.length} criteria · RFC ${decisions.length} decisions / ${asms.length} assumptions / ${qs.length} questions · TDD ${tasks.length} tasks`);
console.log(`coverage  : ${covered.size}/${knownAc.size} acceptance criteria referenced by a task`);
if (findings.length) {
  console.log(`\nFAILED — ${findings.length} finding(s):`);
  findings.forEach((f) => console.log('  ' + f));
  process.exitCode = 1;
} else {
  console.log('\nOK — G1, G2 and G3 rules satisfied (exit 0)');
}
