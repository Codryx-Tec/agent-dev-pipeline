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
import { renderTerminal, renderJson, renderGates, renderPrompt } from './core/report.js';
import { initProject, newFeature, renderReport, AGENT_SKILL_DIRS, PAYLOAD_DIR } from './core/init.js';
import { verifyPayload, renderIntegrity } from './core/integrity.js';
import { checkTrust, grantTrust, revokeTrust, renderRefusal, storePath, TRUST_ENV } from './core/trust.js';
import { startMonitor } from './server/server.js';
import { runVerification, writeRecords, summarise, VerifyRefused } from './core/verify.js';
import { buildPlan, renderPlan } from './core/plan.js';
import { runLane, mergeLane, isGitRepo, cleanupLane, cleanWorktrees, listOurWorktrees } from './core/executor.js';
import { rerunLane } from './core/rerun.js';
import { makeAgentRunner, describeAgentCommand } from './core/agent.js';
import { progress, prune, append, read } from './core/ledger.js';
import { buildResume, renderResume, saveCheckpoint, clearCheckpoint } from './core/resume.js';

// Read from package.json rather than hard-coding. A version literal in the
// source is a second truth: it drifts from the manifest the moment someone
// bumps one and forgets the other, which is the exact failure this tool exists
// to catch. Refusing to hold it twice is cheaper than auditing it.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const VERSION = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
).version;

const HELP = `agent-dev-pipeline — the specification that stays true

usage: adp <command> [options]

  init [--agent <name>]     scaffold .spec/ here and install the agent skill
  new <feature>             create PRD.md, RFC.md and TDD.md for a feature
  status                    what exists and where the work stands
  audit [--ci] [--json]     evaluate every gate and report the findings
  gates [--list] [--json]   the six gates and their state, without the findings
  prompt [<gate>]           the paste-ready text for a red gate
  verify [--background]     run the project's tests and record what they prove
  verify --status           how the last background verification is doing
  plan                      show the execution lanes, without running anything
  run [--lane <id>] [--yes] execute pending tasks in isolated git worktrees
  rerun <lane> [--yes]      re-run one lane, leaving merged work alone
  clean [--force]           remove worktrees whose work is already merged
  resume                    where the work stands — read this first in a new session
  checkpoint --note "<s>"   record what you were doing, for the next session
  monitor [--port <n>]      serve the read-only page for this project
  doctor                    verify this copy of the tool against its manifest
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
  --ci            escalate the softer findings to errors (use this in a pipeline)
  --json          machine-readable output
  --port <n>      port for the monitor (default 7788)
  --host <addr>   bind address for the monitor (default 127.0.0.1, loopback)
  --yes           skip the confirmation prompt (trust, run, rerun)
  --lane <id>     execute only this lane (run)
  --note <s>      what the session was doing (checkpoint)
  --next <s>      what it intended to do next (checkpoint)
  --clear         forget the recorded note (checkpoint)
  --no-merge      leave lanes on their branches instead of merging back (run)
  --revoke        withdraw a previously granted approval (trust)

exit code: 0 when every gate is clean, otherwise 1..6 for G0..G5 — the number
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

  // Ring 1: needs no config and no project. `doctor` checks the TOOL, not the
  // project it is standing in — deliberately. Files installed into a project are
  // meant to be edited (that is why init never overwrites), so comparing them to
  // the manifest would report a user's own work as tampering, and a check that
  // cries wolf is one people learn to skip.
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
    return result.status === 'failed' ? 2 : 0;
  }

  // ---- ring 2 ----
  const config = loadConfig(rootDir);

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
    console.log('  2. adp new <feature>                                   (creates PRD, RFC, TDD)');
    console.log('  3. adp status                                          (see where you are)');
    return 0;
  }

  if (command === 'new') {
    const name = positional[1];
    try {
      const report = newFeature(rootDir, name, { featuresDir: config.featuresDir });
      console.log(renderReport(report, { title: `feature "${name}" scaffolded` }));
      console.log('');
      console.log('next: write the stories and criteria in PRD.md, then run `adp status`');
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

  // ---- ring 3 ----
  const project = loadProject(config);
  const audit = auditProject(project, { ci: Boolean(flags.ci) });
  const evaluation = evaluateGates(audit.findings);

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
    const agentCommand = describeAgentCommand(config);
    console.log(renderPlan(plan));
    console.log('');
    console.log(`agent : ${agentCommand}`);
    console.log(`state : ${storePath(config).replace(/\/[^/]+$/, '')}`);
    console.log('');
    console.log('Each task will be given to that agent in an isolated worktree, and its');
    console.log('work committed. Your working tree is not touched until a lane merges.');
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

    const runTask = makeAgentRunner(project, config);
    const outcomes = [];

    if (command === 'rerun') {
      outcomes.push(rerunLane(project, config, plan, positional[1], runTask, { runId }));
    } else {
      for (const lane of lanes) {
        console.log(`\n── ${lane.id} ─────────────────────────────`);
        const result = runLane(project, config, lane, runTask, { runId });
        for (const r of result.results) {
          console.log(`  ${r.ok ? '✔' : '✘'} ${r.task}  ${r.summary ?? ''}`);
          if (r.undeclared?.length) {
            console.log(`      touched undeclared: ${r.undeclared.join(', ')}`);
          }
        }
        outcomes.push(result);
      }
    }

    console.log('');
    let merged = 0;
    let conflicts = 0;
    for (const outcome of outcomes) {
      const lane = plan.lanes.find((l) => l.id === outcome.lane);
      if (outcome.state !== 'done') {
        console.log(`✘ ${outcome.lane} ${outcome.state} — left on ${outcome.branch}`);
        continue;
      }
      if (flags['no-merge']) {
        console.log(`• ${outcome.lane} done — left on ${outcome.branch} (--no-merge)`);
        continue;
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
    console.log('');
    console.log(renderGates(evaluation));
    return evaluation.exitCode;
  }

  console.error(`unknown command: ${command}\n`);
  console.log(HELP);
  return 2;
}
