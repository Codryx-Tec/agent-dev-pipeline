# Project Scope — Inscrição em Turma (exemplo)

**Scope status:** Approved
**Gathering date:** 2026-08-03
**Scope owner:** agent-dev-pipeline
**Decision:** go

> Gate G0 stays red until this line reads `**Scope status:** Approved`.
> That is deliberate: development must not start on a scope nobody signed.

---

## 1. Identification

- **Project name:** Inscrição em Turma (exemplo)
- **Goal in one sentence:** Let a visitor enrol in an open class, respecting the seat limit and requiring guardian consent for minors.
- **Problem/pain point it solves:** Enrolment is handled by hand today, so classes overfill and minors are registered with no legal basis for processing their data.

## 2. Users

- **Primary users:** a visitor enrolling themselves; a guardian consenting for a minor; an administrator watching seat counts.
- **Access profiles:** visitors are anonymous until they enrol; administrators see every enrolment.

## 3. Features

- **MVP (prioritized):**
  - [x] class-enrolment — the feature below, by its directory slug
  - [x] Enrol a visitor in a class that has seats
  - [x] Refuse enrolment when the class is full
  - [x] Require guardian data before enrolling a minor
- **Nice-to-have (post-MVP):**

## 4. Out of scope

Payment and invoicing. Cancelling an enrolment. Waiting lists. Any of these
would change what the acceptance criteria promise, so each gets its own feature
rather than creeping into this one.

## 5. Technology

- **Backend:** plain JavaScript, no framework — this is a teaching example
- **Frontend:**
- **Database:** none; the class object is passed in
- **External integrations:**
- **Authentication and authorization:**

## 6. Data and security

- **Sensitive data / LGPD:** a minor's data may only be processed with a guardian's consent, which is why P-004 exists and is executed.
- **Access restrictions:**

## 7. Operations

- **Deploy environment:**
- **Expected initial volume:**
- **Deadlines:**
- **Milestones (incremental, each testable by the user before moving on):**
  1. **M1 — Enrolment rules proven by tests.** Testable: run the suite and read the gate.

## 8. Acceptance criteria

A visitor with seats available gets in. A full class refuses. A minor without
guardian data is blocked. All three are proven by tests, not by assertion.

## 9. Delivery

- **Repository:** none; this folder ships inside agent-dev-pipeline as the worked example
- **Delivery mode:** `local-only` (default — the whole loop closes with no
  network) or `direct-PR`. Set it in `adp.config.json` under `delivery`.

## 10. Open scope items

- [x] Nothing open — this example is deliberately finished, so every gate can be green.
