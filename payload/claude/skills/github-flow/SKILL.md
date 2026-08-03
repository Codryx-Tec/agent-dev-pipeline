---
name: github-flow
description: This project's GitHub work pipeline - issue -> branch -> commits -> PR with Closes #N -> green CI -> merge, plus SemVer versioning by milestone, releases/tags and the reference ci.yml workflow. Use when creating an issue/branch/PR, configuring CI, planning milestones/versions, or publishing a release.
---

# GitHub work pipeline

The whole cycle goes through GitHub. Use the `gh` CLI for issues, PRs, labels, milestones and the Project.

Non-negotiable rules (also summarized in `AGENTS.md`):

- Every task has an **issue** before development starts.
- **Branch from `main`**; never commit or merge directly into `main`.
- All code goes in via a **PR** with `Closes #N` in the body.
- Merge only after **green CI**, validation, and user approval.

---

## Per-task flow

1. **Issue first.** If it doesn't exist, create it with `gh issue create`, applying:
   - Area label: `backend`, `frontend`, `database`, `infra`, `security` or `docs`.
   - Priority label: `priority: high`, `priority: medium` or `priority: low`.
   - Link the issue to the tracking Project and to a version (milestone).
2. **Branch from `main`** following the naming pattern, referencing the issue's topic:
   ```txt
   feature/short-name   fix/short-name   hotfix/short-name
   refactor/short-name  docs/short-name
   ```
3. **Small, traceable commits.** Clear messages (`feat:`, `fix:`, `docs:`, `refactor:`). Don't commit secrets or temporary files; don't mix unrelated changes.
4. **Pull Request into `main`** with `gh pr create`, describing what changed and linking the issue with `Closes #N`.
5. **Merge only after green CI, validation, and user approval.**
6. **After merge**, clean up any agent worktree tied to the task (see the `worktree-cleanup` skill) — obsolete worktrees under `.claude/worktrees/` should never be left behind once their PR lands.

If the GitHub plan doesn't allow branch protection (e.g., private repo on Free), the rule is discipline: never merge with red CI. Record the limitation as a pending item in `.spec/BEST_PRACTICES.md`.

---

## Initial setup (after the scope is approved)

The repository is always created by the user; the AI never creates the repository. Since it's an external action, confirm with the user before creating issues, a Project, or milestones.

1. Use the existing repository defined in the scope (confirm `git remote -v`).
2. Version-control `AGENTS.md`, `.spec/SCOPE.md` and the other memory files under `.spec/`.
3. Define delivery versions as SemVer milestones: start at `v0.1.0` and increment each cycle.
4. Create issues from the scope: each MVP feature becomes an issue, with an area and priority label, linked to a milestone.
5. Create a Project (GitHub Projects) with statuses: Backlog, To do, In progress, In review, Done. Link the issues.
6. Configure `.github/workflows/ci.yml` (see below) to validate every PR before merge.
7. On each completed version (all milestone issues closed and validated), create the tag and the release.

---

## Versioning and releases (SemVer)

Each version groups a set of issues in a milestone of the same name.

```txt
v0.1.0 -> Issues 1, 2, 3, 4
v0.2.0 -> Issues 5, 6, 7, 8
...
v1.0.0 -> first stable version, with the complete and validated MVP
```

Rules (`MAJOR.MINOR.PATCH`):

- `0.x.y`: project evolving toward the MVP; each cycle bumps MINOR.
- `v1.0.0`: first stable version, complete and validated MVP.
- After `v1.0.0`: MAJOR for breaking changes, MINOR for compatible new features, PATCH for fixes.
- Only create the tag once all issues in the milestone are complete and validated.
- Record every published version in `.spec/CHANGELOG.md`.

---

## Reference commands (gh CLI)

```bash
# Milestone as a version (SemVer)
gh api repos/<org>/<name>/milestones -f title="v0.1.0" -f description="First delivery cycle"

# Issue linked to a version (milestone) and to the Project
gh issue create --title "Feature title" --body "Detail" --label backend --label "priority: high" --milestone "v0.1.0"

# Project (GitHub Projects v2)
gh project create --owner <org> --title "<name> - Tracking"
gh project item-add <project-number> --owner <org> --url <issue-url>

# On completing the version: tag + release
git tag -a v0.1.0 -m "v0.1.0"
git push origin <branch> --tags
gh release create v0.1.0 --title "v0.1.0" --notes "Delivery summary"
```

Rules: don't create issues, Project, milestones, tags or releases without user confirmation; don't expose secrets in issues/descriptions/Project; keep issues in sync with the scope; record the Project creation, the initial issues, and every published version in `.spec/CHANGELOG.md`.

---

## Reference ci.yml (FastAPI + React + Docker)

Adjust paths, commands and secrets to the real project. Keep `ci.yml` aligned with the real commands (Makefile, scripts, lockfiles). CI is the safety net, it doesn't replace local validation before the PR.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  backend-tests:
    name: Backend — tests and coverage
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - name: Install Poetry
        run: pipx install poetry
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
          cache: poetry
          cache-dependency-path: backend/poetry.lock
      - run: poetry install --no-interaction
      - name: Unit and integration tests
        run: poetry run pytest --cov --cov-report=xml --cov-report=term
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v5
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: backend/coverage.xml
          flags: backend
          fail_ci_if_error: false

  frontend-build:
    name: Frontend — lint and build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm build

  docker-smoke:
    name: Docker — bring up the environment and validate (E2E)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bring up the environment (frontend + api + db)
        run: docker compose up -d --build
      - name: Wait for a healthy API
        run: timeout 120 bash -c 'until curl -fsS http://localhost:8000/api/v1/health; do sleep 3; done'
      - name: Apply migrations
        run: docker compose exec -T api alembic upgrade head
      - name: Validate the frontend is responding
        run: timeout 60 bash -c 'until curl -fsS -o /dev/null http://localhost:5173; do sleep 3; done'
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - name: E2E (Playwright) against the Docker environment
        working-directory: frontend
        run: |
          pnpm install --frozen-lockfile
          pnpm exec playwright install chromium --with-deps
          E2E_BASE_URL=http://localhost:5173 pnpm test:e2e
      - name: Logs on failure
        if: failure()
        run: docker compose logs
      - name: Tear down the environment
        if: always()
        run: docker compose down -v
```
