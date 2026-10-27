import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import type {
	Anchor,
	Node,
	NodeKind,
	Note,
	NoteIntent,
	BerylEvent,
	Project,
	Snapshot,
	Topic
} from '../types.ts';
import { indexByPath, parentPaths, without } from './index.ts';
import { LiveTopic } from './live.svelte.ts';
import { captureNoteKey } from './notekey.ts';
import { keys, readStored, writeStored } from './storage.ts';
import * as dock from './layout.ts';
import type { Dock, Layout, PanelId } from './layout.ts';
import { ancestorsOf, freshSince, nodeAt } from './topic.ts';

export type View = 'graph' | 'map' | 'outline' | 'frontier';
export const VIEWS: { key: View; label: string }[] = [
	{ key: 'graph', label: 'Graph' },
	{ key: 'map', label: 'Map' },
	{ key: 'outline', label: 'Outline' },
	{ key: 'frontier', label: 'Frontier' }
];

export function parseView(value: string | null | undefined): View {
	return VIEWS.some((v) => v.key === value) ? (value as View) : 'graph';
}

// docs/ui.md § Graph: containers start expanded to this depth.
export const EXPANDED_DEPTH = 3;
export const EXTRA_KINDS: NodeKind[] = ['assumption', 'fog', 'risk'];

export interface Flight {
	path: string;
	n: number;
}

export interface Toast {
	text: string;
	tone: 'ok' | 'error';
	n: number;
}

export interface BoardInit {
	snapshot: Snapshot;
	mode: 'live' | 'demo';
	view?: View;
	node?: string | null;
	since?: string | null;
	history?: (path: string) => BerylEvent[];
}

const BOARD = Symbol('board');

export function provideBoard(board: Board): void {
	setContext(BOARD, board);
}

export function useBoard(): Board {
	return getContext<Board>(BOARD);
}

export class Board {
	readonly live: LiveTopic;
	readonly mode: 'live' | 'demo';
	private readonly demoHistory?: (path: string) => BerylEvent[];

	view: View = $state('graph');
	selected: string | null = $state(null);
	anchor: Pick<Anchor, 'widget' | 'element'> = $state({});
	flight: Flight | null = $state(null);
	layout: Layout = $state(dock.defaultLayout());
	narrow = $state(false);
	dragging: PanelId | null = $state(null);
	composerFocus = $state(0);
	drawerOpen = $state(false);
	sheetOpen = $state(false);
	include: NodeKind[] = $state([]);
	query = $state('');
	since: string | null = $state(null);
	noteKey: string | null = $state(null);
	author = $state('');
	toast: Toast | null = $state(null);
	busy = $state(false);
	readonly toggled = new SvelteSet<string>();
	readonly outlineToggled = new SvelteSet<string>();
	readonly acked = new SvelteSet<string>();

	nodes: Node[];
	notes: Note[];
	topic: Topic;
	project: Project;
	byPath: Map<string, Node>;
	selectedNode: Node | null;
	parents: Set<string>;
	fresh: Set<string>;
	unsent: number;
	canWrite: boolean;

	private toastTimer: ReturnType<typeof setTimeout> | null = null;
	private flights = 0;

	constructor(init: BoardInit) {
		this.mode = init.mode;
		this.live = new LiveTopic(init.snapshot, init.mode === 'live');
		this.nodes = $derived(this.live.state.nodes);
		this.notes = $derived(this.live.state.notes);
		this.topic = $derived(this.live.state.topic);
		this.project = $derived(this.live.state.project);
		this.byPath = $derived(indexByPath(this.nodes));
		this.selectedNode = $derived(
			this.selected === null ? null : (this.byPath.get(this.selected) ?? null)
		);
		this.parents = $derived(parentPaths(this.nodes));
		this.fresh = $derived(without(freshSince(this.nodes, this.since), this.acked));
		this.unsent = $derived(this.notes.filter((n) => n.status === 'queued' && !n.sentAt).length);
		this.canWrite = $derived(this.mode === 'live' && this.noteKey !== null);
		this.demoHistory = init.history;
		this.view = init.view ?? 'graph';
		this.selected = init.node ?? null;
		if (init.since !== undefined) this.since = init.since;
	}

