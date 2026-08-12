// Command dispatch, in three cost rings.
//
// Ring 1 needs neither config nor project (help, version).
// Ring 2 needs only the config (gates --list).
// Ring 3 loads and parses the whole repository (audit, gates, status).
//
// The rings matter because an agent calls this CLI many times in one session,
// and most of those calls must not pay for a full walk of the repository.

import { loadConfig } from './config.js';
import { loadProject } from './core/project.js';
import { auditProject } from './core/audit.js';
import { evaluateGates, GATES, allMappedCodes } from './core/gates.js';
import { projectCeremony } from './core/ceremony.js';
import { renderTerminal, renderJson, renderGates, renderPrompt } from './core/report.js';
import { initProject, newFeature, newRfc, renderReport, AGENT_SKILL_DIRS, PAYLOAD_DIR } from './core/init.js';
import { verifyPayload, renderIntegrity } from './core/integrity.js';
import { checkTrust, grantTrust, revokeTrust, renderRefusal, storePath, TRUST_ENV } from './core/trust.js';
import { startMonitor } from './server/server.js';
import { buildState } from './server/state.js';
import { renderReportHtml, renderReportText } from './core/report-html.js';
import { runVerification, writeRecords, summarise, VerifyRefused, makeLaneTestRunner } from './core/verify.js';
import { buildPlan, renderPlan } from './core/plan.js';
import { runLane, mergeLane, isGitRepo, cleanupLane, cleanWorktrees, listOurWorktrees } from './core/executor.js';
import { rerunLane } from './core/rerun.js';
import { makeAgentRunner, describeAgentCommand } from './core/agent.js';
import { progress, prune, append, read } from './core/ledger.js';
import { buildResume, renderResume, saveCheckpoint, clearCheckpoint } from './core/resume.js';
import { VERSION } from './version.js';
import {
  planUpgrade,
  applyUpgrade,
  renderUpgrade,
  renderApplied,
  loadLockfile,
  describeVersionDrift,
} from './core/upgrade.js';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import {
  profilePath,
  estimateJsonPath,
  loadProfile,
  loadHoursTable,
  loadEstimate,
  computeEstimate,
  renderEstimateMd,
  renderEstimateCsv,
  APP_TYPES,
  FAMILIARITY_LEVELS,
} from './core/estimate.js';
import {
  loadClosures,
  appendClosure,
  recordClosure,
  recalibrateRow,
  calibrationLabel,
  saveHoursTable,
} from './core/closure.js';

const HELP = `agent-dev-pipeline — the specification that stays true

usage: adp <command> [options]

  init [--agent <name>]     scaffold .spec/ here and install the agent skill
  new <feature> [--signals <list>]
                            create PRD.md and SPEC.md; DESIGN.md too if the
                            ceremony matrix says it is due (see --signals)
  new --rfc <slug>          create a new decision record at .spec/rfc/RFC-NNN-<slug>.md
  status                    what exists and where the work stands
  report [--html <path>] [--json]
                            a portable viability snapshot — gates, ceremony,
                            MVP/backlog, the recorded decision, the estimate if one exists
  profile [--stack <s>] [--familiarity <l>] [--app-type <t>] [--brownfield] [--tests]
                            declare the stack/team profile that adp estimate reads
  estimate --pf <n> [--csv]
                            hours = declared Function Points x the profile's table row;
                            never proof — PF count is human-declared, not auto-counted
  close --hours <n> [--note "<s>"]
                            record the real hours a feature took; recalibrates the
                            table row adp estimate last used toward what happened
  audit [--ci] [--json]     evaluate every gate and report the findings
  gates [--list] [--json]   the seven gates and their state, without the findings
  prompt [<gate>]           the paste-ready text for a red gate
  verify [--background]     run the project's tests and record what they prove
  verify --status           how the last background verification is doing
  plan                      show the execution lanes, without running anything
  run [--lane <id>] [--yes] [--allow-edits] [--no-lane-tests]
                            execute pending tasks in isolated git worktrees
  rerun <lane> [--yes] [--allow-edits] [--no-lane-tests]
                            re-run one lane, leaving merged work alone
  clean [--force]           remove worktrees whose work is already merged
  resume                    where the work stands — read this first in a new session
  checkpoint --note "<s>"   record what you were doing, for the next session
  monitor [--port <n>]      serve the read-only page for this project
  doctor                    verify this copy of the tool against its manifest
  upgrade [--apply] [--only-migrations] [--json]
                            compare .spec/.adp-install.json against the current
                            payload; dry-run unless --apply is passed
  trust [--revoke] [--yes]  approve this project's test command for execution
  version | help

options:
  --agent <name>  ${Object.keys(AGENT_SKILL_DIRS).join(' | ')} | none  (init; auto-detected otherwise)
  --project <s>   project name written into SCOPE.md (init)
  --owner <s>     scope owner written into SCOPE.md (init)
  --minimal       install only .spec/ and the adp skill (init)
  --no-skills     skip the extra skills, keep adp (init)
  --no-roles      skip the role agents and hooks (init)
  --no-docs       skip docs/ (init)
  --no-memory     skip the .spec memory files (init)
  --no-agents-md  skip AGENTS.md (init)
  --rfc           create a decision record instead of a feature (new)
  --signals <list>  comma-separated: multiple-teams, hard-to-reverse,
                    money-or-pii, new-tech, large-estimate (new) — decides
                    the ceremony level: which of RFC/DESIGN are due
  --apply         write what upgrade would otherwise only report (upgrade)
  --only-migrations  run pending .spec/** migrations without touching payload files (upgrade)
  --ci            escalate the softer findings to errors (use this in a pipeline)
  --json          machine-readable output
  --html <path>   write the viability snapshot as a self-contained file (report)
  --stack <s>     free text, e.g. "node" (profile)
  --familiarity <l>  ${FAMILIARITY_LEVELS.join(' | ')} (profile)
  --app-type <t>  ${APP_TYPES.join(' | ')} (profile) — APF measures the last three poorly
  --brownfield    existing codebase, not a fresh one (profile)
  --tests         the codebase already has automated tests (profile)
  --pf <n>        declared Function Point count (estimate) — never machine-counted
  --hours <n>     real hours a feature took (close) — the one field nothing else supplies
  --csv           print CSV instead of Markdown (estimate)
  --port <n>      port for the monitor (default 7788)
  --host <addr>   bind address for the monitor (default 127.0.0.1, loopback)
  --yes           skip the confirmation prompt (trust, run, rerun)
  --lane <id>     execute only this lane (run)
  --allow-edits   let the agent write to the worktree unasked (run, rerun)
  --no-lane-tests skip the approved test command after each task (run, rerun)
  --note <s>      what the session was doing (checkpoint), or what surprised you /
                  what you'd do differently (close) — stored, not auto-written to
                  BEST_PRACTICES.md; same flag name, unrelated meaning per command
  --next <s>      what it intended to do next (checkpoint)
  --clear         forget the recorded note (checkpoint)
  --no-merge      leave lanes on their branches instead of merging back (run)
  --revoke        withdraw a previously granted approval (trust)

exit code: 0 when every gate is clean, otherwise 1..7 for G0..G6 — the number
IS the first gate that failed.

init and new never overwrite: they create only what is missing and tell you
what they kept, so re-running them is always safe.`;

