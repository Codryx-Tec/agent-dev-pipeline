// The real headless agent invocation — the one place ASM-001 is actually tested
// against a CLI rather than assumed.
//
// This is the adapter `runLane` takes as a parameter. Keeping it separate from
// the executor is what let the whole lane lifecycle be tested with a fake; this
// file is the small, replaceable part that talks to somebody else's binary.
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO.
//
// It does not commit. The executor does that, so "one task, one commit, named
// for the task" holds even when a worker forgets or a CLI changes behaviour.
//
// And it does not read its own output back into the orchestrator. The transcript
// goes to the stream file outside the repository; what comes back here is an
// exit code and a short final summary (AC-021). An orchestrator that reads
// transcripts pays for context it decided not to hold — which is the entire
// reason background execution exists.

import { spawnSync } from 'child_process';

/**
 * How each known harness is invoked without a terminal.
 *
 * `{{PROMPT}}` is replaced with the task brief as a single argv element — never
 * interpolated into a shell string. That is not a style choice: a task title
 * containing a quote or a semicolon would otherwise become shell syntax, and the
 * brief is built from documents the tool does not control.
 */
export const AGENT_COMMANDS = {
  claude: {
    command: 'claude',
    args: ['-p', '{{PROMPT}}'],
    // Verified against Claude Code 2.1.221: without this the run cannot write.
    editArgs: ['--permission-mode', 'acceptEdits'],
  },
  // `null`, not `[]`. An empty array would claim these harnesses need no flag to
  // edit files, which nobody here has checked. Null means unknown, and asking
  // for edits with an unknown harness refuses instead of guessing — the wrong
  // guess is silent, and it fails as "the agent did nothing" hours later.
  codex: { command: 'codex', args: ['exec', '{{PROMPT}}'], editArgs: null },
  cursor: { command: 'cursor-agent', args: ['-p', '{{PROMPT}}'], editArgs: null },
};

/**
 * @param {object} config
 * @param {{allowEdits?: boolean}} [opts] — whether the caller has consented to
 *   the agent writing to the worktree. Off unless `adp run --allow-edits`.
 */
export function resolveAgentCommand(config, { allowEdits = false } = {}) {
  const custom = config.agent?.command;
  const base = custom
    ? {
        command: custom,
        args: config.agent.args ?? ['{{PROMPT}}'],
        editArgs: config.agent.editArgs ?? null,
      }
    : AGENT_COMMANDS[config.agent?.name ?? 'claude'];

  if (!base) {
    throw new Error(
      `no invocation known for agent "${config.agent?.name}" — set agent.command and agent.args in your config, ` +
        `or use one of: ${Object.keys(AGENT_COMMANDS).join(', ')}`
    );
  }

  if (!allowEdits) return { command: base.command, args: base.args };

  if (!Array.isArray(base.editArgs)) {
    throw new Error(
      `--allow-edits does not know how to grant "${custom ?? config.agent?.name ?? 'claude'}" permission to write. ` +
        `Set agent.editArgs in your config to the flags that harness needs, ` +
        `then run it once by hand to confirm they work.`
    );
  }

  return { command: base.command, args: [...base.args, ...base.editArgs] };
}

/** A human-readable rendering of the command, for consent and for the log. */
export function describeAgentCommand(config, opts) {
  const { command, args } = resolveAgentCommand(config, opts);
  return [command, ...args].join(' ');
}

/**
 * The brief handed to one worker.
 *
 * Deliberately short. The worker gets one task, the criteria that task must
 * satisfy, the files it declared, and the rules it may not break. It does NOT
 * get the whole specification: a worker that reads everything is a worker that
 * costs what the orchestrator was trying not to spend.
 */
export function buildBrief(project, task) {
  const criteria = [];
  for (const feature of project.features ?? []) {
    for (const ac of feature.prd?.acs ?? []) {
      if (task.refs?.includes(ac.id)) {
        criteria.push(`### ${ac.id} — ${ac.title}\n${(ac.body ?? '').trim()}`);
      }
    }
  }

  return [
    `You are implementing exactly one task: ${task.id} — ${task.title}`,
    '',
    'Acceptance criteria this task must satisfy:',
    '',
    criteria.length ? criteria.join('\n\n') : '(this task references no acceptance criterion)',
    '',
    'Files this task declared it would touch:',
    ...(task.files ?? []).map((f) => `  - ${f}`),
    '',
    'Rules, none of which are negotiable:',
    '  1. Implement ONLY this task. Anything else belongs to another lane and',
    '     will collide with it.',
    '  2. Every test you write must carry its criterion in the TEST TITLE, as',
    `     @spec:<code> — that annotation is what grants proof.`,
    '  3. Do NOT weaken, skip or delete a test to make something pass.',
    '  4. Do NOT commit. Leave your work in the working tree; the pipeline',
    '     commits it, once, named for this task.',
    '  5. Stay inside the declared files where you can. Touching a file you did',
    '     not declare breaks the isolation that lets lanes run in parallel, and',
    '     it is detected and reported.',
    '',
    'Finish by printing a single line starting with SUMMARY: describing what you',
    'changed, in one sentence. That line is the only thing the orchestrator reads.',
  ].join('\n');
}

/**
 * Pull the worker's one-line summary out of its output.
 *
 * Falls back to the last non-empty line. A worker that ignored the instruction
 * still produces *something* for the report, and "no summary" is more useful
 * reported as the last thing it said than as an empty string.
 */
export function extractSummary(output) {
  const lines = String(output).split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^SUMMARY:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return lines.length ? lines[lines.length - 1].slice(0, 200) : null;
}

/**
 * Build the `runTask` function the executor expects.
 *
 * @returns ({task, cwd}) => {ok, summary, output}
 */
export function makeAgentRunner(project, config, { timeout, allowEdits = false } = {}) {
  const { command, args } = resolveAgentCommand(config, { allowEdits });
  const timeoutMs = timeout ?? config.parallel?.taskTimeoutMs ?? 20 * 60 * 1000;

  return function runTask({ task, cwd }) {
    const brief = buildBrief(project, task);
    // argv, never a shell string. The brief contains document text.
    const argv = args.map((a) => a.replace('{{PROMPT}}', brief));

    const proc = spawnSync(command, argv, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 128 * 1024 * 1024,
      env: process.env,
    });

    const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;

    if (proc.error?.code === 'ENOENT') {
      return {
        ok: false,
        summary: `the agent CLI "${command}" is not on PATH`,
        output,
      };
    }
    if (proc.error?.code === 'ETIMEDOUT') {
      return {
        ok: false,
        summary: `the worker exceeded ${Math.round(timeoutMs / 1000)}s and was killed`,
        output,
      };
    }
    if (proc.error) {
      return { ok: false, summary: `could not run the agent: ${proc.error.message}`, output };
    }

    return {
      ok: proc.status === 0,
      summary: extractSummary(output) ?? (proc.status === 0 ? 'no summary given' : `exited ${proc.status}`),
      output,
    };
  };
}
