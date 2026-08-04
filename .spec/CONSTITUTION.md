# Constitution — v1.0.0

<!--
P-xxx = principle. Levels: [MUST] · [SHOULD] · [MAY].

Every [MUST] needs an executable verification, or the audit reports
PRINCIPLE_WITHOUT_VERIFICATION. Four forms:

  - verification(gate): free text — a human promise. Satisfies "declared",
    proves nothing. The audit says so out loud.
  - verification(test): @principle:P-xxx
  - verification(forbidden): `regex` in `glob`
  - verification(required): `regex` in `glob`

The backticks are required on both sides — a pattern containing the word "in"
would otherwise be split at the wrong place.

These regexes ACTUALLY RUN, in a disposable subprocess with a hard timeout. A
glob that matches no file is reported as inert (GLOB_WITHOUT_FILES), because a
check that cannot fail looks exactly like a check that passed.
-->

## P-001 [MUST] Every requirement has executable proof

No feature is done until `adp audit --ci` exits 0. Verified by the audit
itself: `AC_WITHOUT_TEST`, `AC_WITHOUT_PROOF`, `TASK_DONE_WITHOUT_PROOF`.

- verification(gate): intrinsic to the audit

## P-002 [MUST] Secrets never in source

Keys, passwords and tokens come from the environment or a secret store, never
from a literal in the repository.

- verification(forbidden): `(api[_-]?key|password|senha|secret)\s*[:=]\s*['"][^'"]{8,}` in `src/**`

## P-003 [SHOULD] Fix causes, not symptoms

A bug is fixed where it originates, not worked around at the call site.

- verification(gate): code review

## P-004 [MUST] Zero runtime dependencies

The package installs nothing. Not a small dependency, not a well-known one, not
a dev dependency that creeps into runtime — none. This is what makes "installing
is copying a folder" true, and it removes the entire class of attack that begins
with someone else's package.

- verification(test): @principle:P-004

## P-005 [MUST] Nothing executes on the installing machine

`preinstall`, `install` and `postinstall` run automatically for everyone who
installs the package. A package that writes executable hooks into other people's
repositories has no business also running code at install time, so it does not.
What ships is an allowlist, never an exclusion list.

- verification(test): @principle:P-005
- verification(forbidden): `"(pre|post)?install"\s*:` in `package.json`

## P-006 [MUST] The payload is verified before it is trusted

`payload/` carries shell hooks the agent harness executes and skills an AI reads
as instructions. Every file is hashed into `payload/MANIFEST.json`, and `init`
verifies before it writes — never after, because afterwards the files are
already on disk.

The boundary is stated rather than blurred: this detects tampering **after**
publication. It cannot detect a malicious publish, because whoever controls the
tarball controls the manifest. That threat is answered by trusted publishing and
provenance, not by this principle.

- verification(test): @principle:P-006
- verification(required): `MANIFEST` in `src/core/integrity.js`

## P-007 [MUST] No write escapes the project directory

Every path `init` writes is checked to resolve inside the target project. A
destination that escapes is refused, never clamped — quietly rewriting a path
someone else chose still writes their file, just somewhere less expected.

- verification(test): @principle:P-007
- verification(required): `assertInside` in `src/core/init.js`

## P-008 [MUST] Publication happens from CI, with provenance

No long-lived npm token exists. Releases are published by a workflow that mints
a short-lived credential from GitHub's OIDC token, and every tarball carries a
signed attestation binding it to the commit that produced it. The strongest way
to protect a publish token is not to have one.

The forbidden pattern below matches token *usage* — an env assignment or a
secrets reference — not the token's name in prose. The first draft matched the
bare name and fired on the comment in `publish.yml` explaining that no token
exists. A pattern that flags the documentation of a rule, rather than its
violation, trains people to ignore the finding.

- verification(required): `--provenance` in `.github/workflows/publish.yml`
- verification(forbidden): `(NODE_AUTH_TOKEN|NPM_TOKEN)\s*:|secrets\.(NODE_AUTH_TOKEN|NPM_TOKEN)` in `.github/workflows/**`

## P-009 [MUST] Nothing from the repository executes without consent

`testCommand` lives in a file inside the project, and `verify` runs it as a shell
command. Cloning a hostile repository must never be enough to execute its author's
code. Approval is trust-on-first-use, bound to the exact command text, recorded in
the state directory **outside** the repository — inside, a hostile project would
ship its own approval and the check would be theatre.

This is consent, not a sandbox. An approved command runs with full privileges.
The claim is narrow on purpose: nothing from the repository runs until a human
has read the exact string and agreed to it.

- verification(test): @principle:P-009
- verification(required): `checkTrust` in `src/cli.js`

<!--
Add your project's own principles below, in the same shape. Keep them few and
real: a constitution nobody can violate is decoration, and a constitution
everyone violates is noise.
-->
