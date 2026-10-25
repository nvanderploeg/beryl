<script lang="ts">
	import type { Node, NoteIntent } from '#lib/types.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { firstLine, INTENT_LABEL, noteStage, STAGE_LABEL, toneOf } from '#lib/ui/kinds.ts';
	import { pendingAnswer } from '#lib/ui/topic.ts';
	import Mark from './Mark.svelte';

	let {
		node,
		waitingOn = [],
		current = false
	}: { node: Node; waitingOn?: string[]; current?: boolean } = $props();

	const board = useBoard();

	let writing: NoteIntent | null = $state(null);
	let text = $state('');
	let editing = $state(false);

	const pending = $derived(pendingAnswer(board.notes, node.path));
	const stage = $derived(pending ? noteStage(pending) : null);
	const showActions = $derived(board.mode === 'demo' || board.canWrite);
	const disabled = $derived(!board.canWrite || board.busy);
	const open = $derived(node.status === 'open');

	const actions = $derived.by(() => {
		const list: { intent: NoteIntent; label: string; text: boolean }[] = [];
		if (!open) return [{ intent: 'comment' as const, label: 'Comment…', text: true }];
		if (node.kind === 'decision') {
			if (node.recommendation)
				list.push({ intent: 'accept', label: 'Accept recommendation', text: false });
			list.push({ intent: 'answer', label: 'Answer…', text: true });
			list.push({ intent: 'defer', label: 'Defer', text: false });
			list.push({ intent: 'drop', label: 'Drop', text: false });
		} else if (node.kind === 'assumption') {
			list.push({ intent: 'accept', label: 'Confirm', text: false });
			list.push({ intent: 'correct', label: 'Correct…', text: true });
		} else if (node.kind === 'fog') {
			list.push({ intent: 'explore', label: 'Explore…', text: true });
		} else {
			list.push({ intent: 'comment', label: 'Comment…', text: true });
		}
		return list;
	});

	async function quick(intent: NoteIntent, withText: boolean) {
		if (withText) {
			writing = writing === intent ? null : intent;
			text = '';
			return;
		}
		if (await board.addNote({ anchor: { path: node.path }, intent, text: '' })) {
			board.notify(`${INTENT_LABEL[intent]} queued for “${node.title}”`);
		}
	}

	async function submit() {
		if (!writing || !text.trim()) return;
		if (await board.addNote({ anchor: { path: node.path }, intent: writing, text: text.trim() })) {
			writing = null;
			text = '';
		}
	}

	async function saveEdit() {
		if (!pending) return;
		if (await board.editNote(pending.id, { text: text.trim() })) editing = false;
	}

	function keydown(event: KeyboardEvent, fn: () => void) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			fn();
		}
		if (event.key === 'Escape') {
			writing = null;
			editing = false;
		}
	}
</script>

<article
	class="card tone-{toneOf(node)} k-{node.kind}"
	class:selected={board.selected === node.path}
	class:current
	class:fresh={board.fresh.has(node.path)}
	data-path={node.path}
	data-testid="frontier-card"
