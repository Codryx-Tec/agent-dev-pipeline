// Proof.
//
// This is the file the whole product rests on. Everything else reads documents
// and complains; this one runs the project's tests and decides which acceptance
// criteria are actually proven.
//
// THE RULE, stated once and enforced everywhere below: proof is granted only by
// a test that PASSED and that carries the criterion's annotation in its title.
// Not a green suite. Not a test that exists. Not a skipped test. A criterion
// whose test was skipped is recorded as `skip` and reads, correctly, the same as
// a criterion with no test at all — because a skip tells you nothing.
//
// The order of operations matters and is deliberate:
//
//   1. consent  — `testCommand` comes out of a file in the repository, so it is
//                 not executed until a human has approved that exact string
//                 (P-009). This happens BEFORE the process is spawned.
//   2. run      — the command, as a shell command, with a timeout.
//   3. read     — the reporter's output, from a file if one was configured and
//                 from stdout otherwise. A file is preferred because stdout is a
//                 shared channel: one console.log inside a test corrupts it.
//   4. match    — annotation in the test title → criterion.
//   5. record   — one JSON file per feature, stamped with the git revision and a
//                 code mtime so the proof expires when the code moves
//                 (VERIFY_OBSOLETO).

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { parseWith, REPORTERS } from './reporters/index.js';
import { checkTrust, renderRefusal } from './trust.js';

/**
 * The git revision proof was taken at, and whether the tree was dirty.
 *
 * AC-016 asks for this, and it is not decoration: a modification time is local
 * to one machine. Clone the repository, extract a tarball, or restore a backup
 * and every mtime becomes "now", so proof recorded elsewhere instantly reads as
 * stale. A commit hash means the same code everywhere.
 *
 * `dirty` matters as much as the hash. Proof taken over uncommitted changes
 * describes code that exists nowhere but that working tree, so the hash alone
 * would overstate what was verified.
 */
function gitState(rootDir) {
  const run = (args) => {
    const p = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
    return p.status === 0 ? (p.stdout ?? '').trim() : null;
  };
  const rev = run(['rev-parse', 'HEAD']);
  if (rev === null) return { rev: null, dirty: null };
  return { rev, dirty: run(['status', '--porcelain']) !== '' };
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/** Thrown when the command was never run. Distinct from "ran and failed". */
export class VerifyRefused extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'VerifyRefused';
    this.reason = reason;
  }
}

const RE_SPEC_TAG = /@spec:(AC-\d+)/g;

/**
 * Which criteria does this test title claim?
 *
 * A title may carry more than one, and a test proving two criteria is
 * legitimate — one behaviour can satisfy two requirements.
 */
export function criteriaIn(title) {
  return [...String(title).matchAll(RE_SPEC_TAG)].map((m) => m[1]);
}

/**
 * Fold per-test outcomes into per-criterion verdicts.
 *
 * A criterion claimed by several tests is proven only if EVERY test claiming it
 * passed. Taking the best of them would let a failing test hide behind a passing
 * neighbour, which is the same lie as counting a skip as proof.
 */
export function foldResults(tests) {
  const results = {};
  for (const t of tests) {
    for (const ac of criteriaIn(t.title)) {
      const current = results[ac]?.status;
      const next =
        current === 'fail' || t.status === 'fail'
          ? 'fail'
          : current === 'skip' || t.status === 'skip'
            ? 'skip'
            : 'pass';
      results[ac] = {
        status: next,
        tests: [...(results[ac]?.tests ?? []), { title: t.title, status: t.status }],
      };
    }
  }
  return results;
}

function readReporterOutput(rootDir, config, stdout) {
  if (config.reporterOutputFile) {
    const p = path.join(rootDir, config.reporterOutputFile);
    if (!existsSync(p)) {
      return {
        text: '',
        error: `reporterOutputFile "${config.reporterOutputFile}" was not written — did the test command produce it?`,
      };
    }
    return { text: readFileSync(p, 'utf8'), error: null };
  }
  return { text: stdout, error: null };
}

