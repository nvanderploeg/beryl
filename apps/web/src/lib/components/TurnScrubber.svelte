<script lang="ts">
	let {
		turn,
		total,
		says,
		onturn
	}: { turn: number; total: number; says: string[]; onturn: (n: number) => void } = $props();

	const steps = $derived(Array.from({ length: total + 1 }, (_, i) => i));
	const say = $derived(turn > 0 ? says[turn - 1] : '');

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowLeft' && turn > 0) onturn(turn - 1);
		else if (event.key === 'ArrowRight' && turn < total) onturn(turn + 1);
		else return;
		event.preventDefault();
	}
</script>

<div class="scrubber" data-testid="turn-scrubber">
	<div class="controls">
		<button
			type="button"
			class="step"
			aria-label="Previous turn"
			disabled={turn === 0}
			onclick={() => onturn(turn - 1)}
		>
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
				><path
					d="M10 3.5 5.5 8l4.5 4.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		</button>
		<div class="track" role="radiogroup" aria-label="Turn" tabindex="-1" onkeydown={keydown}>
			{#each steps as n (n)}
				<button
					type="button"
					role="radio"
					class="dot"
					class:past={n < turn}
					class:on={n === turn}
					aria-checked={n === turn}
					aria-label={n === 0 ? 'Before the first turn' : `After turn ${n}`}
					tabindex={n === turn ? 0 : -1}
					data-testid="turn-{n}"
					onclick={() => onturn(n)}
				>
					<span>{n === 0 ? 'start' : n}</span>
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="step"
			aria-label="Next turn"
			disabled={turn === total}
			onclick={() => onturn(turn + 1)}
		>
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
				><path
					d="M6 3.5 10.5 8 6 12.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
		</button>
	</div>
	<p class="say" data-testid="turn-say" aria-live="polite">
		{#if turn === 0}
			<span class="who">Before the grill</span>
			<span class="line">The topic exists; the agent has not written anything yet.</span>
		{:else}
			<span class="who">Turn {turn}, the agent asked</span>
			<span class="line">{say}</span>
		{/if}
	</p>
</div>

<style>
	.scrubber {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--line);
		background: var(--surface);
		min-height: 56px;
	}
	.controls {
		flex: none;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.step {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 7px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.step:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.track {
		display: flex;
		align-items: center;
		position: relative;
	}
	.dot {
		position: relative;
		display: grid;
		place-items: center;
		min-width: 30px;
		height: 28px;
		padding: 0 0.3rem;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.dot::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 2px;
		translate: 0 -50%;
		background: var(--line);
		z-index: 0;
	}
	.dot.past::before,
	.dot.on::before {
		background: color-mix(in srgb, var(--accent) 50%, var(--line));
	}
	.dot span {
		position: relative;
		z-index: 1;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: var(--surface);
		line-height: 20px;
		border: 1px solid var(--line);
	}
	.dot.past span {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
		color: var(--ink);
	}
	.dot.on span {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
		font-weight: 700;
	}
	.say {
		flex: 1;
		min-width: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.who {
		font-size: 0.72rem;
		color: var(--muted);
	}
	.line {
		font-size: 0.88rem;
		line-height: 1.35;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	@media (max-width: 900px) {
		.scrubber {
			flex-direction: column;
			align-items: stretch;
			gap: 0.35rem;
			padding-bottom: calc(56px + 0.5rem);
		}
		.controls {
			justify-content: center;
		}
	}
</style>
