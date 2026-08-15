# ADR 0001: Store invoices as flat JSON files, not a database

## Status

Accepted

## Context

We need somewhere to persist generated invoices. Volume is low (a few dozen
a month) and there's no reporting requirement beyond "look one up by id."

## Decision

Write each invoice to `data/invoices/<id>.json`. No database.

## Consequences

Simple to inspect and back up. Will not scale past a few thousand files
without an index, but that is not where we are.