/**
 * Run the project's tests and return proof per criterion.
 *
 * Does not write anything; `writeRecords` does that. Splitting them keeps the
 * decision ("what is proven") testable without a filesystem.
 */
export function runVerification(project, config, { env = process.env, timeout } = {}) {
  const command = config.testCommand;
  if (!command) {
    throw new VerifyRefused(
      'this project declares no testCommand.\n' +
        `  Set one in ${config.configPath ?? 'adp.config.json'} — without it there is nothing to run,\n` +
        '  and without a run there is no proof.',
      'no-command'
    );
  }

  // 1. CONSENT. Before the process exists, not after.
  const trust = checkTrust(project.rootDir, command, config, env);
  if (!trust.trusted) {
    throw new VerifyRefused(renderRefusal(project.rootDir, command, trust), 'not-trusted');
  }

  const reporter = config.reporter ?? 'tap';
  if (!REPORTERS[reporter]) {
    throw new VerifyRefused(
      `unknown reporter "${reporter}" — use one of: ${Object.keys(REPORTERS).join(', ')}`,
      'bad-reporter'
    );
  }

  // 2. RUN.
  const started = Date.now();
  const proc = spawnSync(command, {
    cwd: project.rootDir,
    shell: true,
    encoding: 'utf8',
    timeout: timeout ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 128 * 1024 * 1024,
    env,
  });

  const durationMs = Date.now() - started;

  if (proc.error && proc.error.code === 'ETIMEDOUT') {
    throw new VerifyRefused(
      `the test command exceeded ${(timeout ?? DEFAULT_TIMEOUT_MS) / 1000}s and was killed.\n` +
        '  No proof was recorded — a run that did not finish proves nothing.',
      'timeout'
    );
  }
  if (proc.error) throw new VerifyRefused(`could not run the test command: ${proc.error.message}`, 'spawn-failed');

  // 3. READ.
  const { text, error: readError } = readReporterOutput(project.rootDir, config, proc.stdout ?? '');

  // 4. MATCH.
  let results = {};
  let parseError = readError;
  let perTest = REPORTERS[reporter].perTest;

  if (reporter === 'exitcode') {
    // The degraded path, kept because it works with any runner on earth. It
    // grants proof to every annotated criterion when the suite is green, which
    // is weaker than it looks — the audit reports PROVA_FRACA for exactly this.
    if (proc.status === 0) {
      for (const tag of project.annotations?.specTags ?? []) {
        results[tag.acId] = { status: 'pass', tests: [{ title: tag.text, status: 'pass' }] };
      }
    }
  } else if (!parseError) {
    const parsed = parseWith(reporter, text);
    parseError = parsed.error;
    results = foldResults(parsed.tests);
  }

  return {
    reporter,
    perTest,
    command,
    exitCode: proc.status,
    durationMs,
    results,
    parseError,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    trustReason: trust.reason,
  };
}

/**
 * The test command, prepared to run inside a lane's worktree.
 *
 * Q-009 asked whether a worker should be able to run the tests it writes. The
 * answer is that nobody needs to grant it anything: the orchestrator already
 * holds consent for exactly one command — the project's `testCommand`, approved
 * by a human through `adp trust` — so it runs that command itself, in the lane,
 * and attributes the result to the task that just committed.
 *
 * What that buys is attribution. Before it, a worker that wrote a failing test
 * could not run it and said so; the failure surfaced at `adp verify` after the
 * merge, belonging to no task in particular. What it deliberately does not buy
 * is a feedback loop for the worker — the worker still cannot execute anything,
 * because letting an agent run arbitrary commands in a worktree is a far larger
 * grant than letting it edit files there, and it is the grant `adp trust` spends
 * its whole existence withholding.
 *
 * Returns `{runner: null, reason}` rather than throwing when the command is
 * missing or unapproved. A lane that cannot run tests is still worth running;
 * refusing the whole run would make an optional check mandatory, and the caller
 * is told exactly why it is off.
 *
 * @returns {{runner: function|null, command: string|null, reason: string|null}}
 */
