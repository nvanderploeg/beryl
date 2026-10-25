import { ApiError, isObject } from '#lib/server/api.ts';
import { validateWidget } from '#lib/widgets/validate.ts';
import {
	EDGE_RELS,
	NODE_KINDS,
	NODE_STATUSES,
	NOTE_INTENTS,
	type AgentInfo,
	type Anchor,
	type Edge,
	type EdgeRel,
	type NodeInput,
	type NodeKind,
	type NodeStatus,
	type NoteIntent,
	type Source,
	type TopicStatus,
	type Widget
} from '#lib/types.ts';

type Body = Record<string, unknown>;

export const MAX_BATCH = 100;
export const MAX_DEPTH = 8;
export const MAX_PATH = 512;
const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const WIDGET_KEY = /^[A-Za-z0-9._-]{1,64}$/;
const INT32_MAX = 2_147_483_647;
const MAX_EDGES = 50;
const MAX_WIDGETS = 12;
const MAX_SOURCES = 20;
const MAX_CHANGED = 50;
const NODE_FIELDS = new Set([
	'path',
	'kind',
	'status',
	'title',
	'gist',
	'body',
	'recommendation',
	'answer',
	'rank',
	'edges',
	'widgets',
	'sources',
	'position'
]);
const TEXT_REQUIRED: readonly NoteIntent[] = ['answer', 'correct', 'comment', 'explore'];

function bad(message: string): never {
	throw new ApiError(400, message);
}

function text(
	body: Body,
	field: string,
	max: number,
	opts: { nonEmpty?: boolean; at?: string } = {}
): string | undefined {
	const value = body[field];
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.length > max || (opts.nonEmpty && value === '')) {
		const name = opts.at ? `${opts.at}${field}` : field;
		bad(
			`${name} must be a ${opts.nonEmpty ? 'non-empty ' : ''}string of at most ${max} characters`
		);
	}
	return value as string;
}

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		bad(`${name} must be one of ${allowed.join(', ')}`);
	}
	return value as T;
}

function defined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function parsePath(raw: unknown, name = 'path'): string {
	if (typeof raw !== 'string') return bad(`${name} must be a string`);
	const segments = raw.split('/');
	if (!segments.every((segment) => SEGMENT.test(segment))) {
		bad(`malformed ${name} "${raw}": each segment must match ${SEGMENT}`);
	}
	if (segments.length > MAX_DEPTH) bad(`${name} "${raw}" is deeper than ${MAX_DEPTH}`);
	if (raw.length > MAX_PATH) bad(`${name} "${raw}" is longer than ${MAX_PATH} characters`);
	return raw;
}

function agent(body: Body): AgentInfo | null | undefined {
	const value = body.agent;
	if (value === undefined || value === null) return value;
	if (!isObject(value)) return bad('agent must be an object');
	return defined({
		tool: text(value, 'tool', 64, { nonEmpty: true, at: 'agent.' }),
		model: text(value, 'model', 64, { nonEmpty: true, at: 'agent.' }),
		effort: text(value, 'effort', 64, { nonEmpty: true, at: 'agent.' })
	});
}

function edges(value: unknown, at: string): Edge[] {
	if (!Array.isArray(value) || value.length > MAX_EDGES) {
		return bad(`${at}edges must be an array of at most ${MAX_EDGES}`);
	}
	return value.map((raw, index) => {
		const where = `${at}edges[${index}]`;
		if (!isObject(raw)) return bad(`${where} must be an object`);
		strict(raw, ['rel', 'to', 'label'], where);
		return defined({
			rel: oneOf<EdgeRel>(raw.rel, `${where}.rel`, EDGE_RELS),
			to: parsePath(raw.to, `${where}.to`),
			label: text(raw, 'label', 120, { at: `${where}.` })
		});
	});
}

function sources(value: unknown, at: string): Source[] {
	if (!Array.isArray(value) || value.length > MAX_SOURCES) {
		return bad(`${at}sources must be an array of at most ${MAX_SOURCES}`);
	}
	return value.map((raw, index) => {
		const where = `${at}sources[${index}]`;
		if (!isObject(raw)) return bad(`${where} must be an object`);
		strict(raw, ['label', 'url', 'file', 'line'], where);
		const url = text(raw, 'url', 2048, { nonEmpty: true, at: `${where}.` });
		if (url !== undefined && !/^https?:\/\/\S+$/i.test(url)) bad(`${where}.url must be http(s)`);
		const file = text(raw, 'file', 512, { nonEmpty: true, at: `${where}.` });
		if (url === undefined && file === undefined) bad(`${where} needs a url or a file`);
		if (raw.line !== undefined) {
			if (file === undefined) bad(`${where}.line is allowed only with file`);
			if (!Number.isSafeInteger(raw.line) || (raw.line as number) < 1) {
				bad(`${where}.line must be a positive integer`);
			}
		}
		return defined({
			label: text(raw, 'label', 200, { at: `${where}.` }),
			url,
			file,
			line: raw.line as number | undefined
		});
	});
}

