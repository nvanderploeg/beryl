<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Node } from '#lib/types.ts';
	import WidgetView from '#lib/widgets/WidgetView.svelte';
	import { openNoteCounts } from '#lib/ui/index.ts';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { KIND_LABEL, STATUS_LABEL, toneOf } from '#lib/ui/kinds.ts';
	import { renderMarkdown } from '#lib/ui/markdown.ts';
	import { ancestorsOf, childrenOf, countsOf, marksOf, pendingAnswer } from '#lib/ui/topic.ts';
	import Mark from './Mark.svelte';

	const board = useBoard();

	let tree: HTMLElement | undefined = $state();
	let focused: string | null = $state(board.selected);

	interface Row {
		node: Node;
		level: number;
		container: boolean;
		open: boolean;
	}

	const rows: Row[] = $derived.by(() => {
		const out: Row[] = [];
		const walk = (parent: string | null, level: number) => {
			for (const node of childrenOf(board.nodes, parent)) {
				const container = board.isContainer(node.path);
				const open = board.isOutlineOpen(node);
				out.push({ node, level, container, open });
				if (container && open) walk(node.path, level + 1);
			}
		};
		walk(null, 1);
		return out;
	});

	const unresolved = $derived(openNoteCounts(board.notes));

	const tabStop = $derived(
		rows.some((r) => r.node.path === focused) ? focused : (rows[0]?.node.path ?? null)
	);

	function focusRow(
		path: string,
		scroll: ScrollIntoViewOptions = { block: 'nearest' },
		takeFocus = true
	) {
		focused = path;
		void tick().then(() => {
			const el = tree?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
			if (takeFocus) el?.focus({ preventScroll: true });
			el?.scrollIntoView(scroll);
		});
	}

	function keydown(event: KeyboardEvent, row: Row) {
		const at = rows.findIndex((r) => r.node.path === row.node.path);
		switch (event.key) {
			case 'ArrowDown':
				if (rows[at + 1]) focusRow(rows[at + 1].node.path);
				break;
			case 'ArrowUp':
				if (rows[at - 1]) focusRow(rows[at - 1].node.path);
				break;
			case 'ArrowRight':
				if (!row.open) board.setOutlineOpen(row.node, true);
				else if (row.container && rows[at + 1]?.level > row.level) focusRow(rows[at + 1].node.path);
				break;
			case 'ArrowLeft':
				if (row.open) board.setOutlineOpen(row.node, false);
				else if (row.node.parentPath) focusRow(row.node.parentPath);
				break;
			case 'Home':
				if (rows[0]) focusRow(rows[0].node.path);
				break;
			case 'End':
				if (rows.length) focusRow(rows[rows.length - 1].node.path);
				break;
			case 'Enter':
			case ' ':
				board.select(row.node.path);
				break;
			default:
				return;
		}
		event.preventDefault();
	}

	function reveal(path: string, smooth: boolean) {
		for (const a of ancestorsOf(path)) {
			const n = board.byPath.get(a);
			if (n) board.setOutlineOpen(n, true);
		}
		// Leave focus where it is: the sidebar keeps it while someone arrows through questions.
		focusRow(path, { block: 'center', behavior: smooth ? 'smooth' : 'auto' }, false);
	}

	let lastFlight = board.flight?.n ?? 0;
	$effect(() => {
		const f = board.flight;
		if (!f || f.n === lastFlight) return;
		lastFlight = f.n;
		reveal(f.path, true);
	});

	onMount(() => {
		if (board.selected) reveal(board.selected, false);
	});
</script>

