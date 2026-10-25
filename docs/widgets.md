# palantir widgets contract

A Widget is `{ key, type, title?, data }` on a Node (`docs/api.md`). This file fixes each type's `data`, its Elements and what the server checks. Types live in `apps/web/src/lib/widgets/types.ts`; the agent-facing reference is `skills/palantir/WIDGETS.md` and must agree with this file.

## Shared rules

- `Change` is `'added' | 'removed' | 'changed' | 'renamed'`. An element without `change` is unchanged.
- `from` names an element's old name; it is allowed only with `change: 'renamed'`.
- `Cell` is `string | number | boolean | null`.
- Keys are non-empty strings ≤ 64 chars, unique where the shape says so. Names and labels are ≤ 200 chars, notes and summaries ≤ 1000, code and SQL blobs ≤ 20 000.
- A Widget's serialised `data` is at most 64 KB. Lists are capped at 200 items unless stated.
- Unknown fields are rejected, so a typo is a 400, not a silently missing column.
- **Element keys** are the strings a Note's `anchor.element` uses. They are built from keys and names exactly as below and never contain a newline.

## Types

### markdown

```ts
{ text: string } // ≤ 20 000 chars
```

No Elements.

### code

```ts
{ code: string; language?: string; filename?: string; highlight?: number[] } // highlight: 1-based lines
```

Elements: `L<n>` for line n.

### schema

```ts
{
	tables: {
		name: string; // unique
		note?: string;
		change?: Change;
		from?: string;
		columns: {
			name: string; // unique within the table
			type: string;
			nullable?: boolean;
			pk?: boolean;
			unique?: boolean;
			default?: string;
			references?: { table: string; column: string };
			note?: string;
			change?: Change;
			from?: string;
		}[];
		indexes?: { name: string; columns: string[]; unique?: boolean; change?: Change }[];
	}[]; // ≤ 60
}
```

Elements: `<table>`, `<table>.<column>`, `<table>#<index>`. Relations are drawn from `references`; a reference to a table not in the widget is drawn to a stub.

### migration

```ts
{
	dialect?: string; // 'mysql', 'postgres', …
	steps: {
		key: string; // unique
		op: 'create' | 'alter' | 'drop' | 'rename' | 'backfill' | 'data';
		table: string;
		to?: string; // new table name, rename only
		title?: string;
		note?: string;
		risk?: 'low' | 'medium' | 'high';
		reversible?: boolean;
		columns?: { name: string; change: Change | 'kept'; before?: string; after?: string; note?: string }[];
		rows?: {
			columns: string[]; // ≤ 30
			items: {
				key: string; // unique within the step
				change: 'added' | 'removed' | 'changed' | 'kept';
				values: Cell[]; // one per column: the row after the step (before it, when removed)
				before?: Cell[]; // changed only: the row before the step
			}[];
		};
		sql?: string;
	}[]; // ≤ 100
}
```

Elements: `<step>`, `<step>.<column>`, `<step>#<row key>`. `before` and `after` on a column are its definition (`varchar(255) not null`); `before` is absent for an added column and `after` for a removed one. Row diffs render added rows green, removed red, changed amber with each differing cell shown as before → after.

### files

```ts
{
	root?: string;
	files: {
		path: string; // unique, '/'-separated
		change?: Change; // absent: an existing file that is referenced, not changed
		from?: string;
		summary?: string;
		added?: number; // lines
		removed?: number;
	}[]; // ≤ 500
}
```

Elements: the file `path`. Rendered as a tree grouped by directory; a directory shows the counts of the changes beneath it.

### classes

```ts
{
	classes: {
		key: string; // unique
		name: string;
		stereotype?: string; // 'interface', 'abstract', 'enum', 'entity', 'service', …
		note?: string;
		change?: Change;
		from?: string;
		fields?: { name: string; type?: string; visibility?: '+' | '-' | '#' | '~'; static?: boolean; change?: Change }[];
		methods?: {
			name: string;
			params?: string;
			returns?: string;
			visibility?: '+' | '-' | '#' | '~';
			static?: boolean;
			abstract?: boolean;
			change?: Change;
		}[];
	}[]; // ≤ 60
	relations?: {
		from: string; // class key
		to: string; // class key
		kind: 'inherits' | 'implements' | 'composes' | 'aggregates' | 'uses' | 'associates';
		label?: string;
		fromCard?: string; // '1', '0..*'
		toCard?: string;
		change?: Change;
	}[];
}
```

