#!/usr/bin/env node
import { run } from '../src/cli.js';

// process.exitCode, never process.exit(): with process.exit() a large piped
// output (audit --json on a real repository) is truncated at the pipe buffer
// because the process dies before stdout flushes. This is a scar, not a style
// preference.
run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`error: ${err.message}`);
    process.exitCode = 2;
  }
);
