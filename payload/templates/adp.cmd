@echo off
REM Written once by `adp init` (SCOPE-0.6.0.md PRD-005) — never overwritten on
REM a later `init`. Windows/PowerShell equivalent of ./adp, same pinned version.
npx --yes @codryx/agent-dev-pipeline@{{VERSION}} %*
