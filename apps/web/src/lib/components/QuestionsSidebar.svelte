<script lang="ts">
	import { tick } from 'svelte';
	import type { Node } from '#lib/types.ts';
	import { EXTRA_KINDS, useBoard } from '#lib/ui/board.svelte.ts';
	import { openNoteCounts } from '#lib/ui/index.ts';
	import { firstLine, KIND_LABEL } from '#lib/ui/kinds.ts';
	import {
		countsOf,
		frontier,
		pendingAnswer,
		questionList,
		type QuestionGroup
	} from '#lib/ui/topic.ts';
	import Mark from './Mark.svelte';

	const board = useBoard();

	let list: HTMLElement | undefined = $state();
	let folded = $state<Record<string, boolean>>({ dropped: true });

	const groups = $derived(questionList(board.nodes, board.topic.current, board.include));
	const waiting = $derived(
		new Map(
			frontier(board.nodes, board.topic.current).leaning.map((l) => [l.node.path, l.waitingOn])
		)
	);
	const needle = $derived(board.query.trim().toLowerCase());
	const shown: QuestionGroup[] = $derived(
		groups
			.map((g) => ({
				...g,
				nodes: needle
					? g.nodes.filter(
							(n) => n.title.toLowerCase().includes(needle) || n.gist.toLowerCase().includes(needle)
						)
					: g.nodes
			}))
			.filter((g) => g.nodes.length > 0)
	);
	const total = $derived(groups.reduce((sum, g) => sum + g.nodes.length, 0));
	const counts = $derived(countsOf(board.nodes));
	const openNotes = $derived(openNoteCounts(board.notes));

	const extraLabel: Record<string, { label: string; count: number }> = $derived({
		assumption: { label: 'Assumptions', count: counts.assumptions },
		fog: { label: 'Fog', count: counts.fog },
		risk: { label: 'Risks', count: counts.risks }
	});

	function areaOf(node: Node): string | null {
		if (node.depth === 1) return null;
		const top = node.path.split('/')[0];
		return board.byPath.get(top)?.title ?? top;
	}

	function titleOf(path: string): string {
		return board.byPath.get(path)?.title ?? path;
	}

	function rows(): HTMLButtonElement[] {
		return list ? [...list.querySelectorAll<HTMLButtonElement>('button.row')] : [];
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const all = rows();
		if (!all.length) return;
		event.preventDefault();
		const at = all.indexOf(document.activeElement as HTMLButtonElement);
		const next =
			at === -1
				? event.key === 'ArrowDown'
					? 0
					: all.length - 1
				: Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
		all[next].focus();
	}

	function searchKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			rows()[0]?.focus();
		}
		if (event.key === 'Enter') {
			const first = shown[0]?.nodes[0];
			if (first) board.jump(first.path);
		}
	}

	$effect(() => {
		const path = board.selected;
		if (!path || !list) return;
		void tick().then(() => {
			const row = list?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
			row?.scrollIntoView({ block: 'nearest' });
		});
	});
</script>

