# Using create-rfc inside agent-dev-pipeline

`create-rfc` produces a decision record: background, assumptions, decision
criteria with weights, options with pros and cons, RACI, outcome. agent-dev-pipeline's
G2 gate wants to know two things about any RFC — **were at least two paths
weighed, and was one of them actually chosen** — and it reads this skill's shape
natively. No conversion step, no second document.

What the engine reads from a create-rfc document:

| Engine question | Where it looks |
|---|---|
| how many alternatives? | `### Option 1:`, `### Option 2:` … under `## Options Considered` |
| was one chosen? | a `⭐` or `**Recommended**:` marker, or `**Decision**:` under `## Outcome` |
| assumptions | the `## Assumptions` table |
| open questions | the `## Open questions` section |

## Two things to add

**1. Give each assumption a code.** The upstream template numbers the rows
`1, 2, 3`. Use `ASM-001` in that first column instead:

```markdown
| # | Assumption | Owner | Confidence | Invalidation Trigger |
|---|------------|-------|------------|----------------------|
| ASM-001 | traffic stays under 10k req/s *(status: aberta)* | @ana | High | projections change |
```

A bare number is reported as `ASM_SEM_CODIGO`. The reason is not bookkeeping: an
uncoded assumption cannot be referenced from another document, cannot be tracked
across features, and cannot be closed — so it quietly stays true forever.

Note the `*(status: ...)*` alongside the confidence level. **Confidence is not
status.** "High confidence" says how sure you are; `aberta | confirmada |
invalidada` says whether anyone has checked. The engine will not map one onto the
other, because a confident guess is still a guess.

**2. Add an open-questions section.** create-rfc has Action Items and Outcome but
no place for "we could not decide this yet". G2 needs one:

```markdown
## Open questions

- **Q-001** — do we need multi-region on day one? *(status: aberta — **blocking**)*
```

Mark a question **blocking** when the path genuinely cannot be chosen without the
answer. A blocking question left open turns G2 red — which is the point: an RFC
that has not answered its own blocker has not decided anything.

## The Outcome placeholder is not a decision

The upstream template ships `**Decision**: [Option X was chosen / RFC was
rejected / deferred]`. The engine rejects a value still wrapped in brackets. If
it did not, every freshly generated RFC would pass the gate having decided
nothing at all — which is exactly the failure this gate exists to catch.

While the decision is genuinely pending, mark the recommended option with `⭐`.
That counts as a recommendation, not as an outcome, and it lets the work proceed
while the approvers make up their minds.

---

`create-rfc` is by Tech Leads Club (github.com/tech-leads-club), CC-BY-4.0. This
integration note is an addition; the skill itself is unmodified.
