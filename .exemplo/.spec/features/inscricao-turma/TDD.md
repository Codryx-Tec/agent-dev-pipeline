# TDD: inscricao-turma

> feature: inscricao-turma
> document: TDD — HOW to build it, in detail
> owns: T-xxx (tasks, each with `Refs:` and `Arquivos:`)
> status: implementada

## 1. Shape of the solution

One module, one exported function. `inscrever({ turma, dados })` returns
`{ ok, motivo }` and decrements `turma.vagas` only when it returns `ok: true`.

## 2. Components

`src/inscricao.js` holds every rule. There is no layer beneath it, because
nothing yet would justify one — see `AGENTS.md`, YAGNI.

## 3. Data and contracts

```
turma  : { id: string, vagas: number }
dados  : { email: string, idade: number, responsavel?: { email: string } }
return : { ok: boolean, motivo?: "class full" | "guardian required" }
```

## Tasks

## T-001 — Accept the enrolment and consume a seat [concluida]

- Refs: US-001, AC-001
- Arquivos: src/inscricao.js
- Notas: the decrement lives here, per D-001.

## T-002 — Refuse a full class without touching the seat count [concluida]

- Refs: AC-002
- Arquivos: src/inscricao.js
- Notas: check before mutating; AC-002 asserts the count is unchanged.

## T-003 — Require guardian data for a minor [concluida]

- Refs: US-002, AC-003
- Arquivos: src/inscricao.js
- Notas: checked before the seat check, so a blocked minor never consumes a seat.

## Expected parallelism

All three tasks touch `src/inscricao.js`, so the planner puts them in ONE lane,
in document order. That is the correct answer rather than a limitation — and it
is exactly what the file list is for.