// One-line prompt with no dependency. readline/promises would pull in more
// surface than a single question is worth.
function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => {
      process.stdin.pause();
      resolve(String(d));
    });
    process.stdin.resume();
  });
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [key, value] = a.slice(2).split('=');
      flags[key] = value ?? (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true);
    } else positional.push(a);
  }
  return { flags, positional };
}

export async function run(argv) {
  const { flags, positional } = parseFlags(argv);
  const [command] = positional;
  const rootDir = process.cwd();

  // ---- ring 1 ----
  if (!command || command === 'help' || flags.help) {
    console.log(HELP);
    return 0;
  }
  if (command === 'version') {
    console.log(`agent-dev-pipeline ${VERSION}`);
    return 0;
  }

  // ---- ring 2 ----
  const config = loadConfig(rootDir);

  // `doctor` checks the TOOL, not the project it is standing in — deliberately.
  // Files installed into a project are meant to be edited (that is why init
  // never overwrites), so comparing them to the manifest would report a user's
  // own work as tampering, and a check that cries wolf is one people learn to
  // skip. It needs `config` (ring 2, not ring 1) only to find the project's own
  // lockfile for the version-drift warning below — still far short of a full
  // project load.
  if (command === 'doctor') {
    const result = verifyPayload(PAYLOAD_DIR);
    console.log(`agent-dev-pipeline ${VERSION}`);
    console.log(`payload           : ${PAYLOAD_DIR}`);
    console.log(renderIntegrity(result, { payloadDir: PAYLOAD_DIR }));
    if (result.status === 'ok') {
      console.log('');
      console.log('This proves the payload matches the manifest SHIPPED WITH IT.');
      console.log('To check that the package itself came from its stated source:');
      console.log('  npm audit signatures');
    }
    // Silent when there is no lockfile at all: a 0.4.x project pre-dating this
    // feature is not "drifted," it is simply unmeasured, and `adp upgrade`
    // itself already handles that case — doctor should not nag about
    // something it cannot quantify.
    const drift = describeVersionDrift(loadLockfile(rootDir, config), VERSION);
    if (drift) {
      console.log('');
      console.log(`WARNING: this project was installed by agent-dev-pipeline ${drift.from}; this copy is ${drift.to}.`);
      console.log('  adp upgrade            (dry-run — shows what would change)');
      console.log('  adp upgrade --apply    (writes it)');
    }
    return result.status === 'failed' ? 2 : 0;
  }

  if (command === 'upgrade') {
    const payload = verifyPayload(PAYLOAD_DIR);
    const plan = planUpgrade(rootDir, config);
    if (plan.status === 'no-manifest') {
      console.error('error: no MANIFEST.json in this copy of the tool — nothing to compare against.');
      console.error('  expected when running from a working tree before `node scripts/build-manifest.js` has run.');
      return 2;
    }
    if (payload.status === 'failed') {
      // Same refusal as init: an upgrade would install content nothing
      // verified, which is worse than doing nothing.
      console.error(renderIntegrity(payload, { payloadDir: PAYLOAD_DIR }));
      console.error('\nupgrade refused to write anything.');
      return 2;
    }

    if (flags.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(renderUpgrade(plan));
    }

    if (!flags.apply) {
      console.log('');
      console.log('DRY RUN — nothing was written. Re-run with --apply to write.');
      return 0;
    }

    const applied = applyUpgrade(rootDir, config, plan, { onlyMigrations: Boolean(flags['only-migrations']) });
    if (!flags.json) {
      console.log('');
      console.log(renderApplied(applied));
    }
    return 0;
  }

  // init and new deliberately run BEFORE the project is loaded: a folder with
  // no .spec/ is exactly the case they exist for, and paying for a full walk of
  // the repository to scaffold three files would be absurd.
  if (command === 'init') {
    const report = initProject(rootDir, {
      agent: typeof flags.agent === 'string' ? flags.agent : undefined,
      project: typeof flags.project === 'string' ? flags.project : undefined,
      owner: typeof flags.owner === 'string' ? flags.owner : undefined,
      minimal: Boolean(flags.minimal),
      noSkills: Boolean(flags['no-skills']),
      noRoles: Boolean(flags['no-roles']),
      noDocs: Boolean(flags['no-docs']),
      noMemory: Boolean(flags['no-memory']),
      noAgents: Boolean(flags['no-agents-md']),
    });
    console.log(renderReport(report, { title: `agent-dev-pipeline initialised in ${rootDir}` }));
    console.log('');
    console.log('next:');
    console.log('  1. fill in .spec/SCOPE.md and set its status to Approved   (opens gate G0)');
    console.log('  2. adp new <feature> [--signals <list>]                (creates PRD, SPEC, maybe DESIGN)');
    console.log('  3. adp status                                          (see where you are)');
    return 0;
  }

  if (command === 'new') {
    try {
      // `--rfc <slug>` parses like `--project <s>`/`--owner <s>`: the next
      // token IS the flag's value, so the slug never reaches `positional[1]`.
      if (flags.rfc !== undefined) {
        if (typeof flags.rfc !== 'string') {
          console.error('error: --rfc needs a slug: adp new --rfc <slug>');
          return 2;
        }
        const report = newRfc(rootDir, flags.rfc, { rfcDir: config.rfcDir });
        console.log(renderReport(report, { title: `${report.id} scaffolded` }));
        return 0;
      }
      const name = positional[1];
      const signals = typeof flags.signals === 'string' ? flags.signals.split(',').map((s) => s.trim()) : [];
      const report = newFeature(rootDir, name, { featuresDir: config.featuresDir, rfcDir: config.rfcDir, signals });
      console.log(renderReport(report, { title: `feature "${name}" scaffolded` }));
      console.log('');
      console.log('next: write the stories and criteria in SPEC.md, then run `adp status`');
      return 0;
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 2;
    }
  }

  // Ring 2. `testCommand` comes out of a file in the repository, so executing it
  // is consent-gated: nothing from the repo runs until a human has read the
  // exact string. The record lives in the state directory OUTSIDE the project —
  // inside, a hostile repository would ship its own approval.
  if (command === 'trust') {
    if (flags.revoke) {
      const had = revokeTrust(rootDir, config);
      console.log(had ? `approval withdrawn for ${rootDir}` : `no approval was recorded for ${rootDir}`);
      return 0;
    }

    const testCommand = config.testCommand;
    if (!testCommand) {
      console.log('this project declares no testCommand — nothing to approve');
      console.log(`(set one in ${config.configPath ?? 'adp.config.json'})`);
      return 0;
    }

    const check = checkTrust(rootDir, testCommand, config);
    if (check.trusted && check.reason === 'stored') {
      console.log('already approved, and unchanged since:');
      console.log(`  ${testCommand}`);
      console.log(`\nrecorded in ${storePath(config)}`);
      return 0;
    }

    console.log('About to approve this command for execution by `verify`:');
    console.log('');
    console.log(`  ${testCommand}`);
    console.log('');
    console.log(`It comes from ${config.configPath ?? 'the project config'}, a file in this repository.`);
    if (check.reason === 'changed') {
      console.log(`It REPLACES a command you approved earlier: ${check.previous}`);
    }
    console.log('Approving binds to this exact text; changing it asks again.');
    console.log('');

    if (!flags.yes) {
      // Refuse rather than prompt into a void. A confirmation nobody can answer
      // is not a confirmation, and auto-approving when stdin is not a terminal
      // would hand every CI job and every wrapper script a silent yes.
      if (!process.stdin.isTTY) {
        console.error('refusing to approve without confirmation: stdin is not a terminal.');
        console.error(`use --yes deliberately, or set ${TRUST_ENV}=1 in CI.`);
        return 2;
      }
      const answer = await ask('type the word yes to approve: ');
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('not approved.');
        return 1;
      }
    }

    const where = grantTrust(rootDir, testCommand, config);
    console.log(`approved. recorded in ${where}`);
    return 0;
  }

  // Ring 2 for startup; the state is built per request, not now. `monitor` is
  // the only command that does not return — it is a server, and its exit is the
  // user pressing Ctrl-C.
  if (command === 'monitor') {
    const port = flags.port ? Number(flags.port) : undefined;
    if (flags.port && !Number.isInteger(port)) {
      console.error(`error: --port expects a number, got "${flags.port}"`);
      return 2;
    }
    let started;
    try {
      started = await startMonitor(config, { port, host: typeof flags.host === 'string' ? flags.host : undefined });
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    const url = `http://${started.host === '0.0.0.0' ? 'localhost' : started.host}:${started.port}/`;
    console.log(`agent-dev-pipeline monitor — READ ONLY`);
    console.log('');
    console.log(`  ${url}`);
    console.log('');
    console.log(`watching : ${rootDir}`);
    console.log('This server has no write endpoints. It reads your documents and');
    console.log('shows the gates; it cannot change anything in your project.');
    if (started.host !== '127.0.0.1' && started.host !== '::1') {
      console.log('');
      console.log(`WARNING: bound to ${started.host}, not loopback. There is no`);
      console.log('authentication — anyone who can reach this address sees your specs.');
    }
    console.log('');
    console.log('Ctrl-C to stop.');

    await new Promise((resolve) => {
      const stop = () => {
        console.log('\nmonitor stopped.');
        started.server.close(() => resolve());
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
    return 0;
  }

  if (command === 'gates' && flags.list) {
    for (const g of GATES) console.log(`${g.id}  ${g.title.padEnd(26)} ${g.codes.join(', ')}`);
    return 0;
  }

  // Neither `profile` nor `estimate` needs the full project walk — both read
  // and write a couple of small JSON files under config.specDir. Ring 2.
  if (command === 'profile') {
    const p = profilePath(rootDir, config);
    const existing = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
    const appType = typeof flags['app-type'] === 'string' ? flags['app-type'] : existing.appType;
    const familiarity = typeof flags.familiarity === 'string' ? flags.familiarity : existing.familiarity;
    if (appType && !APP_TYPES.includes(appType)) {
      console.error(`error: --app-type must be one of: ${APP_TYPES.join(', ')}`);
      return 2;
    }
    if (familiarity && !FAMILIARITY_LEVELS.includes(familiarity)) {
      console.error(`error: --familiarity must be one of: ${FAMILIARITY_LEVELS.join(', ')}`);
      return 2;
    }
    const profile = {
      stack: typeof flags.stack === 'string' ? flags.stack : existing.stack ?? 'unknown',
      familiarity: familiarity ?? 'delivered',
      appType: appType ?? 'business-crud',
      brownfield: flags.brownfield !== undefined ? Boolean(flags.brownfield) : Boolean(existing.brownfield),
      hasTests: flags.tests !== undefined ? Boolean(flags.tests) : Boolean(existing.hasTests),
      declaredAt: new Date().toISOString(),
    };
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(profile, null, 2) + '\n');
    console.log(`written ${path.relative(rootDir, p)}`);
    console.log(JSON.stringify(profile, null, 2));
    return 0;
  }

  if (command === 'estimate') {
    if (typeof flags.pf !== 'string' || !Number.isFinite(Number(flags.pf))) {
      console.error('error: --pf needs a number: adp estimate --pf <n>');
      return 2;
    }
    const pf = Number(flags.pf);
    const profile = loadProfile(rootDir, config);
    if (!profile.declared) {
      console.error('note: no profile declared — run `adp profile` first; using the generic default for now.');
    }
    const hoursTable = loadHoursTable(rootDir, config);
    if (!hoursTable) {
      console.error('error: no .spec/metrics/hours-per-fp.json — run `adp init` first (it seeds one).');
      return 2;
    }
    let estimate;
    try {
      estimate = computeEstimate({ pf, profile, hoursTable });
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    const projectName = path.basename(rootDir);
    if (flags.csv) {
      console.log(renderEstimateCsv(estimate, projectName).trimEnd());
      return 0;
    }
    const md = renderEstimateMd(estimate, projectName);
    const estimatePath = path.join(rootDir, config.specDir ?? '.spec', 'ESTIMATE.md');
    const estimateJsonFile = estimateJsonPath(rootDir, config);
    mkdirSync(path.dirname(estimatePath), { recursive: true });
    writeFileSync(estimatePath, md);
    writeFileSync(estimateJsonFile, JSON.stringify(estimate, null, 2) + '\n');
    console.log(md);
    console.log(`wrote ${path.relative(rootDir, estimatePath)}`);
    return 0;
  }

  if (command === 'close') {
    if (typeof flags.hours !== 'string' || !Number.isFinite(Number(flags.hours))) {
      console.error('error: --hours needs a number: adp close --hours <n>');
      return 2;
    }
    const hours = Number(flags.hours);
    const note = typeof flags.note === 'string' ? flags.note : null;
    const estimate = loadEstimate(rootDir, config);
    if (!estimate) {
      console.error('note: no .spec/metrics/estimate.json — run `adp estimate --pf <n>` first for a deviation to report.');
      console.error('recording the hours alone.');
    }

    let closure;
    try {
      closure = recordClosure({ hours, note, estimate });
    } catch (err) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    appendClosure(rootDir, config, closure);
    console.log(`recorded : ${hours}h` + (closure.deviationPct !== null ? ` (estimate said ${closure.estimate.likely}h — ${closure.deviationPct > 0 ? '+' : ''}${closure.deviationPct}%)` : ''));

    if (closure.rowUsed && closure.observedHoursPerFp !== null) {
      const hoursTable = loadHoursTable(rootDir, config);
      if (hoursTable) {
        const idx = hoursTable.findIndex((r) => r.profile === closure.rowUsed);
        if (idx !== -1) {
          const priorClosures = loadClosures(rootDir, config)
            .filter((c) => c.rowUsed === closure.rowUsed && c.observedHoursPerFp !== null)
            .map((c) => c.observedHoursPerFp);
          const updatedRow = recalibrateRow(hoursTable[idx], priorClosures);
          hoursTable[idx] = updatedRow;
          saveHoursTable(rootDir, config, hoursTable);
          console.log(`table    : ${closure.rowUsed} updated — ${calibrationLabel(updatedRow.observations)} (${updatedRow.observations} observation(s))`);
        }
      }
    }

    if (note) {
      console.log('');
      console.log('note recorded. If this taught you something worth repeating, add it to');
      console.log('.spec/BEST_PRACTICES.md by hand — a pattern earns a place there after it');
      console.log('has worked more than once, which a single closure cannot establish alone.');
    }
    return 0;
  }

  // ---- ring 3 ----
  const project = loadProject(config);
  const audit = auditProject(project, { ci: Boolean(flags.ci) });
  const ceremony = projectCeremony(project.features);
  const evaluation = evaluateGates(audit.findings, { ceremony });

  // Ring 3, and the only command that executes anything from the repository.
  if (command === 'verify' && flags.status) {
    // Acompanhamento for a detached run. Built from the ledger, never from the
    // child's output — the same rule the orchestrator follows for workers.
    const { events } = read(config);
    const verifies = events.filter((e) => String(e.type ?? '').startsWith('verify-'));
    const last = verifies[verifies.length - 1];
    if (!last) {
      console.log('no verification has been recorded yet.');
      return 0;
    }
    const started = verifies.filter((e) => e.type === 'verify-started').pop();
    const age = started ? Math.round((Date.now() - new Date(started.at).getTime()) / 1000) : null;

    if (last.type === 'verify-started') {
      console.log(`running  — started ${age}s ago (pid ${last.pid ?? '?'})`);
      console.log(`command  : ${last.command}`);
      console.log('');
      console.log('this is read from the event ledger, not from the runner output.');
      return 0;
    }
    console.log(`${last.type === 'verify-done' ? 'finished' : 'failed'} — ${last.at}`);
    if (last.proven != null) console.log(`proven   : ${last.proven} / ${last.total} criteria`);
    if (last.error) console.log(`error    : ${last.error}`);
    console.log('next: adp audit');
    return last.type === 'verify-done' ? 0 : 1;
  }

  if (command === 'verify' && flags.background) {
    // Detached, because a suite that takes minutes should not hold a terminal
    // hostage. Synchronous stays the DEFAULT: a fast suite finishing in front of
    // you is better feedback than a job id.
    const { spawn } = await import('child_process');
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('../bin/adp.js', import.meta.url)), 'verify'],
      { cwd: rootDir, detached: true, stdio: 'ignore', env: process.env }
    );
    child.unref();
    append(config, {
      type: 'verify-started',
      pid: child.pid,
      command: config.testCommand,
    });
    console.log(`verification started in the background (pid ${child.pid}).`);
    console.log('');
    console.log('  adp verify --status     how it is doing');
    console.log('  adp audit               once it has finished');
    return 0;
  }

  if (command === 'verify') {
    let result;
    try {
      result = runVerification(project, config);
    } catch (err) {
      if (err instanceof VerifyRefused) {
        append(config, { type: 'verify-failed', error: err.reason });
        console.error(err.message);
        return 2;
      }
      throw err;
    }

    if (result.parseError) {
      console.error(`could not read the ${result.reporter} output: ${result.parseError}`);
      console.error('');
      console.error('No proof was recorded. Output that cannot be read is not a passing run —');
      console.error('recording proof here would be inventing it.');
      append(config, { type: 'verify-failed', error: result.parseError });
      if (result.stderr.trim()) {
        console.error('');
        console.error('the runner said:');
        console.error(result.stderr.trim().split('\n').slice(-15).join('\n'));
      }
      return 2;
    }

    const written = writeRecords(project, config, result);
    const s = summarise(project, written);
    append(config, {
      type: result.exitCode === 0 && s.failed === 0 ? 'verify-done' : 'verify-failed',
      proven: s.proven, total: s.total, failed: s.failed, skipped: s.skipped,
      durationMs: result.durationMs,
    });

    console.log(`test command : ${result.command}`);
    console.log(`reporter     : ${result.reporter}${result.perTest ? '' : '  (no per-test data — weak proof)'}`);
    console.log(`exit code    : ${result.exitCode}   in ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log('');
    console.log(`proven       : ${s.proven} / ${s.total} criteria`);
    if (s.failed) console.log(`FAILED       : ${s.failed}`);
    if (s.skipped) console.log(`skipped      : ${s.skipped}   (a skip is never proof)`);
    if (s.unproven - s.failed - s.skipped > 0) {
      console.log(`no test ran  : ${s.unproven - s.failed - s.skipped}`);
    }
    console.log('');
    for (const w of written) console.log(`  wrote ${w.file}`);
    console.log('');
    console.log('next: adp audit');

    // The exit code reflects the RUN, not the audit. A suite that failed must
    // not exit 0 just because proof was written for the tests that did pass.
    return result.exitCode === 0 && s.failed === 0 ? 0 : 1;
  }

  if (command === 'clean') {
    if (!isGitRepo(rootDir)) {
      console.error('error: not a git repository — there are no worktrees to clean.');
      return 2;
    }
    const existing = listOurWorktrees(rootDir, config);
    if (!existing.length) {
      console.log('nothing to clean: no worktrees from this tool.');
      return 0;
    }
    const { removed, kept } = cleanWorktrees(project, config, { force: Boolean(flags.force) });
    for (const w of removed) console.log(`removed  ${w.branch ?? '(detached)'}  ${w.path}`);
    for (const w of kept) console.log(`KEPT     ${w.branch ?? '(detached)'}  — ${w.reason}`);
    if (kept.length && !flags.force) {
      console.log('');
      console.log('Unmerged lanes were kept: their branches are the only place that work');
      console.log('exists. Merge or re-run them, or use --force to discard them.');
    }
    return 0;
  }

  // ---- background execution ----
  if (command === 'plan' || command === 'run' || command === 'rerun') {
    const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const plan = buildPlan(project, config, { runId });

    if (command === 'plan') {
      if (flags.json) console.log(JSON.stringify(plan, null, 2));
      else console.log(renderPlan(plan));
      return 0;
    }

    if (!isGitRepo(rootDir)) {
      console.error('error: lanes are git worktrees, and this is not a git repository.');
      console.error('  run `git init` first — without it there is nothing to isolate work in.');
      return 2;
    }

    // A dirty tree makes "the captain's working tree is untouched" unverifiable,
    // and a merge into it can fail in ways that are painful to unpick.
    const { execSync } = await import('child_process');
    let dirty = '';
    try {
      dirty = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
    } catch { /* handled by isGitRepo above */ }
    if (dirty && !flags.yes) {
      console.error('error: the working tree has uncommitted changes.');
      console.error('  Commit or stash them first. Lanes merge back into this tree, and');
      console.error('  a conflict against uncommitted work is the worst kind to unpick.');
      return 2;
    }

    const lanes = flags.lane
      ? plan.lanes.filter((l) => l.id === flags.lane)
      : plan.lanes;

    if (command === 'rerun') {
      const laneId = positional[1];
      if (!laneId) {
        console.error('error: rerun needs a lane id — see `adp plan`');
        return 2;
      }
      if (!plan.lanes.some((l) => l.id === laneId)) {
        console.error(`error: no lane "${laneId}" in the current plan.`);
        console.error(`  the plan has: ${plan.lanes.map((l) => l.id).join(', ') || '(none)'}`);
        console.error('  note that the plan is recomputed from the documents, so a lane id');
        console.error('  from an earlier run may no longer exist.');
        return 2;
      }
    }

    if (!lanes.length && command === 'run') {
      console.log('nothing to run: no pending task declares a file list.');
      if (plan.sequential.length) {
        console.log('');
        console.log('these are pending but cannot be parallelised:');
        for (const t of plan.sequential) console.log(`  ${t.id}  ${t.reason}`);
      }
      return 0;
    }

    // CONSENT. `run` invokes an AI that writes code and whose work gets
    // committed. The agent command comes out of the project's config, same as
    // testCommand — and unlike a test run, the blast radius is the repository.
    // Granting write access is a separate decision from starting a run, so it is
    // a separate flag and it is named in the consent text. Without it the agent
    // is invoked in whatever mode it defaults to, which for every harness worth
    // trusting means it must ask before writing — and a headless process has
    // nobody to ask. That produces a lane that does nothing, reports nothing
    // useful, and looks like the agent failed.
    const allowEdits = Boolean(flags['allow-edits']);
    let agentCommand;
    try {
      agentCommand = describeAgentCommand(config, { allowEdits });
    } catch (err) {
      console.error(err.message);
      return 2;
    }
    // Q-009. The tests are the orchestrator's own, not a grant to the agent:
    // this is the command a human already approved through `adp trust`, run in
    // the lane so that a failure belongs to the task that caused it instead of
    // surfacing at `adp verify` after the merge, owned by nobody.
    const laneTests = flags['no-lane-tests']
      ? { runner: null, command: config.testCommand ?? null, reason: 'disabled with --no-lane-tests' }
      : makeLaneTestRunner(project, config);

    // Ordering is delivered by merging each stage before the next one starts, so
    // a later lane is branched from a tree that already holds what it depends on.
    // With --no-merge nothing lands, and a lane that declared `Depends on:` would
    // run against a tree missing that work — announcing an order and not
    // delivering it, which is worse than refusing to start.
    if (flags['no-merge'] && new Set(lanes.map((l) => l.wave)).size > 1) {
      console.error('error: --no-merge cannot deliver this plan.');
      console.error('  It has more than one stage, which only works because each stage merges');
      console.error('  before the next is branched. With --no-merge nothing merges, so a lane');
      console.error('  that declared Depends on: would run without the work it asked to follow.');
      console.error('  Drop --no-merge, or narrow the run with --lane.');
      return 2;
    }

    console.log(renderPlan(plan));
    console.log('');
    console.log(`agent : ${agentCommand}`);
    console.log(`edits : ${allowEdits ? 'ALLOWED — the agent may write without asking' : 'not allowed (pass --allow-edits)'}`);
    console.log(
      `tests : ${laneTests.runner ? `${laneTests.command} — after every task, in the lane` : `not run (${laneTests.reason})`}`
    );
    console.log(`state : ${storePath(config).replace(/\/[^/]+$/, '')}`);
    console.log('');
    console.log('Each task will be given to that agent in an isolated worktree, and its');
    console.log('work committed. Your working tree is not touched until a lane merges.');
    if (!allowEdits) {
      console.log('');
      console.log('Without --allow-edits the agent cannot write to the worktree, so every');
      console.log('task will finish having changed nothing. Pass it once you have read');
      console.log('the plan above and accept that the agent edits files unattended.');
    }

    // `--lane` can select a lane whose dependency is not in the same run. That is
    // the caller's choice and not an error, but it changes what the lane is
    // branched from, so it is said out loud before the confirmation rather than
    // discovered in the diff.
    const unmet = lanes.flatMap((l) =>
      (l.after ?? []).filter((id) => !lanes.some((s) => s.id === id)).map((id) => `${l.id} runs after ${id}`)
    );
    if (unmet.length) {
      console.log('');
      console.log('these lanes declare an order against a lane this run will not execute:');
      for (const line of unmet) console.log(`  ${line}`);
      console.log('they will be branched from HEAD as it stands now.');
    }
    console.log('');

    if (!flags.yes) {
      if (!process.stdin.isTTY) {
        console.error('refusing to start without confirmation: stdin is not a terminal.');
        console.error('use --yes deliberately.');
        return 2;
      }
      const answer = await ask('type the word yes to start: ');
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('not started.');
        return 1;
      }
    }

    const runTask = makeAgentRunner(project, config, { allowEdits });
    const outcomes = [];
    let merged = 0;
    let conflicts = 0;

    // Settling a lane is part of the loop rather than a pass at the end, because
    // a later stage is branched from HEAD: a lane that declared `Depends on:` only
    // sees the work it depends on if that work has already merged back.
    const settle = (outcome) => {
      const lane = plan.lanes.find((l) => l.id === outcome.lane);
      if (outcome.state !== 'done') {
        console.log(`✘ ${outcome.lane} ${outcome.state} — left on ${outcome.branch}`);
        return;
      }
      if (flags['no-merge']) {
        console.log(`• ${outcome.lane} done — left on ${outcome.branch} (--no-merge)`);
        return;
      }
      const m = mergeLane(project, config, lane, { runId });
      if (m.ok) {
        merged++;
        // The work is in main now; the worktree and branch are duplicates taking
        // up space. A lane that did NOT merge keeps both — its branch is the only
        // place that work exists.
        cleanupLane(project, config, lane);
        console.log(`✔ ${outcome.lane} merged and cleaned up`);
      } else {
        conflicts++;
        console.log(m.message);
      }
    };

    if (command === 'rerun') {
      outcomes.push(rerunLane(project, config, plan, positional[1], runTask, { runId, runTests: laneTests.runner }));
      console.log('');
      for (const outcome of outcomes) settle(outcome);
    } else {
      const selected = new Set(lanes.map((l) => l.id));
      const stages = plan.waves.map((w) => w.filter((id) => selected.has(id))).filter((w) => w.length);

      for (const stage of stages) {
        for (const laneId of stage) {
          const lane = plan.lanes.find((l) => l.id === laneId);
          console.log(`\n── ${lane.id} ─────────────────────────────`);
          const result = runLane(project, config, lane, runTask, { runId, runTests: laneTests.runner });
          for (const r of result.results) {
            console.log(`  ${r.ok ? '✔' : '✘'} ${r.task}  ${r.summary ?? ''}`);
            if (r.undeclared?.length) {
              console.log(`      touched undeclared: ${r.undeclared.join(', ')}`);
            }
          }
          outcomes.push(result);
        }
        console.log('');
        for (const laneId of stage) settle(outcomes.find((o) => o.lane === laneId));
      }
    }

    prune(config);

    console.log('');
    console.log(`run ${runId}: ${merged} merged, ${conflicts} conflicted, ${outcomes.length - merged - conflicts} unfinished`);
    console.log('next: adp verify && adp audit');
    return outcomes.every((o) => o.state === 'done') && !conflicts ? 0 : 1;
  }

  if (command === 'checkpoint') {
    if (flags.clear) {
      const had = clearCheckpoint(rootDir, config);
      console.log(had ? 'checkpoint cleared.' : 'there was no checkpoint to clear.');
      return 0;
    }
    if (typeof flags.note !== 'string' && typeof flags.next !== 'string') {
      console.error('checkpoint needs something to record:');
      console.error('  adp checkpoint --note "what you were doing" [--next "what comes next"]');
      console.error('');
      console.error('Everything else a new session needs is DERIVED — see `adp resume`.');
      console.error('This stores only the intent, which is the one thing no document holds.');
      return 2;
    }
    const where = saveCheckpoint(rootDir, config, {
      note: typeof flags.note === 'string' ? flags.note : undefined,
      next: typeof flags.next === 'string' ? flags.next : undefined,
    });
    console.log(`checkpoint recorded in ${where}`);
    console.log('a new session picks it up with: adp resume');
    return 0;
  }

  if (command === 'resume') {
    const r = buildResume(project, config, audit);
    if (flags.json) console.log(JSON.stringify(r, null, 2));
    else console.log(renderResume(r));
    return 0;
  }

  if (command === 'audit') {
    console.log(flags.json ? renderJson(audit, evaluation) : renderTerminal(audit, evaluation));
    return evaluation.exitCode;
  }

  if (command === 'gates') {
    if (flags.json) console.log(renderJson(audit, evaluation));
    else console.log(renderGates(evaluation));
    return evaluation.exitCode;
  }

  if (command === 'prompt') {
    const wanted = positional[1] ?? evaluation.firstRed;
    const gate = evaluation.gates.find((g) => g.id === wanted);
    if (!gate) {
      console.log('every gate is clean — nothing to send back.');
      return 0;
    }
    console.log(renderPrompt(gate));
    return 0;
  }

  if (command === 'status') {
    console.log(`root      : ${rootDir}`);
    console.log(`config    : ${config.configPath ?? 'defaults (no config file)'}`);
    console.log(`scope     : ${project.scope.present ? project.scope.status || 'no status' : 'MISSING'}`);
    console.log(`features  : ${project.features.length ? project.features.map((f) => f.name).join(', ') : 'none'}`);
    console.log(`principles: ${project.constitution.principles.length}`);
    console.log(`test files: ${project.testFiles.length} · src files: ${project.srcFiles.length}`);
    console.log(`codes     : ${allMappedCodes().size} mapped across ${GATES.length} gates`);
    console.log(
      `backlog   : ${project.backlog.present ? `${project.backlog.items.length} item(s)` : 'none (.spec/BACKLOG.md absent)'}`
    );
    if (project.features.length) {
      console.log('');
      console.log('ceremony  :');
      for (const f of project.features) {
        const c = ceremony.perFeature.get(f.name);
        const signals = c.signals.length ? c.signals.join(', ') : 'none declared';
        console.log(`  ${f.name.padEnd(24)} ${c.level.padEnd(10)} signals: ${signals}`);
      }
    }
    console.log('');
    console.log(renderGates(evaluation));
    return evaluation.exitCode;
  }

  if (command === 'report') {
    const state = buildState(config);
    if (flags.html !== undefined) {
      if (typeof flags.html !== 'string') {
        console.error('error: --html needs a path: adp report --html <path>');
        return 2;
      }
      writeFileSync(flags.html, renderReportHtml(state));
      console.log(`written ${flags.html}`);
      return 0;
    }
    console.log(flags.json ? JSON.stringify(state, null, 2) : renderReportText(state));
    return 0;
  }

  console.error(`unknown command: ${command}\n`);
  console.log(HELP);
  return 2;
}
