#!/usr/bin/env bash
# Written once by `adp init` (SCOPE-0.6.0.md PRD-005) — never overwritten on a
# later `init`, so a hand edit here survives. The version is pinned on
# purpose: this is what resolves both the "adp is not a command" problem and
# CI pinning at once, without touching a shell dotfile.
exec npx --yes @codryx/agent-dev-pipeline@{{VERSION}} "$@"
