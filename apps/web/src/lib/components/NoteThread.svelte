<script lang="ts">
	import type { Node, Note } from '#lib/types.ts';
	import { elementsOf } from '#lib/widgets/elements.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { INTENT_LABEL, noteStage, STAGE_LABEL, TEXT_REQUIRED } from '#lib/ui/kinds.ts';
	import { stamp } from '#lib/ui/time.ts';

	let { notes, node }: { notes: Note[]; node: Node | null } = $props();

	const board = useBoard();

	let editing: string | null = $state(null);
	let draft = $state('');

	function anchorLabel(note: Note): string | null {
		const { widget: key, element } = note.anchor;
		if (!key || !node) return null;
		const widget = node.widgets.find((w) => w.key === key);
		const name = widget?.title ?? key;
		if (!element) return name;
		const label = widget ? elementsOf(widget).find((e) => e.key === element)?.label : undefined;
		return `${name} / ${label ?? element}`;
	}

	function startEdit(note: Note) {
		editing = note.id;
		draft = note.text;
	}

	async function save(note: Note) {
		if (TEXT_REQUIRED.includes(note.intent) && !draft.trim()) return;
		if (await board.editNote(note.id, { text: draft.trim() })) editing = null;
	}

	function pin(note: Note) {
		if (!note.anchor.widget) return;
		board.anchor = { widget: note.anchor.widget, element: note.anchor.element };
	}
</script>

{#if notes.length}
	<ol class="thread" data-testid="note-thread">
		{#each notes as note (note.id)}
			{@const stage = noteStage(note)}
			{@const where = anchorLabel(note)}
			<li class="note st-{stage}" data-testid="note">
				<div class="meta">
					<span class="intent i-{note.intent}">{INTENT_LABEL[note.intent]}</span>
					{#if where}
						<button
							type="button"
							class="where mono"
							title="Show where it is pinned"
							onclick={() => pin(note)}>{where}</button
						>
					{/if}
					<span class="stage">{STAGE_LABEL[stage]}</span>
				</div>
				{#if editing === note.id}
					<textarea bind:value={draft} rows="3" aria-label="Edit note"></textarea>
					<div class="edit-actions">
						<button
							type="button"
							class="small primary"
							onclick={() => save(note)}
							disabled={board.busy}>Save</button
						>
						<button type="button" class="small" onclick={() => (editing = null)}>Cancel</button>
					</div>
				{:else if note.text}
					<p class="text">{note.text}</p>
				{/if}
				<div class="by">
					{note.author || 'Someone'}, {stamp(note.createdAt)}
					{#if stage === 'queued' && board.canWrite && editing !== note.id}
						<span class="ops">
							<button type="button" class="link" onclick={() => startEdit(note)}>Edit</button>
							<button type="button" class="link" onclick={() => board.deleteNote(note.id)}
								>Delete</button
							>
						</span>
					{/if}
				</div>
				{#if note.status === 'resolved' && (note.reply || note.changed.length)}
					<div class="reply" data-testid="note-reply">
						<span class="agent">Agent</span>
						{#if note.reply}<p>{note.reply}</p>{/if}
						{#if note.changed.length}
							<div class="changed">
								{#each note.changed as path (path)}
									<button type="button" class="path" onclick={() => board.jump(path)}
										>{board.byPath.get(path)?.title ?? path}</button
									>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
{:else}
	<p class="none">No notes here yet.</p>
{/if}

<style>
	.thread {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.note {
		padding: 0.6rem 0.7rem;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
	}
	.note.st-queued,
	.note.st-sent {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		font-size: 0.74rem;
	}
	.intent {
		font-weight: 650;
		color: var(--ink);
	}
	.where {
		padding: 0 0.35rem;
		border: 0;
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--accent);
		font-size: 0.72rem;
		cursor: pointer;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stage {
		margin-left: auto;
		color: var(--muted);
	}
	.st-queued .stage,
	.st-sent .stage {
		color: var(--accent);
	}
	.st-resolved .stage {
		color: var(--settled);
	}
	.text {
		margin: 0.35rem 0 0;
		font-size: 0.86rem;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.by {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.35rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.ops {
		margin-left: auto;
		display: flex;
		gap: 0.6rem;
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.link:hover {
		color: var(--ink);
	}
	.reply {
		margin-top: 0.5rem;
		padding: 0.45rem 0.6rem;
		border-left: 2px solid var(--settled);
		border-radius: 0 6px 6px 0;
		background: color-mix(in srgb, var(--settled) 8%, transparent);
		font-size: 0.82rem;
	}
	.agent {
		font-size: 0.7rem;
		font-weight: 650;
		color: var(--settled);
	}
	.reply p {
		margin: 0.15rem 0 0;
		line-height: 1.4;
	}
	.changed {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.35rem;
	}
	.path {
		padding: 0.05rem 0.4rem;
		border-radius: 5px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.path:hover {
		border-color: var(--accent);
	}
	textarea {
		width: 100%;
		margin-top: 0.4rem;
		padding: 0.4rem 0.5rem;
		border-radius: 7px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.85rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.35rem;
	}
	.small {
		height: 26px;
		padding: 0 0.6rem;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.small.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--bg);
		font-weight: 650;
	}
	.none {
		margin: 0;
		font-size: 0.82rem;
		color: var(--muted);
	}
</style>
