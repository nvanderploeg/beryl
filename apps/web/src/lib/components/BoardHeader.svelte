<script lang="ts">
	import { resolve } from '$app/paths';
	import { useBoard, VIEWS } from '#lib/ui/board.svelte.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { countsOf, progressOf } from '#lib/ui/topic.ts';
	import type { NodeKind } from '#lib/types.ts';
	import Mark from './Mark.svelte';
	import Orb from './Orb.svelte';

	const board = useBoard();

	let destinationOpen = $state(false);
	let freshOpen = $state(false);

	const counts = $derived(countsOf(board.nodes));
	const progress = $derived(progressOf(board.nodes));
	const pct = $derived(progress.total ? Math.round((progress.settled / progress.total) * 100) : 0);
	const freshNodes = $derived(board.nodes.filter((n) => board.fresh.has(n.path)));
	const unknowns = $derived(counts.questions + counts.assumptions + counts.fog + counts.risks);

	const chips: {
		kind: NodeKind;
		key: 'questions' | 'assumptions' | 'fog' | 'risks';
		one: string;
		many: string;
	}[] = [
		{ kind: 'decision', key: 'questions', one: 'question', many: 'questions' },
		{ kind: 'assumption', key: 'assumptions', one: 'assumption', many: 'assumptions' },
		{ kind: 'fog', key: 'fog', one: 'fog', many: 'fog' },
		{ kind: 'risk', key: 'risks', one: 'risk', many: 'risks' }
	];

	const connection = $derived(
		{
			static: { label: 'Demo', title: 'A scripted grill; nothing streams' },
			connecting: { label: 'Connecting', title: 'Opening the stream' },
			live: { label: 'Live', title: 'Following the agent as it writes' },
			retrying: { label: 'Reconnecting', title: 'The stream dropped; retrying' },
			idle: { label: 'Paused — reload to follow', title: 'No writes for a long while' }
		}[board.live.connection]
	);

	const sendTitle = $derived(
		board.mode === 'demo'
			? 'Notes are off in the demo'
			: board.unsent === 0
				? 'No queued notes to send'
				: 'Send queued notes and wake the waiting agent'
	);

	function chipClick(kind: NodeKind) {
		if (kind !== 'decision' && !board.include.includes(kind)) board.toggleInclude(kind);
		if (matchMedia('(max-width: 900px)').matches) board.drawerOpen = true;
		else if (!board.sidebarOpen) board.setSidebar(true);
	}

	async function share() {
		const link = location.href.split('#')[0];
		try {
			await navigator.clipboard.writeText(link);
			board.notify('Share link copied. It opens the board read-only.');
		} catch {
			board.notify(`Copy this link: ${link}`);
		}
	}

	function toggleSidebar() {
		if (matchMedia('(max-width: 900px)').matches) board.drawerOpen = !board.drawerOpen;
		else board.setSidebar(!board.sidebarOpen);
	}

	const home = $derived(
		board.mode === 'demo' ? resolve('/') : resolve('/p/[id]', { id: board.project.id })
	);
</script>