function widgets(value: unknown, path: string): Widget[] {
	if (!Array.isArray(value) || value.length > MAX_WIDGETS) {
		return bad(`${path}: widgets must be an array of at most ${MAX_WIDGETS}`);
	}
	const keys = new Set<string>();
	return value.map((raw, index) => {
		const named =
			isObject(raw) && typeof raw.key === 'string' && WIDGET_KEY.test(raw.key)
				? raw.key
				: `[${index}]`;
		const result = validateWidget(raw);
		if (!result.ok) return bad(`widget ${named} on ${path}: ${result.reason}`);
		if (keys.has(result.widget.key)) bad(`widget ${named} on ${path}: duplicate key`);
		keys.add(result.widget.key);
		return result.widget;
	});
}

function strict(raw: Body, allowed: readonly string[], at: string): void {
	for (const field of Object.keys(raw)) {
		if (!allowed.includes(field)) bad(`${at}: unknown field "${field}"`);
	}
}

function int(value: unknown, name: string, min: number): number {
	if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > INT32_MAX) {
		bad(`${name} must be an integer${min === 0 ? ' of at least 0' : ''}`);
	}
	return value as number;
}

export function parseNodeInput(raw: unknown, index: number, list = 'nodes'): NodeInput {
	if (!isObject(raw)) return bad(`${list}[${index}] must be an object`);
	const path = parsePath(raw.path, `${list}[${index}].path`);
	for (const field of Object.keys(raw)) {
		if (!NODE_FIELDS.has(field)) bad(`${path}: unknown field "${field}"`);
	}
	const at = `${path}: `;
	return defined({
		path,
		kind: raw.kind === undefined ? undefined : oneOf<NodeKind>(raw.kind, `${at}kind`, NODE_KINDS),
		status:
			raw.status === undefined
				? undefined
				: oneOf<NodeStatus>(raw.status, `${at}status`, NODE_STATUSES),
		title: text(raw, 'title', 120, { nonEmpty: true, at }),
		gist: text(raw, 'gist', 400, { at }),
		body: text(raw, 'body', 20_000, { at }),
		recommendation: text(raw, 'recommendation', 2000, { at }),
		answer: text(raw, 'answer', 4000, { at }),
		rank:
			raw.rank === undefined || raw.rank === null
				? (raw.rank as null | undefined)
				: int(raw.rank, `${at}rank`, 0),
		edges: raw.edges === undefined ? undefined : edges(raw.edges, at),
		widgets: raw.widgets === undefined ? undefined : widgets(raw.widgets, path),
		sources: raw.sources === undefined ? undefined : sources(raw.sources, at),
		position:
			raw.position === undefined ? undefined : int(raw.position, `${at}position`, -INT32_MAX)
	});
}

export function parseNodeInputs(value: unknown, list = 'nodes'): NodeInput[] {
	if (!Array.isArray(value) || value.length > MAX_BATCH) {
		return bad(`${list} must be an array of at most ${MAX_BATCH} nodes`);
	}
	return value.map((raw, index) => parseNodeInput(raw, index, list));
}

export function parseProjectCreate(body: Body): { name: string } {
	return { name: text(body, 'name', 200, { nonEmpty: true }) ?? 'Untitled' };
}

export function parseProjectPatch(body: Body): { name: string } {
	const name = text(body, 'name', 200, { nonEmpty: true });
	if (name === undefined) bad('name is required');
	return { name: name as string };
}

export interface TopicPatch {
	title?: string;
	destination?: string;
	summary?: string;
	status?: TopicStatus;
	current?: string | null;
	agent?: AgentInfo | null;
}

export interface TopicCreate {
	title: string;
	destination: string;
	summary: string;
	agent: AgentInfo | null;
	repo: string | null;
	branch: string | null;
	nodes: NodeInput[];
}

export function parseTopicCreate(body: Body): TopicCreate {
	const title = text(body, 'title', 200, { nonEmpty: true });
	if (title === undefined) return bad('title is required');
	return {
		title,
		destination: text(body, 'destination', 1000) ?? '',
		summary: text(body, 'summary', 2000) ?? '',
		agent: agent(body) ?? null,
		repo: text(body, 'repo', 255, { nonEmpty: true }) ?? null,
		branch: text(body, 'branch', 255, { nonEmpty: true }) ?? null,
		nodes: body.nodes === undefined ? [] : parseNodeInputs(body.nodes)
	};
}