Elements: `<class>`, `<class>.<field>`, `<class>.<method>()`, and `<from>-><to>` for a relation (`:<kind>` appended when two relations share both ends). UML notation: hollow triangle for inherits and implements (dashed line for implements), filled diamond for composes, hollow diamond for aggregates, dashed open arrow for uses, plain line for associates.

### options

```ts
{
	question?: string;
	criteria?: { key: string; label: string }[]; // ≤ 12, keys unique
	options: {
		key: string; // unique
		title: string;
		summary?: string;
		pros?: string[];
		cons?: string[];
		scores?: Record<string, string>; // criterion key → '++' | '+' | '0' | '-' | '--' or short text
		recommended?: boolean;
		chosen?: boolean;
	}[]; // 1–12
}
```

Elements: `<option>`, `<option>.<criterion>`. At most one option is `recommended` and at most one `chosen`. `scores` keys must be criterion keys.

### sequence

```ts
{
	actors: { key: string; label: string; kind?: 'person' | 'service' | 'store' | 'external' }[]; // 1–20
	steps: {
		key: string; // unique
		from: string; // actor key
		to: string; // actor key; equal to from for a self-call
		label: string;
		kind?: 'call' | 'reply' | 'async' | 'note';
		change?: Change;
	}[];
}
```

Elements: actor keys and step keys (they share one namespace and must not collide). `reply` is a dashed arrow, `async` an open arrowhead, `note` a box over the lifelines.

### states

```ts
{
	states: { key: string; label: string; kind?: 'initial' | 'final' | 'normal'; note?: string; change?: Change }[]; // 1–60
	transitions: { key?: string; from: string; to: string; label?: string; change?: Change }[];
}
```

Elements: state keys, and each transition's `key`, defaulting to `<from>-><to>` (transition keys must be unique and must not collide with state keys).

### api

```ts
{
	endpoints: {
		key: string; // unique
		method: string; // 'GET', 'POST', … or 'TOOL' for an MCP tool
		path: string;
		summary?: string;
		auth?: string;
		request?: string; // a type or example, shown as code
		response?: string;
		change?: Change;
	}[];
}
```

Elements: endpoint keys.

### table

```ts
{
	columns: string[]; // 1–30
	rows: { key: string; cells: Cell[]; change?: Change }[]; // cells: one per column
}
```

Elements: row keys.

## Rendering

`src/lib/widgets/WidgetView.svelte` dispatches on `type`:

```ts
interface WidgetViewProps {
	widget: Widget;
	lod: 'preview' | 'full';
	marks?: Record<string, number>; // Element key → Notes pinned there
	selected?: string | null; // the selected Element key
	onselect?: (element: string) => void;
}
```

- `preview` fits a 300 × 180 box and is read-only (a graph card at close zoom). `full` is the inspector rendering.
- Each widget draws its own frame and its `title` header; a host never prints the title again.
- In `full`, every Element is clickable and calls `onselect` with its key. An Element with marks shows a count badge; the `selected` one is highlighted.
- Every Element's root carries `data-element="<key>"`. Wrap HTML Elements in `Element.svelte` and SVG ones in `shared/SvgElement.svelte`; both give the same selection, badge and change styling.
- Change markers read the same in every widget: added green, removed red with strikethrough, changed amber, renamed amber with `from → name`.
- An unknown `type` or data that fails `validateWidget` renders a fallback box naming the type and the reason, never throws.
- Colors come from the CSS custom properties in `docs/ui.md`, so both themes work.

`src/lib/widgets/elements.ts`:

```ts
export function elementsOf(widget: Widget): { key: string; label: string }[];
```

Every Element of the widget in render order; `label` is the human name (`users.email`, `create users`, `src/lib/store.ts`). Unknown or invalid data → `[]`.

`src/lib/widgets/validate.ts`:

```ts
export function validateWidget(widget: unknown): { ok: true; widget: Widget } | { ok: false; reason: string };
```

Checks `key`, `type`, `title` and `data` against this file. The server calls it for every Widget it stores; the views call it before rendering.