>
	<button
		type="button"
		class="hit"
		aria-label="Select {node.title}"
		onclick={() => board.select(node.path)}
	></button>
	<header>
		<Mark kind={node.kind} status={node.status} size={16} {current} />
		{#if node.rank !== null && open && node.kind === 'decision'}
			<span class="rank tabular">#{node.rank}</span>
		{/if}
		<h3>{node.title}</h3>
		{#if node.depth > 1}
			<span class="area">{board.byPath.get(node.path.split('/')[0])?.title}</span>
		{/if}
	</header>
	{#if node.gist}<p class="gist">{node.gist}</p>{/if}
	{#if waitingOn.length}
		<p class="waits">
			Waits on
			{#each waitingOn as path, i (path)}
				{#if i > 0},
				{/if}
				{#if board.byPath.get(path)}
					<button type="button" class="link" onclick={() => board.jump(path)}
						>{board.byPath.get(path)?.title}</button
					>
				{:else}
					<span class="mono missing">{path} (missing)</span>
				{/if}
			{/each}
		</p>
	{/if}
	{#if node.answer && !open}
		<p class="answer"><span>Answer</span>{firstLine(node.answer)}</p>
	{:else if node.recommendation}
		<p class="rec"><span>Recommendation</span>{node.recommendation}</p>
	{/if}

	{#if pending}
		<div class="pending" data-testid="frontier-pending">
			<div class="pending-head">
				<span>You: {INTENT_LABEL[pending.intent]}</span>
				<span class="stage">{STAGE_LABEL[stage ?? 'queued']}</span>
			</div>
			{#if editing}
				<textarea
					bind:value={text}
					rows="2"
					aria-label="Edit your note"
					onkeydown={(e) => keydown(e, saveEdit)}></textarea>
				<div class="row">
					<button type="button" class="act primary" onclick={saveEdit} disabled={board.busy}
						>Save</button
					>
					<button type="button" class="act" onclick={() => (editing = false)}>Cancel</button>
				</div>
			{:else}
				{#if pending.text}<p>{pending.text}</p>{/if}
				{#if stage === 'queued' && board.canWrite}
					<div class="row">
						<button
							type="button"
							class="act"
							onclick={() => {
								editing = true;
								text = pending.text;
							}}>Edit</button
						>
						<button type="button" class="act" onclick={() => board.deleteNote(pending.id)}
							>Undo</button
						>
					</div>
				{/if}
			{/if}
		</div>
	{:else if showActions}
		<div class="actions">
			{#each actions as a (a.intent)}
				<button
					type="button"
					class="act"
					class:primary={a.intent === 'accept' || a.intent === 'answer'}
					class:on={writing === a.intent}
					{disabled}
					title={board.mode === 'demo' ? 'Notes are off in the demo' : undefined}
					onclick={() => quick(a.intent, a.text)}>{a.label}</button
				>
			{/each}
		</div>
		{#if writing}
			<div class="write">
				<!-- svelte-ignore a11y_autofocus -->
				<textarea
					bind:value={text}
					rows="2"
					autofocus
					placeholder="{INTENT_LABEL[writing]} for the agent"
					aria-label="{INTENT_LABEL[writing]} text"
					onkeydown={(e) => keydown(e, submit)}></textarea>
				<div class="row">
					<button
						type="button"
						class="act primary"
						onclick={submit}
						disabled={disabled || !text.trim()}>Add {INTENT_LABEL[writing].toLowerCase()}</button
					>
					<button type="button" class="act" onclick={() => (writing = null)}>Cancel</button>
				</div>
			</div>
		{/if}
	{/if}
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
	}
	.hit {
		position: absolute;
		inset: 0;
		border: 0;
		border-radius: inherit;
		background: none;
		cursor: pointer;
	}
	.card > :not(.hit) {
		position: relative;
		pointer-events: none;
	}
	.card :is(button, textarea) {
		pointer-events: auto;
	}
	.tone-unknown {
		border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.tone-assume {
		border-style: dashed;
		border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
	}
	.tone-fog {
		border-color: color-mix(in srgb, var(--fog) 55%, var(--line));
		background-image: var(--hatch-fog);
	}
	.tone-risk {
		border-color: color-mix(in srgb, var(--risk) 60%, var(--line));
		border-left-width: 3px;
	}
	.tone-settled,
	.tone-parked,
	.tone-dropped {
		background: color-mix(in srgb, var(--surface) 50%, transparent);
		color: color-mix(in srgb, var(--ink) 66%, var(--muted));
	}
	.tone-settled h3,
	.tone-parked h3 {
		font-weight: 600;
	}
	.tone-settled .gist,
	.tone-parked .gist {
		color: var(--muted);
	}
	.tone-dropped h3 {
		text-decoration: line-through;
		color: var(--muted);
	}
	.current {
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
	.selected {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.fresh::after {
		content: '';
		position: absolute;
		top: 10px;
		right: 10px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ink);
		box-shadow: 0 0 8px var(--fresh);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	header :global(svg) {
		align-self: center;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.rank {
		font-size: 0.8rem;
		font-weight: 650;
		color: var(--accent);
	}
	.area {
		margin-left: auto;
		font-size: 0.74rem;
		color: var(--muted);
		font-stretch: 85%;
	}
	.gist {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--ink) 80%, var(--muted));
	}
	.waits {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.missing {
		color: var(--removed);
	}
	.rec,
	.answer {
		margin: 0;
		padding: 0.45rem 0.65rem;
		border-left: 2px solid var(--accent);
		border-radius: 0 7px 7px 0;
		background: color-mix(in srgb, var(--accent) 6%, transparent);
		font-size: 0.86rem;
		line-height: 1.45;
	}
	.answer {
		border-left-color: var(--settled);
		background: color-mix(in srgb, var(--settled) 7%, transparent);
	}
	.rec span,
	.answer span {
		display: block;
		font-size: 0.7rem;
		font-weight: 650;
		color: var(--accent);
	}
	.answer span {
		color: var(--settled);
	}
	.actions,
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.act {
		height: 28px;
		padding: 0 0.7rem;
		border-radius: 7px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 550;
		cursor: pointer;
	}
	.act:hover:not(:disabled),
	.act.on {
		border-color: var(--accent);
	}
	.act.primary {
		border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
		color: var(--accent);
	}
	.act:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.write {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	textarea {
		width: 100%;
		padding: 0.45rem 0.55rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		font: inherit;
		font-size: 0.86rem;
	}
	.pending {
		padding: 0.5rem 0.65rem;
		border-radius: 9px;
		border: 1px solid color-mix(in srgb, var(--settled) 50%, var(--line));
		background: color-mix(in srgb, var(--settled) 7%, transparent);
		font-size: 0.85rem;
	}
	.pending-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.74rem;
		font-weight: 650;
		color: var(--settled);
	}
	.pending p {
		margin: 0.2rem 0 0.35rem;
	}
	.stage {
		font-weight: 500;
	}
</style>
