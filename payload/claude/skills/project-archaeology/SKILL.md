---
name: project-archaeology
description: Read an existing codebase's own history (README, docs/, ADRs, OpenAPI specs, CHANGELOG, migrations) plus its current code, and propose a SCOPE.md draft with every claim cited to a source. Use once, right after `adp init --brownfield`, for a project adopting this tool mid-life. Do NOT use for a project that started with this tool — there is no history to read.
---

# Project archaeology

`adp init --brownfield` finds doc-shaped files and prints an inventory —
read-only, nothing moved. This skill is the method for turning that
inventory, plus the code, into a first `SCOPE.md` draft.

## Why cited claims, specifically

A SCOPE.md a machine wrote by reading old documentation is not evidence
the way a SCOPE.md a human wrote from firsthand knowledge is. The
difference between the two, mechanically, is whether every sentence names
where it came from. `"The system supports SSO login"` is a guess dressed
as a fact. `"The system supports SSO login (see docs/auth.md,
src/auth/sso.js)"` is a claim someone can check in thirty seconds. This
skill exists to make the second one the only kind this role ever produces.

## Steps

1. **Start from the inventory**, not from scratch. `adp init --brownfield`
   already classified `README*`, `docs/**`, `doc/**`, `adr/**`, `rfc/**`,
   `wiki/**`, OpenAPI/Swagger specs, migration files, `CHANGELOG*`, and
   `CONTRIBUTING*` — read every file it found before reading anything else.
2. **Read the code the inventory points at.** A README or ADR describes
   what the project *was*; the entry points, the routes, the schema, the
   actual dependencies describe what it *is now*. Prefer the code when
   the two disagree, and say so — the disagreement is worth a line in the
   draft, not a silent tiebreak.
3. **Fill `SCOPE.md` section by section**, using the template's own
   headings (`## 1. Identification` through `## 10. Open scope items`).
   Every declarative sentence that isn't obvious from the file structure
   itself gets a citation: `(see <path>)`, right in the prose, not in a
   separate bibliography nobody reads next to the claim.
4. **Leave `## 10. Open scope items` for real gaps** — a thing the
   documentation and the code both fail to answer (who owns this feature,
   what the actual users are called, whether an integration is still
   live) belongs here, named plainly, not guessed at to fill the section.
5. **Propose PRD candidates as a short list of slugs**, one line each,
   naming the feature the codebase clearly already has and a one-sentence
   reason it's a candidate — not a written PRD. The human runs `adp new
   <slug>` for whichever ones they want to formalize.
6. **Set `**Scope status:**` to `Draft`.** Never `Approved` — this skill's
   output is a proposal built from inference, and G0 requires a human
   signature regardless of how confident the inference looks.

## What this is not

- Not a rewrite of the project's actual documentation. The README, the
  ADRs, the OpenAPI spec stay exactly where they are; this skill only
  reads them.
- Not the archiving step (`git mv` to `project_old_artifacts/`). That is
  a separate, deliberately deferred capability with its own consent gate
  — see `.spec/BACKLOG.md`. Nothing this skill does moves a file.
- Not a substitute for the human reviewing the draft. `Draft` status means
  exactly that: propose, don't decide.

## Handoff

Report the drafted `SCOPE.md` content and the PRD candidate list back to
whoever asked — normally straight to the human, or to **business-analyst**
if they're running the adoption. The human (or business-analyst, with the
human's confirmation) is who actually writes it to disk and who decides
when — if ever — its status moves from `Draft` to `Approved`.
