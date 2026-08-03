---
name: debugging-and-error-recovery
description: Guides systematic root-cause debugging for test failures, broken builds, or runtime errors.
---

# Debugging and Error Recovery

## Mandatory Rule: Stop-the-Line

1. **STOP** feature work.
2. **PRESERVE** logs and stack traces.
3. **DIAGNOSE** root cause before editing.
4. **FIX** underlying issue at source.
5. **GUARD** with a regression test.
6. **RESUME** only after full verification.

---

## Triage Checklist

### 1. Reproduce

- Make failure reliable.
- Run the failing test in isolation, sequentially — disable parallelism to rule out timing/shared-state issues.
- If flaky/intermittent: check timing/races, environment/node diffs, or leaked global state.

### 2. Localize

Identify failing layer:

- **UI/Frontend**: Console, DOM state, network payloads.
- **API/Backend**: Server logs, headers, status code.
- **Database**: Queries, migrations, schema integrity.
- **Build/Tooling**: Toolchain configs, dependencies, env vars.
- **External Service**: API status, contract changes, rate limits.
- **Test Definition**: Assertions, false negatives.

_For regressions, run:_

```bash
git bisect start && git bisect bad && git bisect good <sha> && git bisect run <test-cmd>
```

### 3. Reduce

Strip unrelated code/inputs to build a Minimal Reproducible Example (MRE).

### 4. Fix Root Cause

Fix the architectural origin, never patch symptoms (e.g., fix a SQL JOIN at the source, don't deduplicate arrays in the UI).

### 5. Guard

Add a regression test:

- MUST fail without the fix, MUST pass with the fix.
- Cover nulls, boundaries, and edge cases.

### 6. Verify

Run target test → Full test suite → Build/Typecheck → E2E check.
