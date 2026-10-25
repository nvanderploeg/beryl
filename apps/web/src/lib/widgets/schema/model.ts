import type { Change, SchemaColumn, SchemaData, SchemaIndex, SchemaTable } from '../types.ts';

// Card geometry in px. Schema.svelte renders cards at exactly these sizes; change both together.
export const HEAD_H = 30;
export const NOTE_H = 20;
export const ROW_H = 22;
export const INDEX_H = 18;
export const INDEX_PAD = 5;
export const BORDER = 1;
export const PAD_X = 8;
export const KEYS_W = 36;
export const NULL_W = 30;
export const CHG_W = 20;
export const GAP = 12;

// Font sizes in px; keep in step with the card styles in Schema.svelte.
const NAME_PX = 12;
const TYPE_PX = 11;
const HEAD_PX = 12.5;
const INDEX_PX = 10;
const FROM_PX = 10.5;
const ARROW_W = 14;

const MIN_W = 150;
const MAX_W = 340;

// Advance width of one monospace glyph per px of font size.
export const DEFAULT_MONO = 0.62;

export interface Card {
	id: string;
	name: string;
	table?: SchemaTable; // absent for a stub: a referenced table the widget does not show
	rows: { name: string; column?: SchemaColumn; change?: Change }[];
	width: number;
	height: number;
	nameW: number;
	nullable: boolean;
	changes: boolean;
}

export interface Fk {
	id: string;
	from: { card: string; row: number };
	to: { card: string; row: number }; // row -1: the card header
	change?: Change;
	element: string;
	target: string;
}

export interface SchemaModel {
	cards: Card[];
	fks: Fk[];
}

const tableId = (name: string) => `t:${name}`;
const stubId = (name: string) => `s:${name}`;

export function shownChange(table: SchemaTable, column: SchemaColumn): Change | undefined {
	const implied =
		column.change === table.change && (table.change === 'added' || table.change === 'removed');
	return implied ? undefined : column.change;
}

function nameWidth(column: SchemaColumn, mono: number): number {
	const own = (column.name.length + (column.note ? 1 : 0)) * mono * NAME_PX;
	const from =
		column.change === 'renamed' && column.from ? column.from.length * mono * FROM_PX + ARROW_W : 0;
	return own + from;
}

function typeChars(column: SchemaColumn): number {
	return column.type.length + (column.default !== undefined ? column.default.length + 3 : 0);
}

function headChars(table: SchemaTable): number {
	const renamed = table.change === 'renamed' && table.from ? table.from.length + 3 : 0;
	return table.name.length + renamed;
}

function indexChars(index: SchemaIndex): number {
	return index.name.length + index.columns.join(', ').length + 2;
}

export function cardTop(card: { table?: SchemaTable }): number {
	return BORDER + HEAD_H + (card.table?.note ? NOTE_H : 0);
}

function measure(card: Omit<Card, 'width' | 'height' | 'nameW'>, mono: number): Card {
	const columns = card.rows.flatMap((r) => (r.column ? [r.column] : []));
	const nameW = Math.ceil(
		Math.max(
			3 * mono * NAME_PX,
			...card.rows.map((r) =>
				r.column ? nameWidth(r.column, mono) : r.name.length * mono * NAME_PX
			)
		) + 2
	);
	const typeW = Math.max(0, ...columns.map(typeChars)) * mono * TYPE_PX;
	const rowW =
		KEYS_W +
		nameW +
		(typeW ? GAP + typeW : 0) +
		(card.nullable ? NULL_W : 0) +
		(card.changes ? CHG_W : 0);
	const headW =
		(card.table?.change ? CHG_W : 0) +
		(card.table ? headChars(card.table) : card.name.length) * mono * HEAD_PX +
		32;
	const indexW = Math.max(
		0,
		...(card.table?.indexes ?? []).map((i) => 34 + CHG_W + indexChars(i) * mono * INDEX_PX)
	);
	const inner = Math.max(rowW, headW, indexW) + 2 * PAD_X + 2 * BORDER + 4;
	const indexes = card.table?.indexes?.length ?? 0;
	const height =
		cardTop(card) +
		card.rows.length * ROW_H +
		(indexes ? 2 * INDEX_PAD + indexes * INDEX_H + BORDER : 0) +
		BORDER;
	return {
		...card,
		width: Math.round(Math.min(MAX_W, Math.max(MIN_W, inner))),
		height,
		nameW
	};
}

