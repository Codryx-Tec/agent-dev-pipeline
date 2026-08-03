---
name: project-kickoff
description: Guides the scope gate for a new project - requirements gathering with the user, filling in and approving .spec/SCOPE.md before writing any code. Use when starting a new project, when the repository has no code yet, or when .spec/SCOPE.md doesn't exist/is still Pending. Includes the base questions and the SCOPE.md template.
---

# Project scope gate

The AI must not start a new project without an approved scope. While `.spec/SCOPE.md` is not complete and marked as `Approved`, the project is NOT started: no folder structure, dependencies, boilerplate, or code.

## Start gate

1. If `.spec/SCOPE.md` doesn't exist, create it from the template below.
2. Run the requirements gathering with the user, answering the base questions.
3. Fill in every field. No required field can be left as `To define`.
4. Confirm with the user and mark `Scope status: Approved`.
5. Only then set up GitHub (see `github-flow` skill — initial setup) and start development.

If the scope changes during the project, update `.spec/SCOPE.md`, `.spec/CHANGELOG.md`, and the corresponding issues.

## Base gathering questions

Ask in one focused round, grouping where possible:

1. Project name and goal in one sentence.
2. What problem or pain point does the system solve?
3. Who are the users and what access profiles exist?
4. What are the essential MVP features? (prioritized list)
5. What is explicitly out of scope?
6. Use the standard stack from `AGENTS.md`/`.spec/STACK.md` or a different one? (backend, frontend, database)
7. What external integrations are needed? (systems, APIs, ERPs)
8. How will authentication and authorization work? (profiles and permissions)
9. Is there sensitive data or LGPD (Brazilian data protection law) involved? Which and with what restrictions?
10. Where will it be deployed? (staging, production, docker, cloud)
11. Are there deadlines, milestones, or intermediate deliveries?
12. What are the acceptance criteria and the project's Definition of Done?
13. GitHub repository: name, org/account and visibility (private or public)?

Record every answer in `.spec/SCOPE.md`. Open questions become `To confirm` items and must be resolved before approval.

## SCOPE.md template

```md
# Project Scope

**Scope status:** Pending | Approved
**Gathering date:** YYYY-MM-DD
**Scope owner:** Name

> While the status is not `Approved` and every required field is not filled in, development must not start.

---

## 1. Identification

- **Project name:** To define
- **Goal in one sentence:** To define
- **Problem/pain point it solves:** To define

## 2. Users

- **Primary users:** To define
- **Access profiles:** To define

## 3. Features

- **MVP (prioritized):**
  - [ ] To define
- **Nice-to-have (post-MVP):**
  - [ ] To define

## 4. Out of scope

- To define

## 5. Technology

- **Backend:** Standard from AGENTS.md/STACK.md | Other: To define
- **Frontend:** Standard from AGENTS.md/STACK.md | Other: To define
- **Database:** To define
- **External integrations:** To define
- **Authentication and authorization:** To define

## 6. Data and security

- **Sensitive data/LGPD:** To define
- **Access restrictions:** To define

## 7. Operations

- **Deploy environment:** To define
- **Deadlines and milestones:** To define

## 8. Acceptance criteria

- To define

## 9. GitHub

- **Repository:** org/name
- **Visibility:** private | public
- **Tracking Project:** link
- **Milestones:** To define

## 10. Open scope items

- [ ] To confirm: ...
```