<header class="head" data-testid="board-header">
	<div class="row one">
		<button
			type="button"
			class="icon-btn"
			aria-label="Toggle questions"
			title="Questions"
			onclick={toggleSidebar}
		>
			<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
				<path
					d="M2.5 4h11M2.5 8h7M2.5 12h9"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
		<a class="orb-link" href={home} title={board.project.name}>
			<Orb size={26} heat={unknowns} />
		</a>
		<div class="ident">
			<div class="title-line">
				<h1 data-testid="topic-title">{board.topic.title}</h1>
				<span class="status" class:closed={board.topic.status === 'closed'}>
					{board.topic.status === 'closed' ? 'Closed' : 'Open'}
				</span>
			</div>
			{#if board.topic.destination}
				<button
					type="button"
					class="destination"
					class:open={destinationOpen}
					aria-expanded={destinationOpen}
					title={destinationOpen ? 'Collapse' : board.topic.destination}
					onclick={() => (destinationOpen = !destinationOpen)}
				>
					<span class="dest-label">Destination</span>
					<span class="dest-text">{board.topic.destination}</span>
				</button>
			{/if}
		</div>
		<div class="right">
			{#if freshNodes.length}
				<div class="fresh-wrap">
					<button
						type="button"
						class="fresh"
						aria-expanded={freshOpen}
						data-testid="fresh-chip"
						onclick={() => (freshOpen = !freshOpen)}
					>
						<span class="fresh-dot"></span>
						{freshNodes.length} changed {board.mode === 'demo'
							? 'this turn'
							: 'since your last visit'}
					</button>
					{#if freshOpen}
						<div class="pop" role="dialog" aria-label="Changed nodes">
							<ul>
								{#each freshNodes as n (n.path)}
									<li>
										<button
											type="button"
											onclick={() => {
												board.jump(n.path);
												freshOpen = false;
											}}
										>
											<Mark kind={n.kind} status={n.status} size={14} />
											<span>{n.title}</span>
										</button>
									</li>
								{/each}
							</ul>
							<button
								type="button"
								class="link"
								onclick={() => {
									board.ackAll();
									freshOpen = false;
								}}>Mark all as seen</button
							>
						</div>
					{/if}
				</div>
			{/if}
			{#if board.live.connection === 'idle'}
				<button
					type="button"
					class="conn idle"
					title={connection.title}
					data-testid="connection"
					onclick={() => location.reload()}><i></i>{connection.label}</button
				>
			{:else}
				<span class="conn {board.live.connection}" title={connection.title} data-testid="connection"
					><i></i>{connection.label}</span
				>
			{/if}
			<button
				type="button"
				class="icon-btn"
				aria-label="Theme: {theme.mode}"
				title="Theme: {theme.mode}"
				data-testid="theme-toggle"
				onclick={() => theme.cycle()}
			>
				{#if theme.mode === 'system'}
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
						><circle
							cx="8"
							cy="8"
							r="5.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
						/><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" /></svg
					>
				{:else if theme.mode === 'light'}
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
						><circle
							cx="8"
							cy="8"
							r="3"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
						/><path
							d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linecap="round"
						/></svg
					>
				{:else}
					<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
						><path
							d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z"
							fill="none"
							stroke="currentColor"
							stroke-width="1.4"
							stroke-linejoin="round"
						/></svg
					>
				{/if}
			</button>
		</div>
	</div>

	<div class="row two">
		<div class="gauges">
			<div
				class="progress"
				title="{progress.settled} of {progress.total} questions settled"
				data-testid="progress"
			>
				<div class="bar"><span style:width="{pct}%"></span></div>
				<span class="tabular"><strong>{progress.settled}</strong> of {progress.total} settled</span>
			</div>
			<ul class="chips" aria-label="Open unknowns">
				{#each chips as c (c.key)}
					<li>
						<button
							type="button"
							class="chip"
							class:zero={counts[c.key] === 0}
							data-testid="count-{c.key}"
							title="Show {c.many} in the sidebar"
							onclick={() => chipClick(c.kind)}
						>
							<Mark kind={c.kind} status="open" size={13} />
							<span class="tabular">{counts[c.key]}</span>
							<span class="chip-label">{counts[c.key] === 1 ? c.one : c.many}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<nav class="tabs" aria-label="Views">
			{#each VIEWS as v (v.key)}
				<button
					type="button"
					aria-current={board.view === v.key ? 'page' : undefined}
					data-testid="tab-{v.key}"
					onclick={() => board.setView(v.key)}>{v.label}</button
				>
			{/each}
		</nav>

		<div class="actions">
			<button
				type="button"
				class="btn ghost"
				data-testid="share"
				title="Copy the share link"
				onclick={share}
			>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path
						d="M6.5 9.5 9.5 6.5M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7l1.2-1.2"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				<span class="share-label">Share</span>
			</button>
			{#if board.mode === 'live' && !board.canWrite}
				<span
					class="readonly"
					data-testid="read-only"
					title="Notes and Send need the private link, which the agent prints in the terminal"
					>Read-only</span
				>
			{:else}
				<button
					type="button"
					class="btn send"
					data-testid="send"
					title={sendTitle}
					disabled={!board.canWrite || board.unsent === 0 || board.busy}
					onclick={() => board.send()}
				>
					Send
					{#if board.unsent > 0}<span class="count tabular">{board.unsent}</span>{/if}
				</button>
			{/if}
		</div>
	</div>
</header>

<style>
	.head {
		position: relative;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.7rem 1rem 0.6rem;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.one {
		align-items: flex-start;
	}
	.icon-btn {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid transparent;
		color: var(--muted);
		background: none;
		cursor: pointer;
	}
	.icon-btn:hover {
		color: var(--ink);
		background: var(--surface-2);
	}
	.orb-link {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
	}
	.ident {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding-top: 0.2rem;
	}
	.title-line {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 1.12rem;
		font-weight: 650;
		letter-spacing: -0.012em;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status {
		flex: none;
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.status.closed {
		color: var(--muted);
		border-color: var(--line);
	}
	.destination {
		display: flex;
		gap: 0.5rem;
		min-width: 0;
		max-width: 62rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.84rem;
		text-align: left;
		cursor: pointer;
	}
	.dest-label {
		flex: none;
		color: color-mix(in srgb, var(--muted) 75%, transparent);
		font-stretch: 85%;
	}
	.dest-text {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.destination.open .dest-text {
		white-space: normal;
		color: var(--ink);
	}
	.destination:hover .dest-text {
		color: var(--ink);
	}
	.right {
		flex: none;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.conn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.25rem 0.6rem;
		border-radius: 999px;
		font-size: 0.78rem;
		color: var(--muted);
		border: 1px solid var(--line);
		background: none;
		white-space: nowrap;
	}
	.conn i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
	}
	.conn.live i {
		background: var(--settled);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--settled) 25%, transparent);
	}
	.conn.retrying i,
	.conn.connecting i {
		background: var(--changed);
	}
	.conn.idle {
		cursor: pointer;
		color: var(--ink);
	}
	.conn.static i {
		background: var(--fog);
	}
	.fresh-wrap {
		position: relative;
	}
	.fresh {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		border: 1px solid var(--fresh);
		background: color-mix(in srgb, var(--ink) 6%, transparent);
		color: var(--ink);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.fresh-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--ink);
		box-shadow: 0 0 8px var(--fresh);
	}
	.pop {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 50;
		width: min(22rem, 86vw);
		max-height: 60vh;
		overflow: auto;
		padding: 0.4rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		box-shadow: var(--shadow-pop);
	}
	.pop ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pop li button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 0;
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
	}
	.pop li button:hover {
		background: var(--surface-2);
	}
	.link {
		margin: 0.3rem 0.5rem 0.2rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.two {
		flex-wrap: wrap;
		row-gap: 0.5rem;
	}
	.gauges {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
		flex: 1 1 auto;
	}
	.progress {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.8rem;
		color: var(--muted);
		white-space: nowrap;
	}
	.progress strong {
		color: var(--ink);
		font-weight: 650;
	}
	.bar {
		width: 120px;
		height: 6px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--settled);
		transition: width 400ms var(--ease);
	}
	.chips {
		display: flex;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
		flex-wrap: wrap;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.18rem 0.55rem 0.18rem 0.4rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
		background: color-mix(in srgb, var(--accent) 8%, transparent);
		color: var(--ink);
		font: inherit;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.chip span.tabular {
		font-weight: 650;
	}
	.chip-label {
		color: var(--muted);
	}
	.chip.zero {
		border-color: var(--line);
		background: none;
		opacity: 0.55;
	}
	.chip:hover {
		opacity: 1;
		border-color: var(--accent);
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 10px;
		background: var(--surface-2);
	}
	.tabs button {
		padding: 0.3rem 0.85rem;
		border: 0;
		border-radius: 7px;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.84rem;
		font-weight: 550;
		cursor: pointer;
	}
	.tabs button:hover {
		color: var(--ink);
	}
	.tabs button[aria-current='page'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.18),
			0 0 0 1px var(--line);
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 32px;
		padding: 0 0.85rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.84rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn.ghost:hover {
		background: var(--surface-2);
	}
	.btn.send {
		border-color: color-mix(in srgb, var(--accent) 70%, transparent);
		background: var(--accent);
		color: var(--bg);
	}
	.btn.send:hover:not(:disabled) {
		box-shadow: 0 0 0 4px var(--glow-soft);
	}
	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.btn.send:disabled {
		background: none;
		color: var(--muted);
		border-color: var(--line);
	}
	.readonly {
		display: inline-flex;
		align-items: center;
		height: 32px;
		padding: 0 0.75rem;
		border-radius: 8px;
		border: 1px dashed var(--line);
		color: var(--muted);
		font-size: 0.8rem;
		cursor: help;
	}
	.count {
		min-width: 1.25rem;
		padding: 0 0.3rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg) 85%, transparent);
		color: var(--accent);
		font-size: 0.74rem;
		line-height: 1.25rem;
		text-align: center;
	}

	@media (max-width: 900px) {
		.head {
			padding: 0.55rem 0.75rem 0.5rem;
		}
		.gauges {
			order: 3;
			flex-basis: 100%;
			gap: 0.6rem;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.chips {
			flex-wrap: nowrap;
		}
		.chip-label {
			display: none;
		}
		.bar {
			width: 64px;
		}
		.tabs {
			flex: 1;
			overflow-x: auto;
		}
		.tabs button {
			flex: 1;
			padding: 0.3rem 0.5rem;
		}
		.dest-label {
			display: none;
		}
	}
	@media (max-width: 560px) {
		.conn {
			padding: 0.25rem;
			font-size: 0;
			gap: 0;
			border: 0;
		}
		.fresh {
			font-size: 0;
			gap: 0;
			padding: 0.4rem;
		}
		.share-label {
			display: none;
		}
		.actions .ghost {
			padding: 0 0.55rem;
		}
	}
</style>