<div class="outline" data-testid="outline-view">
	<ul class="tree" role="tree" aria-label="Outline" bind:this={tree}>
		{#each rows as row (row.node.path)}
			{@const n = row.node}
			{@const counts = row.container ? countsOf(board.nodes, n.path) : null}
			{@const notes = unresolved.get(n.path) ?? 0}
			{@const pending = pendingAnswer(board.notes, n.path)}
			{@const current = board.topic.current === n.path}
			{@const detail = row.open}
			<li
				class="item tone-{toneOf(n)} s-{n.status}"
				class:selected={board.selected === n.path}
				class:fresh={board.fresh.has(n.path)}
				class:current
				style:--level={row.level}
				role="treeitem"
				aria-level={row.level}
				aria-expanded={row.container || n.gist || n.body || n.widgets.length ? row.open : undefined}
				aria-selected={board.selected === n.path}
				data-path={n.path}
				data-testid="outline-row"
				tabindex={tabStop === n.path ? 0 : -1}
				onkeydown={(e) => {
					if (e.target === e.currentTarget) keydown(e, row);
				}}
				onfocus={(e) => {
					if (e.target === e.currentTarget) focused = n.path;
				}}
			>
				<div class="line">
					<button
						type="button"
						class="twisty"
						class:open={row.open}
						tabindex="-1"
						aria-label={row.open ? 'Collapse' : 'Expand'}
						onclick={() => board.setOutlineOpen(n, !row.open)}
					>
						<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
							<path
								d="M4.5 3 7.5 6 4.5 9"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
					<button
						type="button"
						class="pick"
						tabindex="-1"
						onclick={() => {
							focused = n.path;
							board.select(n.path);
						}}
						ondblclick={() => board.setOutlineOpen(n, !row.open)}
					>
						<Mark kind={n.kind} status={n.status} size={15} {current} />
						<span class="title">{n.title}</span>
						{#if n.status === 'open' && n.kind === 'decision' && n.rank !== null}
							<span class="rank tabular">#{n.rank}</span>
						{/if}
						{#if current}<span class="now">Now asking</span>{/if}
						<span class="kind">{KIND_LABEL[n.kind]}</span>
						{#if n.kind !== 'area'}<span class="status">{STATUS_LABEL[n.status]}</span>{/if}
						{#if counts}
							<span class="counts tabular">
								{#if counts.questions}<span class="q">{counts.questions} open</span>{/if}
								{#if counts.assumptions + counts.fog + counts.risks}
									<span class="u">{counts.assumptions + counts.fog + counts.risks} unknown</span>
								{/if}
								<span>{counts.settled}/{counts.total}</span>
							</span>
						{/if}
						{#if pending}
							<span class="badge pending" title="Answered on the board, waiting on the agent"
								>{pending.intent}</span
							>
						{:else if notes}
							<span class="badge tabular" title="{notes} open notes">{notes}</span>
						{/if}
					</button>
				</div>
				{#if detail && (n.gist || n.body || n.recommendation || n.answer || n.widgets.length)}
					<div class="detail">
						{#if n.gist}<p class="gist">{n.gist}</p>{/if}
						{#if n.answer}
							<p class="ans"><span>Answer</span>{n.answer}</p>
						{:else if n.recommendation}
							<p class="rec"><span>Recommendation</span>{n.recommendation}</p>
						{/if}
						{#if n.body}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it with html disabled -->
							<div class="pw-prose body">{@html renderMarkdown(n.body)}</div>
						{/if}
						{#each n.widgets as w (w.key)}
							<div class="widget">
								<WidgetView
									widget={w}
									lod="full"
									marks={marksOf(board.notes, n.path, w.key)}
									selected={board.selected === n.path && board.anchor.widget === w.key
										? (board.anchor.element ?? null)
										: null}
									onselect={(el) => {
										board.select(n.path);
										board.anchor = { widget: w.key, element: el };
									}}
								/>
							</div>
						{/each}
					</div>
				{/if}
			</li>
		{:else}
			<li class="empty">Nothing on the board yet. Nodes appear as the agent writes them.</li>
		{/each}
	</ul>
</div>

<style>
	.outline {
		height: 100%;
		overflow-y: auto;
		padding: 1rem clamp(0.5rem, 3vw, 2.5rem) 4rem;
		scrollbar-width: thin;
	}
	.tree {
		margin: 0 auto;
		padding: 0;
		max-width: 60rem;
		list-style: none;
	}
	.item {
		--indent: calc((var(--level) - 1) * 1.35rem);
		position: relative;
		border-radius: 8px;
		outline: none;
	}
	.item:focus-visible > .line {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding-left: var(--indent);
		border-radius: 8px;
	}
	.item.selected > .line {
		background: var(--surface-2);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.line:hover {
		background: color-mix(in srgb, var(--surface-2) 60%, transparent);
	}
	.twisty {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--muted);
		cursor: pointer;
		transition: rotate 120ms;
	}
	.twisty.open {
		rotate: 90deg;
	}
	.pick {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.42rem 0.5rem 0.42rem 0.15rem;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.title {
		min-width: 0;
		font-size: 0.9rem;
		font-weight: 550;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item[aria-level='1'] > .line .title {
		font-size: 0.98rem;
		font-weight: 650;
	}
	.rank {
		color: var(--accent);
		font-size: 0.78rem;
		font-weight: 650;
	}
	.now {
		padding: 0 0.45rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.7rem;
		font-weight: 650;
	}
	.kind,
	.status {
		font-size: 0.74rem;
		color: var(--muted);
	}
	.kind {
		margin-left: auto;
		font-stretch: 85%;
	}
	.tone-unknown .status,
	.tone-assume .status,
	.tone-risk .status {
		color: var(--accent);
	}
	.tone-fog .status {
		color: var(--fog);
	}
	.counts {
		display: inline-flex;
		gap: 0.45rem;
		font-size: 0.74rem;
		color: var(--muted);
	}
	.counts .q,
	.counts .u {
		color: var(--accent);
		font-weight: 600;
	}
	.badge {
		min-width: 1.2rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.68rem;
		font-weight: 650;
		line-height: 1.2rem;
		text-align: center;
	}
	.badge.pending {
		background: none;
		border: 1px solid color-mix(in srgb, var(--settled) 60%, transparent);
		color: var(--settled);
	}
	.s-settled > .line .title,
	.s-parked > .line .title {
		color: color-mix(in srgb, var(--ink) 70%, var(--muted));
		font-weight: 500;
	}
	.s-dropped > .line .title {
		color: var(--muted);
		text-decoration: line-through;
	}
	.fresh > .line::before {
		content: '';
		position: absolute;
		left: calc(var(--indent) - 6px);
		top: 0.7rem;
		width: 4px;
		height: 1rem;
		border-radius: 2px;
		background: var(--ink);
		box-shadow: 0 0 6px var(--fresh);
	}
	.current > .line {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.detail {
		margin: 0.1rem 0 0.7rem calc(var(--indent) + 2.6rem);
		padding: 0.15rem 0 0.2rem 0.9rem;
		border-left: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		max-width: 46rem;
	}
	.gist {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--ink) 80%, var(--muted));
	}
	.rec,
	.ans {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.5;
	}
	.rec span,
	.ans span {
		display: block;
		font-size: 0.72rem;
		font-weight: 650;
	}
	.rec span {
		color: var(--accent);
	}
	.ans span {
		color: var(--settled);
	}
	.widget {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.empty {
		padding: 2rem;
		color: var(--muted);
	}
	@media (max-width: 640px) {
		.kind,
		.status {
			display: none;
		}
		.detail {
			margin-left: calc(var(--indent) + 1.2rem);
		}
	}
</style>
