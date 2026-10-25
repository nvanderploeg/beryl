<script lang="ts">
	import type { Node, NoteIntent } from '#lib/types.ts';
	import { NOTE_INTENTS } from '#lib/types.ts';
	import { elementsOf } from '#lib/widgets/elements.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { INTENT_HINT, INTENT_LABEL, TEXT_REQUIRED } from '#lib/ui/kinds.ts';
	import { defaultIntent } from '#lib/ui/topic.ts';

	let { node }: { node: Node | null } = $props();

	const board = useBoard();
	const uid = $props.id();

	let intent: NoteIntent = $derived(defaultIntent(node));
	let text = $state('');
	let area: HTMLTextAreaElement | undefined = $state();

	const widget = $derived(
		node && board.anchor.widget
			? node.widgets.find((w) => w.key === board.anchor.widget)
			: undefined
	);
	const elementLabel = $derived.by(() => {
		if (!widget || !board.anchor.element) return null;
		return (
			elementsOf(widget).find((e) => e.key === board.anchor.element)?.label ?? board.anchor.element
		);
	});
	const needsText = $derived(TEXT_REQUIRED.includes(intent));
	const disabled = $derived(!board.canWrite);
	const ready = $derived(!disabled && !board.busy && (!needsText || text.trim().length > 0));

	export function focus() {
		area?.focus();
	}

	async function submit() {
		if (!ready) return;
		const ok = await board.addNote({
			anchor: { path: node?.path ?? null, ...board.anchor },
			intent,
			text: text.trim()
		});
		if (!ok) return;
		text = '';
		board.anchor = {};
		board.notify('Note queued. Send wakes the agent; otherwise it reads notes on its next turn.');
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void submit();
		}
	}
</script>

{#if board.mode === 'live' && !board.canWrite}
	<p class="readonly" data-testid="composer-readonly">
		This board is read-only. Notes need the private link, which the agent prints in the terminal.
	</p>
{:else}
	<form
		class="composer"
		class:disabled
		data-testid="composer"
		onsubmit={(e) => {
			e.preventDefault();
			void submit();
		}}
	>
		<div class="intents" role="radiogroup" aria-label="Intent">
			{#each NOTE_INTENTS as i (i)}
				<label class="intent" class:on={intent === i} title={INTENT_HINT[i]}>
					<input type="radio" name="{uid}-intent" value={i} bind:group={intent} {disabled} />
					{INTENT_LABEL[i]}
				</label>
			{/each}
		</div>
		<div class="anchor-line">
			<span class="anchor-label">On</span>
			<span class="anchor" data-testid="anchor-chip">
				{#if !node}
					the whole topic
				{:else if widget}
					<span class="mono">{widget.title ?? widget.key}</span>
					{#if elementLabel}<span class="sep">/</span><span class="mono el">{elementLabel}</span
						>{/if}
					<button
						type="button"
						class="x"
						aria-label="Pin to the node instead"
						title="Pin to the node instead"
						onclick={() => (board.anchor = {})}>×</button
					>
				{:else}
					{node.title}
				{/if}
			</span>
		</div>
		<textarea
			bind:this={area}
			bind:value={text}
			rows="3"
			placeholder={disabled ? 'Notes are off in the demo' : INTENT_HINT[intent]}
			aria-label="Note text"
			data-testid="composer-text"
			{disabled}
			onkeydown={keydown}></textarea>
		<div class="foot">
			<input
				class="author"
				type="text"
				placeholder="Your name"
				aria-label="Author"
				maxlength="64"
				value={board.author}
				{disabled}
				onchange={(e) => board.setAuthor(e.currentTarget.value.trim())}
			/>
			<span class="hint">{needsText ? 'Text needed' : 'Text optional'}</span>
			<button type="submit" class="add" disabled={!ready} data-testid="composer-add">
				Add note
			</button>
		</div>
		{#if disabled}
			<p class="demo-hint">The demo is read-only, so adding notes is switched off.</p>
		{/if}
	</form>
{/if}

<style>
	.composer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--bg);
	}
	.composer:focus-within {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
	}
	.intents {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.intent {
		position: relative;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--line);
		font-size: 0.76rem;
		color: var(--muted);
		cursor: pointer;
		user-select: none;
	}
	.intent input {
		position: absolute;
		opacity: 0;
		inset: 0;
		cursor: inherit;
	}
	.intent.on {
		border-color: var(--accent);
		color: var(--ink);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.intent:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.anchor-line {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.78rem;
		min-width: 0;
	}
	.anchor-label {
		color: var(--muted);
	}
	.anchor {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.05rem 0.45rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.anchor .el {
		color: var(--accent);
	}
	.sep {
		color: var(--muted);
	}
	.x {
		margin-left: 0.2rem;
		padding: 0 0.2rem;
		border: 0;
		background: none;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
	}
	textarea {
		width: 100%;
		min-height: 4.5rem;
		resize: vertical;
		padding: 0.5rem 0.6rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.86rem;
		line-height: 1.45;
	}
	textarea::placeholder,
	.author::placeholder {
		color: var(--muted);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.author {
		width: 9rem;
		height: 30px;
		padding: 0 0.5rem;
		border-radius: 7px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.8rem;
	}
	.hint {
		flex: 1;
		font-size: 0.74rem;
		color: var(--muted);
	}
	.add {
		height: 30px;
		padding: 0 0.85rem;
		border-radius: 7px;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--bg);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 650;
		cursor: pointer;
	}
	.add:disabled {
		background: none;
		color: var(--muted);
		border-color: var(--line);
		cursor: not-allowed;
	}
	.disabled .intents,
	.disabled textarea,
	.disabled .author {
		opacity: 0.6;
	}
	.demo-hint,
	.readonly {
		margin: 0;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.readonly {
		padding: 0.75rem;
		border-radius: 10px;
		border: 1px dashed var(--line);
	}
</style>
