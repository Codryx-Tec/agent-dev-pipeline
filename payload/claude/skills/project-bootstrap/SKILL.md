---
name: project-bootstrap
description: Bootstrap a brand-new project before any coding starts — produces .spec/SCOPE.md, STACK.md, STRUCTURE.md, CONSTITUTION.md (with template), spec.config.json, CHANGELOG.md, BEST_PRACTICES.md, TROUBLESHOOTING.md, and README.md/docs. Use only when starting a new project from scratch; not needed once bootstrap is done.
---

# Bootstrap (new project, before coding)

| File                                                                                         | By                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------- |
| `.spec/SCOPE.md` (needs approval)                                                            | business-analyst                       |
| `.spec/STACK.md` — technologies: runtime, backend, frontend, infra, tooling + exact commands | architect                              |
| `.spec/STRUCTURE.md` — folders/conventions                                                   | architect                              |
| `.spec/CONSTITUTION.md` — see template                                                       | architect + security                   |
| `.spec/spec.config.json` — validations, test runners, globs                                  | architect                              |
| `.spec/CHANGELOG.md`, `BEST_PRACTICES.md`, `TROUBLESHOOTING.md` — header only                | techlead                               |
| `README.md`, `docs/DEPLOYMENT.md`, `docs/USAGE.md` — see skill `project-docs`                | techlead (+ architect/designer drafts) |

### CONSTITUTION.md template

```markdown
# Constitution — v1.1.0

<!-- P-xxx = principle. Levels: [MUST] · [SHOULD] · [MAY].
Every [MUST] needs executable verification or audit flags PRINCIPIO_SEM_VERIFICACAO.
Formats: verification(gate) | verification(test): @principle:P-xxx |
verification(forbidden|required): `regex` in `glob` -->

## P-001 [MUST] Every requirement has executable proof

No feature is done without audit in CI mode exiting 0. Verified by the audit
itself (AC_SEM_TESTE, AC_SEM_PROVA, TASK_CONCLUIDA_SEM_PROVA).

- verification(gate): intrinsic to the audit

## P-002 [SHOULD] Secrets never in code

Keys/passwords from env vars, never hard-coded.

- verification(forbidden): `(api[_-]?key|senha|password)\s*[:=]\s*['"][^'"]{8,}` in `src/**/*.js`
```

Keep P-001/P-002 as core; add project principles in the same format.