export function makeLaneTestRunner(project, config, { env = process.env, timeout } = {}) {
  const command = config.testCommand;
  if (!command) {
    return { runner: null, command: null, reason: 'the project declares no testCommand' };
  }

  // Consent, before the process exists — the same check `verify` makes, for the
  // same reason. A worktree is still this machine, and a command out of the
  // repository is still a stranger's code.
  const trust = checkTrust(project.rootDir, command, config, env);
  if (!trust.trusted) {
    return {
      runner: null,
      command,
      reason:
        trust.reason === 'changed'
          ? 'the test command changed since it was approved — run `adp trust`'
          : 'the test command has not been approved on this machine — run `adp trust`',
    };
  }

  const timeoutMs = timeout ?? DEFAULT_TIMEOUT_MS;

  return {
    command,
    reason: null,
    runner({ cwd }) {
      const started = Date.now();
      const proc = spawnSync(command, {
        cwd,
        shell: true,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 128 * 1024 * 1024,
        env,
      });
      const durationMs = Date.now() - started;
      const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;

      if (proc.error?.code === 'ETIMEDOUT') {
        return {
          ok: false,
          exitCode: null,
          durationMs,
          output,
          summary: `the tests exceeded ${Math.round(timeoutMs / 1000)}s in the lane and were killed`,
        };
      }
      if (proc.error) {
        return { ok: false, exitCode: null, durationMs, output, summary: `could not run the tests: ${proc.error.message}` };
      }

      return {
        ok: proc.status === 0,
        exitCode: proc.status,
        durationMs,
        output,
        summary: proc.status === 0 ? 'tests passed in the lane' : `tests FAILED in the lane (exit ${proc.status})`,
      };
    },
  };
}

/**
 * Write one record per feature, holding only the criteria that feature owns.
 *
 * Per feature rather than one global file because the audit reads per feature,
 * and because a feature whose tests were not run this time must keep its
 * previous proof rather than being silently emptied by someone else's run.
 */
export function writeRecords(project, config, verification) {
  const dir = path.join(project.rootDir, config.verificationDir);
  mkdirSync(dir, { recursive: true });

  const written = [];
  for (const feature of project.features) {
    const owned = (feature.prd?.acs ?? []).map((a) => a.id);
    if (!owned.length) continue;

    const results = {};
    for (const ac of owned) {
      if (verification.results[ac]) results[ac] = verification.results[ac];
    }

    const git = gitState(project.rootDir);
    const record = {
      feature: feature.name,
      reporter: verification.reporter,
      command: verification.command,
      exitCode: verification.exitCode,
      durationMs: verification.durationMs,
      verifiedAt: new Date().toISOString(),
      // What makes proof expire, in two forms because neither is enough alone.
      //
      // `gitRev` is portable: the same commit is the same code on any machine,
      // so proof survives a clone or a tarball extraction. `dirty` records
      // whether that hash actually described what was tested.
      //
      // `codeMtime` is the fallback for a project with no git, and the finer
      // signal inside one working tree — it catches an edit made a second ago,
      // which a commit hash cannot.
      gitRev: git.rev,
      gitDirty: git.dirty,
      codeMtime: project.codeMtime ?? null,
      results,
    };

    const file = path.join(dir, `${feature.name}.json`);
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    written.push({ feature: feature.name, file: path.relative(project.rootDir, file), record });
  }
  return written;
}

/** Counts for the terminal, computed from what was actually recorded. */
export function summarise(project, written) {
  let proven = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;

  for (const f of project.features) {
    const record = written.find((w) => w.feature === f.name)?.record;
    for (const ac of f.prd?.acs ?? []) {
      total++;
      const s = record?.results?.[ac.id]?.status;
      if (s === 'pass') proven++;
      else if (s === 'fail') failed++;
      else if (s === 'skip') skipped++;
    }
  }
  return { total, proven, failed, skipped, unproven: total - proven };
}