export function stack(cards: Card[], order: (id: string) => number, gap = 20, pad = 10) {
	const boxes: Record<string, Rect> = {};
	let y = pad;
	for (const card of [...cards].sort((a, b) => order(a.id) - order(b.id))) {
		boxes[card.id] = { x: pad, y, width: card.width, height: card.height };
		y += card.height + gap;
	}
	return { boxes, height: y - gap + pad };
}

export function buildModel(data: SchemaData, mono = DEFAULT_MONO): SchemaModel {
	const byName = new Map(data.tables.map((t) => [t.name, t]));
	const stubs = new Map<string, string[]>();
	for (const table of data.tables) {
		for (const column of table.columns) {
			const ref = column.references;
			if (!ref || byName.has(ref.table)) continue;
			const columns = stubs.get(ref.table) ?? [];
			if (!columns.includes(ref.column)) columns.push(ref.column);
			stubs.set(ref.table, columns);
		}
	}

	const cards: Card[] = [
		...data.tables.map((table) => {
			const rows = table.columns.map((column) => ({
				name: column.name,
				column,
				change: shownChange(table, column)
			}));
			return measure(
				{
					id: tableId(table.name),
					name: table.name,
					table,
					rows,
					nullable: table.columns.some((c) => c.nullable),
					changes: rows.some((r) => r.change)
				},
				mono
			);
		}),
		...[...stubs].map(([name, columns]) =>
			measure(
				{
					id: stubId(name),
					name,
					rows: columns.map((c) => ({ name: c })),
					nullable: false,
					changes: false
				},
				mono
			)
		)
	];

	const fks: Fk[] = [];
	for (const table of data.tables) {
		table.columns.forEach((column, row) => {
			const ref = column.references;
			if (!ref) return;
			const target = byName.get(ref.table);
			const toRow = target
				? target.columns.findIndex((c) => c.name === ref.column)
				: (stubs.get(ref.table) ?? []).indexOf(ref.column);
			fks.push({
				id: `fk:${table.name}.${column.name}`,
				from: { card: tableId(table.name), row },
				to: { card: target ? tableId(ref.table) : stubId(ref.table), row: toRow },
				change: column.change,
				element: `${table.name}.${column.name}`,
				target: ref.table
			});
		});
	}
	return { cards, fks };
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Route {
	d: string;
	many: string; // crow's foot at the referencing column
	one: string; // bar at the referenced column
	right: number; // rightmost x the line reaches
}

function anchorY(rect: Rect, card: Card, row: number): number {
	if (row < 0) return rect.y + BORDER + HEAD_H / 2;
	return rect.y + cardTop(card) + row * ROW_H + ROW_H / 2;
}

export function routeFk(
	src: Rect,
	srcCard: Card,
	srcRow: number,
	dst: Rect,
	dstCard: Card,
	dstRow: number
): Route {
	const y1 = anchorY(src, srcCard, srcRow);
	const y2 = anchorY(dst, dstCard, dstRow);
	let x1: number, x2: number, d1: number, d2: number;
	if (dst.x >= src.x + src.width) {
		[x1, d1, x2, d2] = [src.x + src.width, 1, dst.x, -1];
	} else if (dst.x + dst.width <= src.x) {
		[x1, d1, x2, d2] = [src.x, -1, dst.x + dst.width, 1];
	} else {
		[x1, d1, x2, d2] = [src.x + src.width, 1, dst.x + dst.width, 1];
	}
	let c1: number, c2: number;
	if (d1 === d2) {
		c1 = c2 = Math.max(x1, x2) + 26 + Math.min(18, Math.abs(y2 - y1) / 6);
	} else {
		const reach = Math.max(28, Math.abs(x2 - x1) / 2);
		c1 = x1 + d1 * reach;
		c2 = x2 + d2 * reach;
	}
	const d = `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`;
	const fx = x1 + d1 * 9;
	const many = `M${fx},${y1} L${x1},${y1 - 4.5} M${fx},${y1} L${x1},${y1 + 4.5} M${fx},${y1} L${x1},${y1}`;
	const bx = x2 + d2 * 6;
	const one = `M${bx},${y2 - 4.5} L${bx},${y2 + 4.5}`;
	const right = Math.max(x1, x2, fx, bx, 0.75 * Math.max(c1, c2) + 0.25 * Math.max(x1, x2));
	return { d, many, one, right };
}