{#if !board.sidebarOpen && !board.drawerOpen}
	<div class="rail">
		<button
			type="button"
			class="rail-btn"
			title="Show questions"
			aria-label="Show questions"
			onclick={() => board.setSidebar(true)}
		>
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
				<path
					d="M6 3.5 10.5 8 6 12.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
		<span class="rail-count tabular" title="{counts.questions} open questions">
			<Mark kind="decision" status="open" size={14} />
			{counts.questions}
		</span>
		<span class="rail-label">Questions</span>
	</div>
{:else}
	<div class="side">
		<div class="top">
			<div class="heading">
				<h2>Questions</h2>
				<span class="total tabular">{total}</span>
				<button
					type="button"
					class="collapse"
					title="Hide questions"
					aria-label="Hide questions"
					onclick={() => {
						board.setSidebar(false);
						board.drawerOpen = false;
					}}
				>
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
						<path
							d="M10 3.5 5.5 8l4.5 4.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</div>
			<input
				class="search"
				type="search"
				placeholder="Filter by title or gist"
				aria-label="Filter questions"
				data-testid="question-search"
				bind:value={board.query}
				onkeydown={searchKeydown}
			/>
			<div class="filters" role="group" aria-label="Also list">
				{#each EXTRA_KINDS as kind (kind)}
					{@const on = board.include.includes(kind)}
					<button
						type="button"
						class="filter"
						class:on
						aria-pressed={on}
						data-testid="include-{kind}"
						onclick={() => board.toggleInclude(kind)}
					>
						<Mark {kind} status="open" size={12} />
						{extraLabel[kind].label}
						<span class="tabular n">{extraLabel[kind].count}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="list" bind:this={list} onkeydown={keydown} data-testid="question-list">
			{#each shown as group (group.key)}
				<section class="group g-{group.key}">
					<button
						type="button"
						class="group-head"
						aria-expanded={!folded[group.key]}
						onclick={() => (folded[group.key] = !folded[group.key])}
					>
						<span>{group.label}</span>
						<span class="tabular gcount">{group.nodes.length}</span>
						<svg
							class="chev"
							class:shut={folded[group.key]}
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
					</button>
					{#if !folded[group.key]}
						<ul>
							{#each group.nodes as n (n.path)}
								{@const pending = pendingAnswer(board.notes, n.path)}
								{@const notes = openNotes.get(n.path) ?? 0}
								{@const area = areaOf(n)}
								<li>
									<button
										type="button"
										class="row s-{n.status} k-{n.kind}"
										class:selected={board.selected === n.path}
										class:fresh={board.fresh.has(n.path)}
										data-path={n.path}
										data-testid="question-row"
										aria-current={board.selected === n.path ? 'true' : undefined}
										onclick={() => board.jump(n.path)}
									>
										<span class="mark-col">
											<Mark
												kind={n.kind}
												status={n.status}
												size={15}
												current={group.key === 'current'}
											/>
										</span>
										<span class="main">
											<span class="title">
												{#if group.key === 'ready' && n.rank !== null}<span class="rank tabular"
														>#{n.rank}</span
													>{/if}
												{n.title}
											</span>
											{#if group.key === 'leaning'}
												<span class="sub waits">
													waits on {(waiting.get(n.path) ?? []).map(titleOf).join(', ')}
												</span>
											{:else if group.key === 'settled' && n.answer}
												<span class="sub answer">{firstLine(n.answer)}</span>
											{:else if group.key === 'open'}
												<span class="sub">{KIND_LABEL[n.kind]}</span>
											{/if}
											{#if area}<span class="area">{area}</span>{/if}
										</span>
										<span class="badges">
											{#if pending}
												<span
													class="badge pending"
													title="Answered on the board, waiting on the agent">{pending.intent}</span
												>
											{:else if notes}
												<span
													class="badge notes tabular"
													title="{notes} open note{notes === 1 ? '' : 's'}">{notes}</span
												>
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else}
				<p class="empty">
					{#if needle}
						Nothing matches “{board.query}”.
					{:else}
						No questions yet. They appear as the agent writes them.
					{/if}
				</p>
			{/each}
		</div>
	</div>
{/if}

<style>
	.side {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.top {
		padding: 0.8rem 0.8rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		border-bottom: 1px solid var(--line);
	}
	.heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 650;
	}
	.total {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.collapse {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.collapse:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.search {
		width: 100%;
		height: 32px;
		padding: 0 0.65rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--ink);
		font: inherit;
		font-size: 0.84rem;
	}
	.search::placeholder {
		color: var(--muted);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.filter {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.15rem 0.5rem 0.15rem 0.35rem;
		border-radius: 999px;
		border: 1px dashed var(--line);
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.filter .n {
		opacity: 0.8;
	}
	.filter.on {
		border-style: solid;
		border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
		background: color-mix(in srgb, var(--accent) 9%, transparent);
		color: var(--ink);
	}
	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.35rem 0.4rem 1.5rem;
		scrollbar-width: thin;
	}
	.group + .group {
		margin-top: 0.4rem;
	}
	.group-head {
		position: sticky;
		top: -0.35rem;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.5rem 0.45rem 0.3rem;
		border: 0;
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
	}
	.g-current .group-head {
		color: var(--accent);
	}
	.gcount {
		font-weight: 500;
		opacity: 0.8;
	}
	.chev {
		margin-left: auto;
		transition: rotate 150ms;
	}
	.chev.shut {
		rotate: -90deg;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr) auto;
		gap: 0.45rem;
		align-items: start;
		width: 100%;
		padding: 0.42rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: color-mix(in srgb, var(--surface-2) 70%, transparent);
	}
	.row.selected {
		background: var(--surface-2);
		border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
	}
	.row.fresh::after {
		content: '';
		position: absolute;
		left: -1px;
		top: 0.6rem;
		width: 3px;
		height: calc(100% - 1.2rem);
		border-radius: 2px;
		background: var(--ink);
		box-shadow: 0 0 6px var(--fresh);
	}
	.mark-col {
		padding-top: 1px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.title {
		font-size: 0.86rem;
		font-weight: 550;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.rank {
		margin-right: 0.25rem;
		color: var(--accent);
		font-size: 0.76rem;
		font-weight: 650;
	}
	.sub {
		font-size: 0.76rem;
		color: var(--muted);
		line-height: 1.3;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.waits {
		color: color-mix(in srgb, var(--accent) 60%, var(--muted));
	}
	.area {
		font-size: 0.72rem;
		color: color-mix(in srgb, var(--muted) 80%, transparent);
		font-stretch: 85%;
	}
	.s-settled .title,
	.s-parked .title {
		color: color-mix(in srgb, var(--ink) 72%, var(--muted));
		font-weight: 500;
	}
	.s-dropped .title {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
		font-weight: 450;
	}
	.badges {
		padding-top: 1px;
	}
	.badge {
		display: inline-block;
		min-width: 1.2rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 650;
		line-height: 1.2rem;
		text-align: center;
	}
	.badge.notes {
		background: var(--accent);
		color: var(--bg);
	}
	.badge.pending {
		border: 1px solid color-mix(in srgb, var(--settled) 60%, transparent);
		color: var(--settled);
		line-height: calc(1.2rem - 2px);
	}
	.empty {
		margin: 1.5rem 0.8rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.rail {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding-top: 0.6rem;
	}
	.rail-btn {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.rail-btn:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.rail-count {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.78rem;
		font-weight: 650;
	}
	.rail-label {
		writing-mode: vertical-rl;
		rotate: 180deg;
		font-size: 0.78rem;
		color: var(--muted);
		letter-spacing: 0.02em;
	}
</style>
