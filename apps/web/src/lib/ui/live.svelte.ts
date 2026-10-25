import type { Node, Note, PalantirEvent, Snapshot, Topic } from '../types.ts';
import { applyEvent, type TopicState } from './topic.ts';

export type Connection = 'static' | 'connecting' | 'live' | 'retrying' | 'idle';

export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

const FRAME_TYPES = ['topic', 'node', 'node_removed', 'note', 'note_removed', 'send'] as const;

function framePath(type: PalantirEvent['type'], payload: PalantirEvent['payload']): string | null {
	if (type === 'node' || type === 'node_removed') return (payload as { path: string }).path;
	if (type === 'note') return (payload as Note).anchor.path;
	return null;
}

function frameTime(type: PalantirEvent['type'], payload: PalantirEvent['payload']): string {
	if (type === 'node') return (payload as Node).updatedAt;
	if (type === 'note') return (payload as Note).updatedAt;
	if (type === 'topic') return (payload as Topic).updatedAt;
	if (type === 'send') return (payload as { at: string }).at;
	return new Date().toISOString();
}

export class LiveTopic {
	state: TopicState;
	connection: Connection;
	private readonly follow: boolean;
	private source: EventSource | null = null;
	private retry: ReturnType<typeof setTimeout> | null = null;
	private attempt = 0;
	private listeners: ((event: PalantirEvent) => void)[] = [];

	constructor(snapshot: Snapshot, follow: boolean) {
		this.state = $state.raw({ ...snapshot });
		this.follow = follow;
		this.connection = $state(follow ? 'connecting' : 'static');
	}

	onEvent(listener: (event: PalantirEvent) => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	start(): () => void {
		if (!this.follow) return () => {};
		this.open();
		return () => this.stop();
	}

	private stop(): void {
		this.source?.close();
		this.source = null;
		if (this.retry) clearTimeout(this.retry);
		this.retry = null;
	}

	private open(): void {
		const url = `/api/topics/${this.state.topic.id}/stream?since=${this.state.lastSeq}`;
		const source = new EventSource(url);
		this.source = source;
		source.onopen = () => {
			this.attempt = 0;
			this.connection = 'live';
		};
		source.onerror = () => {
			if (this.source !== source) return;
			source.close();
			this.source = null;
			this.connection = 'retrying';
			const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
			this.attempt++;
			this.retry = setTimeout(() => {
				this.retry = null;
				this.open();
			}, wait);
		};
		for (const type of FRAME_TYPES) {
			source.addEventListener(type, (e) => this.frame(type, e as MessageEvent));
		}
		source.addEventListener('idle', () => {
			this.stop();
			this.connection = 'idle';
		});
	}

	private frame(type: PalantirEvent['type'], e: MessageEvent): void {
		const seq = Number(e.lastEventId);
		if (!Number.isFinite(seq)) return;
		let payload: PalantirEvent['payload'];
		try {
			payload = JSON.parse(e.data);
		} catch {
			return;
		}
		this.receive({
			seq,
			type,
			topicId: this.state.topic.id,
			path: framePath(type, payload),
			payload,
			at: frameTime(type, payload)
		});
	}

	receive(event: PalantirEvent): void {
		const next = applyEvent(this.state, event);
		if (next === this.state) return;
		this.state = next;
		for (const listener of this.listeners) listener(event);
	}

	replace(snapshot: Snapshot): void {
		this.state = { ...snapshot };
	}

	// Leave lastSeq alone: the stream event for this write must still apply.
	upsertNote(note: Note): void {
		const held = this.state.notes.find((n) => n.id === note.id);
		if (held && held.updatedAt > note.updatedAt) return;
		const notes = [...this.state.notes.filter((n) => n.id !== note.id), note].sort(
			(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
		);
		this.state = { ...this.state, notes };
	}

	dropNote(id: string): void {
		this.state = { ...this.state, notes: this.state.notes.filter((n) => n.id !== id) };
	}
}
