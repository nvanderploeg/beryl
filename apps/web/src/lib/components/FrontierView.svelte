<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Node } from '#lib/types.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { frontier } from '#lib/ui/topic.ts';
	import FrontierCard from './FrontierCard.svelte';

	const board = useBoard();

	let root: HTMLElement | undefined = $state();
	let opened = $state<Record<string, boolean>>({});

	const f = $derived(frontier(board.nodes, board.topic.current));
	const questions = (status: Node['status']) =>
		board.nodes.filter(
			(n) => n.status === status && (n.kind === 'decision' || n.status !== 'open')
		);
	const settled = $derived(
		questions('settled')
			.filter(
				(n) =>
					n.kind !== 'area' && n.kind !== 'fact' && n.kind !== 'term' && n.kind !== 'constraint'
			)
			.sort((a, b) => b.statusSince.localeCompare(a.statusSince))
	);
	const parked = $derived(questions('parked').filter((n) => n.kind !== 'area'));
	const dropped = $derived(questions('dropped').filter((n) => n.kind !== 'area'));

	const folded = [
		{ key: 'settled', label: 'Settled', nodes: () => settled },
		{ key: 'parked', label: 'Parked', nodes: () => parked },
		{ key: 'dropped', label: 'Dropped', nodes: () => dropped }
	];

	async function reveal(path: string, smooth: boolean) {
		const node = board.byPath.get(path);
		if (!node) return;
		for (const s of folded) if (s.nodes().some((n) => n.path === path)) opened[s.key] = true;
		await tick();
		const el = root?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
		el?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
		if (el && smooth) {
			el.classList.remove('flash');
			void el.offsetWidth;
			el.classList.add('flash');
		}
	}

	let lastFlight = board.flight?.n ?? 0;
	$effect(() => {
		const flight = board.flight;
		if (!flight || flight.n === lastFlight) return;
		lastFlight = flight.n;
		void reveal(flight.path, true);
	});

	onMount(() => {
		if (board.selected) void reveal(board.selected, false);
	});

	const empty = $derived(
		!f.current &&
			!f.ready.length &&
			!f.leaning.length &&
			!f.assumptions.length &&
			!f.fog.length &&
			!f.risks.length
	);
</script>

{#snippet section(title: string, hint: string, nodes: Node[], key: string)}
	{#if nodes.length}
		<section class="sec s-{key}" data-testid="frontier-{key}">
			<h2>{title} <span class="n tabular">{nodes.length}</span></h2>
			<p class="hint">{hint}</p>
			<div class="cards">
				{#each nodes as n (n.path)}
					<FrontierCard node={n} />
				{/each}
			</div>
		</section>
	{/if}
{/snippet}

<div class="frontier" bind:this={root} data-testid="frontier-view">
	<div class="col">
		{#if board.mode === 'live' && !board.canWrite}
			<p class="readonly">
				{board.locked
					? 'This session timed out. Ask the agent for a new private link to answer ahead.'
					: 'This board is read-only. Answering ahead needs the private link, which the agent prints in the terminal.'}
			</p>
		{:else if board.mode === 'demo'}
			<p class="readonly">
				Answer ahead in your own order. In the demo the actions are switched off.
			</p>
		{/if}

		{#if f.current}
			<section class="sec s-current" data-testid="frontier-current">
				<h2>Now asking</h2>
				<p class="hint">The question the agent has open in the terminal.</p>
				<div class="cards">
					<FrontierCard node={f.current} current />
				</div>
			</section>
		{/if}

		{@render section(
			'Ready',
			'Everything these rely on is settled, in the order the agent would ask.',
			f.ready,
			'ready'
		)}

		{#if f.leaning.length}
			<section class="sec s-leaning" data-testid="frontier-leaning">
				<h2>Waiting <span class="n tabular">{f.leaning.length}</span></h2>
				<p class="hint">These lean on something still open. You can answer them anyway.</p>
				<div class="cards">
					{#each f.leaning as l (l.node.path)}
						<FrontierCard node={l.node} waitingOn={l.waitingOn} />
					{/each}
				</div>
			</section>
		{/if}

		{@render section(
			'Assumptions to confirm',
			'What the agent is taking for granted.',
			f.assumptions,
			'assumptions'
		)}
		{@render section(
			'Fog to explore',
			'Areas that matter but are not yet questions.',
			f.fog,
			'fog'
		)}
		{@render section('Risks', 'What could go wrong if left alone.', f.risks, 'risks')}

		{#if empty}
			<p class="empty">Nothing open right now. When the agent adds questions, they line up here.</p>
		{/if}

		{#each folded as s (s.key)}
			{@const list = s.nodes()}
			{#if list.length}
				<section class="sec folded s-{s.key}">
					<button
						type="button"
						class="fold"
						aria-expanded={!!opened[s.key]}
						onclick={() => (opened[s.key] = !opened[s.key])}
					>
						<svg
							class:shut={!opened[s.key]}
							viewBox="0 0 12 12"
							width="10"
							height="10"
							aria-hidden="true"
						>
							<path
								d="M3 4.5 6 7.5 9 4.5"
								fill="none"
								stroke="currentColor"
								stroke-width="1.4"
								stroke-linecap="round"
							/>
						</svg>
						{s.label}
						<span class="n tabular">{list.length}</span>
					</button>
					{#if opened[s.key]}
						<div class="cards">
							{#each list as n (n.path)}
								<FrontierCard node={n} />
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		{/each}
	</div>
</div>

<style>
	.frontier {
		height: 100%;
		overflow-y: auto;
		padding: 1.25rem clamp(0.75rem, 3vw, 2.5rem) 5rem;
		scrollbar-width: thin;
	}
	.col {
		max-width: 46rem;
		margin: 0 auto;
	}
	.readonly {
		margin: 0 0 1.25rem;
		padding: 0.6rem 0.8rem;
		border-radius: 10px;
		border: 1px dashed var(--line);
		color: var(--muted);
		font-size: 0.84rem;
	}
	.sec {
		margin-bottom: 1.75rem;
	}
	h2 {
		margin: 0;
		font-size: 1.02rem;
		font-weight: 650;
		letter-spacing: -0.01em;
	}
	.s-current h2 {
		color: var(--accent);
	}
	.n {
		margin-left: 0.25rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--muted);
	}
	.hint {
		margin: 0.15rem 0 0.7rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.folded {
		margin-bottom: 0.6rem;
	}
	.fold {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		width: 100%;
		padding: 0.55rem 0;
		border: 0;
		border-top: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 600;
		cursor: pointer;
	}
	.fold:hover {
		color: var(--ink);
	}
	.fold svg {
		transition: rotate 150ms;
	}
	.fold svg.shut {
		rotate: -90deg;
	}
	.folded .cards {
		margin-top: 0.3rem;
	}
	.empty {
		margin: 2rem 0;
		color: var(--muted);
	}
	.frontier :global(.flash) {
		animation: pw-pulse 900ms var(--ease) 2;
	}
</style>
