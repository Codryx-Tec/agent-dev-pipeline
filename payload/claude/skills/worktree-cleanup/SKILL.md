---
name: worktree-cleanup
description: Remove obsolete git worktrees under .claude/worktrees/ once their PR has merged or closed. Use right after a PR is merged (as the last step of the github-flow "Approved" path), when .claude/worktrees/ is piling up, or when explicitly asked to tidy up agent worktrees.
---

# Worktree cleanup

Agent tool calls with `isolation: "worktree"` create a checkout under `.claude/worktrees/agent-<id>` for the life of that task. Once the task's PR merges (or the PR is closed without merging), the worktree has no further purpose — leaving it around wastes disk and clutters `git worktree list`. Nothing removes these automatically, so they accumulate silently across sessions.

## When to run this

- Immediately after a PR is merged/closed, as the final step of the `github-flow` "Approved" path (right alongside closing the issue and updating `CHANGELOG.md`).
- Whenever `.claude/worktrees/` is inspected and found to have entries.
- On explicit request ("clean up worktrees", "tidy up .claude/worktree").

## Procedure

1. **Enumerate worktrees**, skipping the primary checkout:
   ```bash
   git worktree list --porcelain
   ```

2. **For each worktree, resolve its branch's PR state.** Don't trust `git branch --merged main` alone — squash-merged PRs (GitHub's default here) create a new commit on `main`, so the original branch never shows as an ancestor even though it's fully merged. Cross-check against `gh` instead:
   ```bash
   gh pr list --state merged --json headRefName --limit 200
   gh pr list --state closed --json headRefName --limit 200
   ```
   A worktree is obsolete if its branch appears in either list. If a branch has no associated PR at all, check whether its tip commit is an ancestor of `main` (`git merge-base --is-ancestor <branch> main`) — this catches stray/manually-created worktrees whose work already landed some other way.

3. **Verify the worktree is clean before removing it** — never discard uncommitted work:
   ```bash
   git -C <worktree-path> status --porcelain
   ```
   If it's dirty, stop and surface it to the user instead of removing or force-discarding anything. Untracked build artifacts only (`node_modules`, `.venv`, `dist`, etc.) are not a blocker — inspect what's actually dirty before deciding.

4. **Remove and prune:**
   ```bash
   git worktree remove <path>       # only for confirmed-clean, confirmed-merged worktrees
   git worktree prune -v
   ```

5. **Leave branches alone.** This cleans up the working-tree checkout only — it does not delete local or remote git branches. Branch deletion is a separate, more destructive decision and should only happen if the user asks for it explicitly.

## Notes

- This is plain git/gh hygiene, not domain work — no need to delegate it to a specialized dev agent or spawn a subagent for it. Whichever agent is already handling the PR-merge step (`techlead` in this project) should just run it inline.
- If a worktree's branch can't be confirmed merged/closed via either check, leave it and flag it rather than guessing.