	start(): () => void {
		const stored = readStored(keys.layout);
		if (stored !== null) this.layout = dock.parseLayout(stored);
		else if (readStored(keys.sidebar) === '0')
			this.layout = dock.setCollapsed(this.layout, 'left', true);
		const query = matchMedia('(max-width: 900px)');
		this.narrow = query.matches;
		const onNarrow = () => (this.narrow = query.matches);
		query.addEventListener('change', onNarrow);
		const stopNarrow = () => query.removeEventListener('change', onNarrow);
		const include = readStored(keys.include);
		if (include) {
			this.include = include
				.split(',')
				.filter((k): k is NodeKind => EXTRA_KINDS.includes(k as NodeKind));
		}
		this.author = readStored(keys.author) ?? '';
		if (this.mode === 'demo') return stopNarrow;

		this.noteKey = captureNoteKey(this.project.id);
		this.since = readStored(keys.seen(this.topic.id));
		const saveVisit = () => writeStored(keys.seen(this.topic.id), this.latestWrite());
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') saveVisit();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', saveVisit);
		const stopLive = this.live.start();
		return () => {
			stopNarrow();
			stopLive();
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', saveVisit);
		};
	}

	// Stamp visits with the server's clock, never the browser's: skew would hide or invent changes.
	private latestWrite(): string {
		let latest = this.topic.updatedAt;
		for (const n of this.nodes) if (n.updatedAt > latest) latest = n.updatedAt;
		return latest;
	}

	replace(snapshot: Snapshot, since?: string | null): void {
		this.live.replace(snapshot);
		if (since !== undefined) this.since = since;
		this.acked.clear();
		if (this.selected !== null && !nodeAt(snapshot.nodes, this.selected)) this.selected = null;
	}

	select(path: string | null): void {
		if (path !== this.selected) this.anchor = {};
		this.selected = path;
		if (path !== null) this.acked.add(path);
	}

	jump(path: string): void {
		this.select(path);
		this.expandTo(path);
		this.drawerOpen = false;
		this.flight = { path, n: ++this.flights };
	}

	setView(view: View): void {
		this.view = view;
	}

	get sidebarOpen(): boolean {
		const home = dock.locate(this.layout, 'questions');
		return !!home && !this.layout[home.dock].collapsed;
	}

	setSidebar(open: boolean): void {
		const home = dock.locate(this.layout, 'questions');
		if (home) this.setLayout(dock.setCollapsed(this.layout, home.dock, !open));
	}

	setLayout(next: Layout): void {
		if (next === this.layout) return;
		this.layout = next;
		writeStored(keys.layout, JSON.stringify(next));
	}

	resetLayout(): void {
		this.layout = dock.defaultLayout();
		writeStored(keys.layout, null);
	}

	dockPanel(panel: PanelId, zone: Dock): void {
		this.setLayout(dock.moveToZone(this.layout, panel, zone));
	}

	reveal(panel: PanelId): void {
		this.setLayout(dock.reveal(this.layout, panel));
	}

	toggleInclude(kind: NodeKind): void {
		this.include = this.include.includes(kind)
			? this.include.filter((k) => k !== kind)
			: [...this.include, kind];
		writeStored(keys.include, this.include.join(','));
	}

	setAuthor(author: string): void {
		this.author = author;
		writeStored(keys.author, author || null);
	}

	isContainer(path: string): boolean {
		return this.parents.has(path);
	}

	isCollapsed(node: Node): boolean {
		const flipped = this.toggled.has(node.path);
		return node.depth > EXPANDED_DEPTH ? !flipped : flipped;
	}

	setCollapsed(node: Node, collapsed: boolean): void {
		if (this.isCollapsed(node) === collapsed) return;
		if (this.toggled.has(node.path)) this.toggled.delete(node.path);
		else this.toggled.add(node.path);
	}

	expandTo(path: string): void {
		for (const a of ancestorsOf(path)) {
			const n = this.byPath.get(a);
			if (n) this.setCollapsed(n, false);
		}
	}

	// Outline rows: containers start open, leaves start closed.
	isOutlineOpen(node: Node): boolean {
		return this.isContainer(node.path) !== this.outlineToggled.has(node.path);
	}

	setOutlineOpen(node: Node, open: boolean): void {
		if (this.isOutlineOpen(node) === open) return;
		if (this.outlineToggled.has(node.path)) this.outlineToggled.delete(node.path);
		else this.outlineToggled.add(node.path);
	}

	ackAll(): void {
		for (const path of this.fresh) this.acked.add(path);
	}

	notify(text: string, tone: Toast['tone'] = 'ok'): void {
		this.toast = { text, tone, n: (this.toast?.n ?? 0) + 1 };
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => (this.toast = null), 4200);
	}

	async history(path: string): Promise<BerylEvent[]> {
		if (this.demoHistory) return this.demoHistory(path);
		const res = await fetch(`/api/topics/${this.topic.id}/events?path=${encodeURIComponent(path)}`);
		if (!res.ok) throw new Error(`history unavailable (${res.status})`);
		const body = (await res.json()) as { events: BerylEvent[] };
		return body.events;
	}

	private async call<T>(url: string, method: string, body?: unknown): Promise<T> {
		if (!this.canWrite) throw new Error('This board is read-only');
		const res = await fetch(url, {
			method,
			headers: {
				authorization: `Bearer ${this.noteKey}`,
				...(body === undefined ? {} : { 'content-type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const json = (await res.json().catch(() => ({}))) as { error?: string };
		if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
		return json as T;
	}

	private async run<T>(work: () => Promise<T>): Promise<T | undefined> {
		this.busy = true;
		try {
			return await work();
		} catch (e) {
			this.notify(e instanceof Error ? e.message : String(e), 'error');
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	async addNote(input: { anchor: Anchor; intent: NoteIntent; text: string }): Promise<boolean> {
		const result = await this.run(() =>
			this.call<{ note: Note }>(`/api/topics/${this.topic.id}/notes`, 'POST', {
				...input,
				author: this.author
			})
		);
		if (result) this.live.upsertNote(result.note);
		return !!result;
	}

	async editNote(id: string, patch: { intent?: NoteIntent; text?: string }): Promise<boolean> {
		const result = await this.run(() =>
			this.call<{ note: Note }>(`/api/notes/${id}`, 'PATCH', patch)
		);
		if (result) this.live.upsertNote(result.note);
		return !!result;
	}

	async deleteNote(id: string): Promise<boolean> {
		const result = await this.run(() =>
			this.call<{ removed: string }>(`/api/notes/${id}`, 'DELETE')
		);
		if (result) this.live.dropNote(id);
		return !!result;
	}

	async send(): Promise<void> {
		const result = await this.run(() =>
			this.call<{ sent: number }>(`/api/topics/${this.topic.id}/send`, 'POST')
		);
		if (!result) return;
		this.notify(
			result.sent === 0
				? 'Nothing new to send'
				: `Sent ${result.sent} note${result.sent === 1 ? '' : 's'} to the agent`
		);
	}
}
