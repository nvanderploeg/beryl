# speculum widgets

A widget is `{ key, type, title?, data }` in a node's `widgets` (the array replaces the node's widgets whole). `key` is short and stable (`tables`, `plan`): notes pin to it. Shapes below are exact: unknown fields are rejected, so a typo comes back as a `speculum:` warning naming the field.

Shared rules:
- `change`: `"added" | "removed" | "changed" | "renamed"` on any element a proposal touches; leave it off what stays. `from` (old name) only with `"renamed"`.
- Element keys are what notes pin to; they are listed per type. Keep keys stable across turns so notes stay attached.
- Cells are strings, numbers, booleans or null. Names up to 200 chars, notes 1000, code and SQL 20 000; lists up to 200 items; `data` up to 64 KB.

## schema

Tables and columns; foreign keys draw as lines.

```json
{ "tables": [
  { "name": "memberships", "change": "added", "columns": [
    { "name": "workspace_id", "type": "bigint", "pk": true, "references": { "table": "workspaces", "column": "id" } },
    { "name": "role", "type": "enum('owner','member')", "nullable": false, "default": "'member'" } ],
    "indexes": [{ "name": "memberships_user_idx", "columns": ["user_id"], "unique": false }] },
  { "name": "realms", "change": "changed", "columns": [
    { "name": "created_by", "type": "bigint", "change": "renamed", "from": "owner_id" } ] } ] }
```

Column fields: `name type nullable? pk? unique? default? references? note? change? from?`. Table fields: `name columns indexes? note? change? from?`. Elements: `table`, `table.column`, `table#index`.

## migration

Ordered steps, with column diffs and row-level data changes.

```json
{ "dialect": "mysql", "steps": [
  { "key": "alter-realms", "op": "alter", "table": "realms", "risk": "medium", "reversible": true,
    "columns": [{ "name": "workspace_id", "change": "added", "after": "bigint not null" }],
    "sql": "ALTER TABLE realms ADD COLUMN workspace_id BIGINT NOT NULL;" },
  { "key": "seed-roles", "op": "data", "table": "roles", "title": "Role rows",
    "rows": { "columns": ["key", "label"], "items": [
      { "key": "admin", "change": "added", "values": ["admin", "Admin"] },
      { "key": "editor", "change": "changed", "values": ["editor", "Member"], "before": ["editor", "Editor"] },
      { "key": "viewer", "change": "removed", "values": ["viewer", "Viewer"] } ] } } ] }
```

`op`: `create alter drop rename backfill data`; `to` is the new name for `rename`. Step fields: `key op table to? title? note? risk? reversible? columns? rows? sql?`. Column `change` may also be `"kept"`; `before`/`after` are definitions. Row `change`: `added removed changed kept`; `values` is the row after the step (before it, when removed); `before` only on changed rows. Elements: `step`, `step.column`, `step#rowKey`.

## files

```json
{ "root": "apps/web", "files": [
  { "path": "src/routes/w/[slug]/+layout.svelte", "change": "added", "summary": "Workspace shell", "added": 80 },
  { "path": "src/routes/r/[key]/+page.svelte", "change": "renamed", "from": "src/routes/realm/[key]/+page.svelte" },
  { "path": "src/lib/server/db/schema.ts", "summary": "Read only" } ] }
```

A file without `change` is referenced, not changed. Fields: `path change? from? summary? added? removed?`. Elements: file paths.

## classes

```json
{ "classes": [
  { "key": "InviteService", "name": "InviteService", "stereotype": "service", "change": "added",
    "fields": [{ "name": "ttl", "type": "Duration", "visibility": "-" }],
    "methods": [{ "name": "accept", "params": "token: string", "returns": "Membership", "visibility": "+" }] },
  { "key": "Role", "name": "Role", "stereotype": "enum", "fields": [{ "name": "owner" }, { "name": "member" }] } ],
  "relations": [{ "from": "InviteService", "to": "Role", "kind": "uses", "label": "assigns" }] }
```

Visibility `+ - # ~`; members may set `static`, methods `abstract`. Relation `kind`: `inherits implements composes aggregates uses associates`, with `label? fromCard? toCard? change?`. Elements: `Class`, `Class.field`, `Class.method()`, `From->To`.

## options

```json
{ "question": "How are workspaces isolated?",
  "criteria": [{ "key": "effort", "label": "Effort" }, { "key": "isolation", "label": "Isolation" }],
  "options": [
    { "key": "row", "title": "Row-level workspace_id", "summary": "One schema",
      "pros": ["One migration path"], "cons": ["A missed filter leaks"],
      "scores": { "effort": "+", "isolation": "-" }, "recommended": true },
    { "key": "schema", "title": "Schema per tenant", "scores": { "effort": "-", "isolation": "+" } } ] }
```

Scores: `++ + 0 - --` or short text, keyed by criterion. At most one `recommended`, at most one `chosen` (set `chosen` when the user decides). Elements: `option`, `option.criterion`.

## sequence

```json
{ "actors": [{ "key": "owner", "label": "Owner", "kind": "person" }, { "key": "app", "label": "Tracker", "kind": "service" }],
  "steps": [
    { "key": "s1", "from": "owner", "to": "app", "label": "invite(email)", "kind": "call" },
    { "key": "s2", "from": "app", "to": "owner", "label": "invite sent", "kind": "reply" } ] }
```

Actor `kind`: `person service store external`. Step `kind`: `call reply async note`; `from` equal to `to` is a self-call. Actor and step keys share one namespace. Elements: actor and step keys.

## states

```json
{ "states": [
    { "key": "pending", "label": "Pending", "kind": "initial" },
    { "key": "accepted", "label": "Accepted", "kind": "final" } ],
  "transitions": [
    { "from": "pending", "to": "accepted", "label": "accept" },
    { "key": "resend", "from": "pending", "to": "pending", "label": "resend", "change": "added" } ] }
```

State `kind`: `initial final normal`. A transition's key defaults to `from->to`; give one when two share both ends. Elements: state and transition keys.

## api

```json
{ "endpoints": [
  { "key": "invite", "method": "POST", "path": "/api/workspaces/:slug/invites", "summary": "Invite someone",
    "auth": "admin", "request": "{ to: string; role: Role }", "response": "{ invite: Invite }", "change": "added" },
  { "key": "tool-invite", "method": "TOOL", "path": "invite_member", "summary": "MCP tool" } ] }
```

Elements: endpoint keys.

## table

```json
{ "columns": ["Action", "Owner", "Member"],
  "rows": [{ "key": "billing", "cells": ["Billing", true, false], "change": "added" }] }
```

One cell per column. Elements: row keys.

## code and markdown

```json
{ "language": "ts", "filename": "src/lib/server/can.ts", "highlight": [3], "code": "export function can() {\n\treturn true;\n}" }
{ "text": "## Draft\n\n- **Tenancy:** row-level" }
```

Code elements: `L<n>` per line. Markdown has none.
