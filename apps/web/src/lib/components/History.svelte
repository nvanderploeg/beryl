<script lang="ts">
	import { untrack } from 'svelte';
	import type { Node, Note, PalantirEvent } from '#lib/types.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { INTENT_LABEL, KIND_LABEL, STATUS_LABEL } from '#lib/ui/kinds.ts';
	import { stamp } from '#lib/ui/time.ts';

	let { path, version }: { path: string; version: string } = $props();

	const board = useBoard();

	let events: PalantirEvent[] = $state([]);
	let status: 'loading' | 'ready' | 'error' = $state('loading');

	let loaded: string | null = null;

	$effect(() => {
		const p = path;
		void version;
		let cancelled = false;
		untrack(() => {
			if (loaded !== p) {
				events = [];
				status = 'loading';
			}
		});
		board
			.history(p)
			.then((list) => {
				if (cancelled) return;
				events = list;
				loaded = p;
				status = 'ready';
			})
			.catch(() => {
				if (!cancelled) status = 'error';
			});
		return () => {
			cancelled = true;
		};
	});

	interface Line {
		seq: number;
		at: string;
		what: string;
		details: string[];
	}

	const FIELDS: (keyof Node)[] = ['title', 'gist', 'recommendation', 'answer', 'body'];

	function describe(list: PalantirEvent[]): Line[] {
		let prev: Node | null = null;
		const lines: Line[] = [];
		for (const e of list) {
			if (e.type === 'node') {
				const n = e.payload as Node;
				if (!prev) {
					lines.push({
						seq: e.seq,
						at: e.at,
						what: `Created as ${KIND_LABEL[n.kind].toLowerCase()}`,
						details: []
					});
				} else {
					const details: string[] = [];
					if (prev.kind !== n.kind)
						details.push(`kind ${KIND_LABEL[prev.kind]} → ${KIND_LABEL[n.kind]}`);
					if (prev.status !== n.status)
						details.push(`${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[n.status]}`);
					for (const f of FIELDS)
						if (prev[f] !== n[f]) details.push(`${f} ${prev[f] ? 'rewritten' : 'written'}`);
					if (prev.rank !== n.rank) details.push(`rank ${prev.rank ?? '—'} → ${n.rank ?? '—'}`);
					if (JSON.stringify(prev.edges) !== JSON.stringify(n.edges)) details.push('edges changed');
					if (JSON.stringify(prev.widgets) !== JSON.stringify(n.widgets))
						details.push(`widgets: ${n.widgets.length}`);
					if (prev.gistStale !== n.gistStale)
						details.push(n.gistStale ? 'gist went stale' : 'gist refreshed');
					lines.push({ seq: e.seq, at: e.at, what: 'Updated', details });
				}
				prev = n;
			} else if (e.type === 'node_removed') {
				lines.push({ seq: e.seq, at: e.at, what: 'Removed', details: [] });
				prev = null;
			} else if (e.type === 'note') {
				const note = e.payload as Note;
				const what =
					note.status === 'resolved'
						? 'Note resolved'
						: note.status === 'delivered'
							? 'Note delivered to the agent'
							: note.sentAt
								? 'Note sent'
								: 'Note added';
				lines.push({
					seq: e.seq,
					at: e.at,
					what: `${what} (${INTENT_LABEL[note.intent].toLowerCase()})`,
					details: note.status === 'resolved' && note.reply ? [note.reply] : []
				});
			}
		}
		return lines.reverse();
	}

	const lines = $derived(describe(events));
</script>

<div class="history" data-testid="history">
	{#if status === 'loading' && !events.length}
		<p class="muted">Loading history…</p>
	{:else if status === 'error'}
		<p class="muted">History is unavailable right now.</p>
	{:else if !lines.length}
		<p class="muted">No recorded events for this node.</p>
	{:else}
		<ol>
			{#each lines as line (line.seq)}
				<li>
					<span class="seq tabular">#{line.seq}</span>
					<div>
						<div class="what">{line.what}</div>
						{#each line.details as d, i (i)}
							<div class="detail">{d}</div>
						{/each}
						<div class="at">{stamp(line.at)}</div>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		position: relative;
	}
	li {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 0.5rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
	}
	.seq {
		font-size: 0.74rem;
		color: var(--muted);
		padding-top: 0.1rem;
	}
	.what {
		font-size: 0.85rem;
		font-weight: 550;
	}
	.detail {
		font-size: 0.8rem;
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.at {
		margin-top: 0.1rem;
		font-size: 0.72rem;
		color: color-mix(in srgb, var(--muted) 80%, transparent);
	}
	.muted {
		margin: 0;
		color: var(--muted);
		font-size: 0.85rem;
	}
</style>
