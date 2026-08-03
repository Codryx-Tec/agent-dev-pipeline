// Consent for executing a command that came out of the repository.
//
// THE PROBLEM. `testCommand` lives in `adp.config.json`, which is a file in the
// project. `verify` (M2) will run it as a shell command. That means cloning a
// hostile repository and running `adp verify` executes whatever its author
// wrote, with your privileges, your keys and your network. The same shape as
// `.vscode/tasks.json`, `Makefile`, a git hook or `.envrc` — a class of problem
// with known answers, and known ways of getting it wrong.
//
// THE ANSWER, borrowed from direnv: trust on first use, bound to the exact
// content. Approving a command approves *that* command, not the field it sits
// in. Change the command and the approval is void, because "I once agreed to
// run the test suite" must never mean "I agree to run whatever appears here
// later" — that is the whole attack.
//
// WHERE THE RECORD LIVES, and why it is the load-bearing decision. The trust
// store is kept in the state directory OUTSIDE the repository (RFC D-007). If it
// lived inside, a hostile repository would simply ship its own approval, and the
// check would be theatre. Nothing in the repo can grant the repo permission.
//
// WHAT THIS IS NOT. It is not a sandbox. An approved command runs with full
// privileges. The claim is narrow and worth stating plainly: nothing from the
// repository executes until a human has seen the exact string and said yes.

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'fs';
import path from 'path';
import os from 'os';

const STORE_NAME = 'trusted-commands.json';

/** The CI escape hatch. Explicit, documented, never a default. */
export const TRUST_ENV = 'ADP_TRUST_TEST_COMMAND';

export function resolveStateDir(config = {}) {
  return config.stateDir ? path.resolve(config.stateDir) : path.join(os.homedir(), '.adp');
}

export function storePath(config = {}) {
  return path.join(resolveStateDir(config), STORE_NAME);
}

/**
 * Identify the project by its resolved real path.
 *
 * realpath, not the raw string: two paths that differ only by a symlink are the
 * same project, and treating them as different would ask for approval twice —
 * which teaches people to approve without reading.
 */
export function projectKey(rootDir) {
  try {
    return realpathSync(rootDir);
  } catch {
    return path.resolve(rootDir);
  }
}

/**
 * Fingerprint the command.
 *
 * Whitespace is normalised so reformatting the config does not revoke consent,
 * but nothing else is: any change to what would actually be executed produces a
 * different fingerprint and requires approval again.
 */
export function fingerprint(command) {
  return createHash('sha256').update(String(command).trim().replace(/\s+/g, ' ')).digest('hex');
}

function readStore(config) {
  const p = storePath(config);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // A corrupt store is treated as empty: it withdraws consent rather than
    // granting it, which is the safe direction to fail in.
    return {};
  }
}

function writeStore(config, store) {
  const p = storePath(config);
  mkdirSync(path.dirname(p), { recursive: true });
  // 0600: the file records what this user agreed to execute. Another account on
  // the machine should not be able to add an entry to it.
  writeFileSync(p, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
}

/**
 * @returns {{trusted: boolean, reason: string, fingerprint: string|null}}
 */
export function checkTrust(rootDir, command, config = {}, env = process.env) {
  if (!command) return { trusted: true, reason: 'no-command', fingerprint: null };

  const fp = fingerprint(command);

  if (env[TRUST_ENV] === '1') {
    return { trusted: true, reason: 'env', fingerprint: fp };
  }

  const store = readStore(config);
  const entry = store[projectKey(rootDir)];
  if (entry && entry.fingerprint === fp) {
    return { trusted: true, reason: 'stored', fingerprint: fp };
  }
  return {
    trusted: false,
    reason: entry ? 'changed' : 'unknown',
    fingerprint: fp,
    previous: entry?.command ?? null,
  };
}

export function grantTrust(rootDir, command, config = {}) {
  const store = readStore(config);
  store[projectKey(rootDir)] = {
    command,
    fingerprint: fingerprint(command),
    grantedAt: new Date().toISOString(),
  };
  writeStore(config, store);
  return storePath(config);
}

export function revokeTrust(rootDir, config = {}) {
  const store = readStore(config);
  const key = projectKey(rootDir);
  const had = key in store;
  delete store[key];
  writeStore(config, store);
  return had;
}

/** Everything a caller needs to explain a refusal, in one place. */
export function renderRefusal(rootDir, command, check) {
  const lines = [];
  if (check.reason === 'changed') {
    lines.push('The test command CHANGED since you approved it.');
    lines.push('');
    lines.push(`  approved before : ${check.previous}`);
    lines.push(`  in the config now: ${command}`);
    lines.push('');
    lines.push('Approving once does not approve whatever appears here later —');
    lines.push('that is the attack this check exists to stop. Read the new command.');
  } else {
    lines.push('This project declares a test command that has never been approved');
    lines.push('on this machine, and it comes from a file inside the repository.');
    lines.push('');
    lines.push(`  ${command}`);
    lines.push('');
    lines.push('Running it executes that command with your privileges. Read it.');
  }
  lines.push('');
  lines.push('If you trust it:');
  lines.push('  adp trust');
  lines.push('');
  lines.push(`In CI, where you control the repository, set ${TRUST_ENV}=1.`);
  return lines.join('\n');
}
