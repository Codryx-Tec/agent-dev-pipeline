# Project Scope — {{PROJECT}}

**Scope status:** Draft
**Gathering date:** {{DATE}}
**Scope owner:** {{OWNER}}

> Gate G0 stays red until this line reads `**Scope status:** Approved`.
> That is deliberate: development must not start on a scope nobody signed.

---

## 1. Identification

- **Project name:** {{PROJECT}}
- **Goal in one sentence:**
- **Problem/pain point it solves:**

## 2. Users

- **Primary users:**
- **Access profiles:**

## 3. Features

- **MVP (prioritized):** each line names the feature by its slug first —
  `- [ ] <feature-slug> — description`, e.g. `- [ ] student-enrolment — a
  visitor can enrol in an open class`. The slug is what `adp new` writes as
  a directory name and what the audit cross-references: a PRD whose slug
  is missing here is `PRD_UNPLACED` (G1). Checkbox state tracks delivery,
  not membership — `[x]` still counts as in the MVP.
  - [ ]
- **Nice-to-have (post-MVP):** what got pushed out — write it in
  `BACKLOG.md`, not here. Backlog items stay prose, on purpose: only a
  promoted PRD earns a tracking code.

## 4. Out of scope

Write what this project will NOT do. An empty section here is the most expensive
kind of silence: everything nobody excluded gets assumed in, by somebody.

## 5. Technology

- **Backend:**
- **Frontend:**
- **Database:**
- **External integrations:**
- **Authentication and authorization:**

## 6. Data and security

- **Sensitive data / LGPD:**
- **Access restrictions:**

## 7. Operations

- **Deploy environment:**
- **Expected initial volume:**
- **Deadlines:**
- **Milestones (incremental, each testable by the user before moving on):**
  1. **M1 — **

## 8. Acceptance criteria

Project-level outcomes. The per-feature detail belongs in each feature's
`PRD.md`, where each criterion gets a code and a test.

## 9. Delivery

- **Repository:**
- **Delivery mode:** `local-only` (default — the whole loop closes with no
  network) or `direct-PR`. Set it in `adp.config.json` under `delivery`.

## 10. Open scope items

- [ ]
