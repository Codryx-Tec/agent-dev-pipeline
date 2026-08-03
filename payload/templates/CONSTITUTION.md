# Constitution — v1.0.0

<!--
P-xxx = principle. Levels: [MUST] · [SHOULD] · [MAY].

Every [MUST] needs an executable verification, or the audit reports
PRINCIPIO_SEM_VERIFICACAO. Four forms:

  - verification(gate): free text — a human promise. Satisfies "declared",
    proves nothing. The audit says so out loud.
  - verification(test): @principle:P-xxx
  - verification(forbidden): `regex` in `glob`
  - verification(required): `regex` in `glob`

The backticks are required on both sides — a pattern containing the word "in"
would otherwise be split at the wrong place.

These regexes ACTUALLY RUN, in a disposable subprocess with a hard timeout. A
glob that matches no file is reported as inert (GLOB_SEM_ARQUIVOS), because a
check that cannot fail looks exactly like a check that passed.
-->

## P-001 [MUST] Every requirement has executable proof

No feature is done until `adp audit --ci` exits 0. Verified by the audit
itself: `AC_SEM_TESTE`, `AC_SEM_PROVA`, `TASK_CONCLUIDA_SEM_PROVA`.

- verification(gate): intrinsic to the audit

## P-002 [MUST] Secrets never in source

Keys, passwords and tokens come from the environment or a secret store, never
from a literal in the repository.

- verification(forbidden): `(api[_-]?key|password|senha|secret)\s*[:=]\s*['"][^'"]{8,}` in `src/**`

## P-003 [SHOULD] Fix causes, not symptoms

A bug is fixed where it originates, not worked around at the call site.

- verification(gate): code review

<!--
Add your project's own principles below, in the same shape. Keep them few and
real: a constitution nobody can violate is decoration, and a constitution
everyone violates is noise.
-->