export function parseTopicPatch(body: Body): TopicPatch {
	return defined({
		title: text(body, 'title', 200, { nonEmpty: true }),
		destination: text(body, 'destination', 1000),
		summary: text(body, 'summary', 2000),
		status:
			body.status === undefined
				? undefined
				: oneOf<TopicStatus>(body.status, 'status', ['open', 'closed']),
		current:
			body.current === undefined || body.current === null
				? (body.current as null | undefined)
				: parsePath(body.current, 'current'),
		agent: agent(body)
	});
}

export function parsePaths(body: Body): string[] {
	const value = body.paths;
	if (!Array.isArray(value) || value.length > MAX_BATCH) {
		return bad(`paths must be an array of at most ${MAX_BATCH} paths`);
	}
	return value.map((raw, index) => parsePath(raw, `paths[${index}]`));
}

export function parseMove(body: Body): { from: string; to: string } {
	return { from: parsePath(body.from, 'from'), to: parsePath(body.to, 'to') };
}

export interface NoteInput {
	anchor: Anchor;
	intent: NoteIntent;
	text: string;
	author: string;
}

function anchor(value: unknown): Anchor {
	if (!isObject(value)) return bad('anchor must be an object');
	const path =
		value.path === undefined || value.path === null ? null : parsePath(value.path, 'anchor.path');
	const result: Anchor = { path };
	if (value.widget !== undefined) {
		if (typeof value.widget !== 'string' || !WIDGET_KEY.test(value.widget)) {
			bad(`anchor.widget must match ${WIDGET_KEY}`);
		}
		if (path === null) bad('anchor.widget needs anchor.path');
		result.widget = value.widget as string;
	}
	if (value.element !== undefined) {
		const element = text(value, 'element', 200, { nonEmpty: true, at: 'anchor.' }) as string;
		if (/[\r\n]/.test(element)) bad('anchor.element must be a single line');
		if (result.widget === undefined) bad('anchor.element needs anchor.widget');
		result.element = element;
	}
	return result;
}

export function checkNoteText(intent: NoteIntent, value: string): void {
	if (value === '' && TEXT_REQUIRED.includes(intent)) bad(`text is required for ${intent}`);
}

export function parseNoteCreate(body: Body): NoteInput {
	if (body.anchor === undefined) bad('anchor is required');
	if (body.intent === undefined) bad('intent is required');
	const intent = oneOf<NoteIntent>(body.intent, 'intent', NOTE_INTENTS);
	const noteText = text(body, 'text', 4000) ?? '';
	checkNoteText(intent, noteText);
	return {
		anchor: anchor(body.anchor),
		intent,
		text: noteText,
		author: text(body, 'author', 64) ?? ''
	};
}

export function parseNotePatch(body: Body): { intent?: NoteIntent; text?: string } {
	return defined({
		intent:
			body.intent === undefined
				? undefined
				: oneOf<NoteIntent>(body.intent, 'intent', NOTE_INTENTS),
		text: text(body, 'text', 4000)
	});
}

export interface ResolveInput {
	id: string;
	reply: string;
	changed: string[];
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseResolve(body: Body): ResolveInput[] {
	const value = body.notes;
	if (!Array.isArray(value) || value.length > MAX_BATCH) {
		return bad(`notes must be an array of at most ${MAX_BATCH}`);
	}
	return value.map((raw, index) => {
		const at = `notes[${index}]`;
		if (!isObject(raw)) return bad(`${at} must be an object`);
		if (typeof raw.id !== 'string' || !UUID_V4.test(raw.id)) bad(`${at}.id must be a note id`);
		const changed = raw.changed ?? [];
		if (!Array.isArray(changed) || changed.length > MAX_CHANGED) {
			bad(`${at}.changed must be an array of at most ${MAX_CHANGED} paths`);
		}
		return {
			id: (raw.id as string).toLowerCase(),
			reply: text(raw, 'reply', 2000, { at: `${at}.` }) ?? '',
			changed: (changed as unknown[]).map((path, p) => parsePath(path, `${at}.changed[${p}]`))
		};
	});
}

export function parseTimeout(raw: string | null): number {
	if (raw === null || raw === '') return 25_000;
	if (!/^\d+$/.test(raw)) bad('timeoutMs must be a whole number of milliseconds');
	return Math.min(60_000, Math.max(1_000, Number(raw)));
}

export function parseSince(raw: string | null): number | undefined {
	if (!raw) return undefined;
	if (!/^\d+$/.test(raw)) bad('malformed since');
	return Number(raw);
}
