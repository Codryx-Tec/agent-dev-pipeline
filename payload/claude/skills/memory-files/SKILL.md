---
name: memory-files
description: Formats and templates for the project's memory files - .spec/CHANGELOG.md, .spec/BEST_PRACTICES.md, .spec/TROUBLESHOOTING.md and the technical decision log. Use when creating or updating any of these files, or when you need the correct format/template for an entry (changelog, troubleshooting, technical decision).
---

# Memory files: formats and templates

The memory files are the project's living memory. `AGENTS.md` defines **when** to update them (after every relevant change, when resolving a problem, when discovering a pattern). This skill covers **how** — the format and template for each one. All of them live under `.spec/` in the repo.

General rule: update immediately after the change; don't save it up for the end of the session. Don't log a generic changelog entry. Don't erase history.

---

## .spec/CHANGELOG.md — running log

Update after: bug fix, feature, visual tweak, refactor, business rule change, database change, integration or deploy adjustment, behavior change, relevant documentation update.

Format:

- Date as the top-level section `YYYY-MM-DD`, reverse chronological order (most recent on top).
- Items with a `HH:MM` timestamp.
- Each item: time, task, module/screen, what changed and why, changed files, validation performed.

```md
# Changelog

Living record of every change in the project.

Reverse chronological order: most recent on top.

---

# YYYY-MM-DD

| Time  | Task      | Module/Screen         | Detail               | Changed files    | Validation                          |
| ----- | --------- | --------------------- | -------------------- | ---------------- | ----------------------------------- |
| HH:MM | Task name | Module or screen name | What changed and why | `file1`, `file2` | Build/test/lint/manual verification |
```

---

## .spec/BEST_PRACTICES.md — living manual

Patterns, conventions, technical decisions and rules that apply to any change. Read it in full before any task; update it when you discover a new pattern, before moving to the next task.

```md
# Best Practices

Project patterns and conventions.

Read this entire file before any development task.

Update it whenever you discover a new pattern during the work.

---

# 1. Overall architecture

To define.

---

# 2. Stack

| Layer          | Technology | Version   |
| -------------- | ---------- | --------- |
| Frontend       | To define  | To define |
| Backend        | To define  | To define |
| Database       | To define  | To define |
| Deploy         | To define  | To define |
| Authentication | To define  | To define |
| Integrations   | To define  | To define |

---

# 3. Code patterns

To define.

---

# 4. Data patterns

To define.

---

# 5. UI/UX patterns

To define.

---

# 6. Integrations

To define.

---

# 7. Business rules

To define.

---

# 8. Important conventions

To define.

---

# 9. Technical decisions

(see the technical decision template below)

---

# 10. Known technical debt

| Date       | Module    | Item      | Impact    | Priority  |
| ---------- | --------- | --------- | --------- | --------- |
| YYYY-MM-DD | To define | To define | To define | To define |
```

---

## Technical decision log (in .spec/BEST_PRACTICES.md, section 9)

Record it whenever you make a relevant technical decision: framework/library choice, architecture change, new authentication/authorization pattern, data modeling change, integration change, cache/logging/deploy/testing strategy.

```md
## Decision name

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded | Revoked
**Context:** Why the decision was needed
**Decision:** What was decided
**Reason:** Why this alternative was chosen
**Impact:** What this decision affects
**Alternatives considered:** Other options evaluated
```

---

## .spec/TROUBLESHOOTING.md — problem log

Record it immediately after resolving or working around: build/deploy error, database/migration error, authentication/authorization error, CORS/network error, API/external integration error, hard-to-spot visual error, inconsistent behavior, performance issue, dependency or environment problem.

````md
# Troubleshooting

Problems found and resolved.

Record it immediately after resolving any issue.

---

## Problem name

**Date:** YYYY-MM-DD
**Module/Screen:** Name of the affected module or screen

### Symptom

Describe what goes wrong.

Include the exact error message, if any.

```txt
Exact error message here
```

### Cause

Explain the root cause.

### Fix

Describe what was done to resolve it.

Include a snippet, query or configuration when needed.

### Affected files

- `file1`
- `file2`

### Notes

Record useful details to prevent it from happening again.
````
