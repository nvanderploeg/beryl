<script lang="ts">
	import type { Edge, EdgeRel } from '#lib/types.ts';
	import WidgetView from '#lib/widgets/WidgetView.svelte';
	import { useBoard } from '#lib/ui/board.svelte.ts';
	import { firstLine, INTENT_LABEL, KIND_LABEL, REL_LABEL, STATUS_LABEL } from '#lib/ui/kinds.ts';
	import { renderMarkdown } from '#lib/ui/markdown.ts';
	import {
		ancestorsOf,
		childrenOf,
		countsOf,
		incomingEdges,
		marksOf,
		notesOn,
		pendingAnswer
	} from '#lib/ui/topic.ts';
	import Composer from './Composer.svelte';
	import History from './History.svelte';
	import Mark from './Mark.svelte';
	import NoteThread from './NoteThread.svelte';

	let { part }: { part: 'details' | 'notes' | 'history' } = $props();

	const board = useBoard();

	let composer: Composer | undefined = $state();
	let scroller: HTMLElement | undefined = $state();

	const node = $derived(board.selectedNode);
	const crumbs = $derived(
		node
			? ancestorsOf(node.path).map((p) => ({ path: p, title: board.byPath.get(p)?.title ?? p }))
			: []
	);
	const notes = $derived(notesOn(board.notes, node?.path ?? null));
	const pending = $derived(node ? pendingAnswer(board.notes, node.path) : undefined);
	const kids = $derived(node ? childrenOf(board.nodes, node.path) : []);
	const counts = $derived(countsOf(board.nodes, node?.path ?? null));
	const isCurrent = $derived(!!node && board.topic.current === node.path);
	const body = $derived(node?.body ? renderMarkdown(node.body) : '');
	const summary = $derived(board.topic.summary ? renderMarkdown(board.topic.summary) : '');

	const RELS: EdgeRel[] = ['relies_on', 'conflicts', 'supersedes', 'relates'];

	function grouped<T>(items: T[], rel: (item: T) => EdgeRel): { rel: EdgeRel; items: T[] }[] {
		return RELS.map((r) => ({ rel: r, items: items.filter((i) => rel(i) === r) })).filter(
			(g) => g.items.length > 0
		);
	}

	const outgoing = $derived(node ? grouped<Edge>(node.edges, (e) => e.rel) : []);
	const incoming = $derived(
		node ? grouped(incomingEdges(board.nodes, node.path), (i) => i.edge.rel) : []
	);

	$effect(() => {
		void board.selected;
		scroller?.scrollTo({ top: 0 });
	});

	$effect(() => {
		if (board.composerFocus > 0 && part === 'notes') composer?.focus();
	});

	function pickElement(widget: string, element: string) {
		board.anchor = { widget, element };
		board.reveal('notes');
		board.composerFocus++;
	}

	function sourceHref(file: string, line?: number): string | null {
		const repo = board.topic.repo;
		if (!repo) return null;
		const ref = board.topic.branch ?? 'HEAD';
		return `https://github.com/${repo}/blob/${ref}/${file}${line ? `#L${line}` : ''}`;
	}

	function relClass(rel: EdgeRel) {
		return `rel-${rel}`;
	}
</script>

{#snippet edgeLink(path: string, label?: string)}
	{@const target = board.byPath.get(path)}
	{#if target}
		<button type="button" class="edge" onclick={() => board.jump(path)}>
			<Mark kind={target.kind} status={target.status} size={13} />
			<span>{target.title}</span>
			{#if label}<span class="edge-label">{label}</span>{/if}
		</button>
	{:else}
		<span class="edge missing" title="No node at this path">
			<span class="mono">{path}</span>
			<span class="edge-label">missing</span>
		</span>
	{/if}
{/snippet}

<div class="inspector-wrap">
	<div class="scroll" bind:this={scroller}>
		{#if part === 'details'}
			{#if node}
				<nav class="crumbs" aria-label="Ancestors">
					<button type="button" onclick={() => board.select(null)}>{board.topic.title}</button>
					{#each crumbs as c (c.path)}
						<span class="slash">/</span>
						<button type="button" onclick={() => board.jump(c.path)}>{c.title}</button>
					{/each}
				</nav>

				<div class="kindline">
					<Mark kind={node.kind} status={node.status} size={18} current={isCurrent} />
					<span class="kind">{KIND_LABEL[node.kind]}</span>
					<span class="pill s-{node.status}">{STATUS_LABEL[node.status]}</span>
					{#if isCurrent}<span class="pill now">Now asking</span>{/if}
					{#if node.rank !== null && node.status === 'open'}<span class="rank tabular"
							>#{node.rank}</span
						>{/if}
					<span class="path mono" title={node.path}>{node.path}</span>
				</div>

				<h2 class="title" class:dropped={node.status === 'dropped'}>{node.title}</h2>

				{#if node.gist || node.gistStale}
					<p class="gist">
						{node.gist}
						{#if node.gistStale}
							<span
								class="stale"
								data-testid="stale-gist"
								title="What is inside changed since this summary was written; the agent will rewrite it"
								>Stale gist</span
							>
						{/if}
					</p>
				{/if}

				{#if pending}
					<div class="pending" data-testid="pending-answer">
						<span class="pending-head">Answered on the board, waiting on the agent</span>
						<span
							><strong>{INTENT_LABEL[pending.intent]}</strong>{pending.text
								? `: ${pending.text}`
								: ''}</span
						>
					</div>
				{/if}

				{#if node.answer}
					<section class="answer block">
						<h3>Answer</h3>
						<p>{node.answer}</p>
					</section>
				{/if}
				{#if node.recommendation}
					<section class="rec block" class:muted-rec={node.status !== 'open'}>
						<h3>Recommendation</h3>
						<p>{node.recommendation}</p>
					</section>
				{/if}

				{#if body}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it with html disabled -->
					<div class="pw-prose body">{@html body}</div>
				{/if}

				{#if kids.length}
					<section class="section">
						<h3>
							Inside
							<span class="counts tabular">
								{#if counts.questions}<span>{counts.questions} open</span>{/if}
								<span>{counts.settled} of {counts.total} settled</span>
							</span>
						</h3>
						<ul class="kids">
							{#each kids as k (k.path)}
								<li>
									<button type="button" class="edge" onclick={() => board.jump(k.path)}>
										<Mark kind={k.kind} status={k.status} size={13} />
										<span>{k.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#each node.widgets as w (w.key)}
					<section class="widget" data-testid="inspector-widget">
						<div class="widget-head">
							<button
								type="button"
								class="pin"
								class:on={board.anchor.widget === w.key && !board.anchor.element}
								onclick={() => {
									board.anchor = { widget: w.key };
									composer?.focus();
								}}>Note on this widget</button
							>
						</div>
						<WidgetView
							widget={w}
							lod="full"
							marks={marksOf(board.notes, node.path, w.key)}
							selected={board.anchor.widget === w.key ? (board.anchor.element ?? null) : null}
							onselect={(el) => pickElement(w.key, el)}
						/>
					</section>
				{/each}

				{#if outgoing.length || incoming.length}
					<section class="section">
						<h3>Edges</h3>
						{#each outgoing as g (g.rel)}
							<div class="edge-group {relClass(g.rel)}">
								<span class="rel">{REL_LABEL[g.rel].out}</span>
								<div class="edge-list">
									{#each g.items as e (e.to)}
										{@render edgeLink(e.to, e.label)}
									{/each}
								</div>
							</div>
						{/each}
						{#each incoming as g (g.rel)}
							<div class="edge-group {relClass(g.rel)}">
								<span class="rel">{REL_LABEL[g.rel].in}</span>
								<div class="edge-list">
									{#each g.items as i (i.from)}
										{@render edgeLink(i.from, i.edge.label)}
									{/each}
								</div>
							</div>
						{/each}
					</section>
				{/if}

				{#if node.sources.length}
					<section class="section">
						<h3>Sources</h3>
						<ul class="sources">
							{#each node.sources as s, i (i)}
								<li>
									{#if s.url}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an external source -->
										<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label ?? s.url}</a>
									{:else if s.file}
										{@const href = sourceHref(s.file, s.line)}
										{#if href}
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the file on GitHub -->
											<a {href} target="_blank" rel="noopener noreferrer" class="mono"
												>{s.file}{s.line ? `:${s.line}` : ''}</a
											>
										{:else}
											<span class="mono">{s.file}{s.line ? `:${s.line}` : ''}</span>
										{/if}
										{#if s.label}<span class="src-label">{s.label}</span>{/if}
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{:else}
				<div class="overview" data-testid="topic-overview">
					<span class="kind">Topic</span>
					<h2 class="title">{board.topic.title}</h2>
					{#if board.topic.destination}
						<section class="dest block">
							<h3>Destination</h3>
							<p>{board.topic.destination}</p>
						</section>
					{/if}
					{#if summary}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown-it with html disabled -->
						<div class="pw-prose body">{@html summary}</div>
					{/if}
					<dl class="facts">
						<div>
							<dt>Open questions</dt>
							<dd class="tabular">{counts.questions}</dd>
						</div>
						<div>
							<dt>Assumptions</dt>
							<dd class="tabular">{counts.assumptions}</dd>
						</div>
						<div>
							<dt>Fog</dt>
							<dd class="tabular">{counts.fog}</dd>
						</div>
						<div>
							<dt>Risks</dt>
							<dd class="tabular">{counts.risks}</dd>
						</div>
						<div>
							<dt>Settled</dt>
							<dd class="tabular">{counts.settled} of {counts.total}</dd>
						</div>
						{#if board.topic.repo}<div class="wide">
								<dt>Repo</dt>
								<dd class="mono">
									{board.topic.repo}{board.topic.branch ? ` @ ${board.topic.branch}` : ''}
								</dd>
							</div>{/if}
						{#if board.topic.agent?.model}<div class="wide">
								<dt>Agent</dt>
								<dd>
									{[board.topic.agent.tool, board.topic.agent.model, board.topic.agent.effort]
										.filter(Boolean)
										.join(', ')}
								</dd>
							</div>{/if}
					</dl>
					{#if board.topic.current && board.byPath.get(board.topic.current)}
						{@const cur = board.byPath.get(board.topic.current)!}
						<button type="button" class="now-asking" onclick={() => board.jump(cur.path)}>
							<span class="pill now">Now asking</span>
							<span class="now-title">{cur.title}</span>
							{#if cur.recommendation}<span class="now-rec">{firstLine(cur.recommendation)}</span
								>{/if}
						</button>
					{/if}
					<p class="tip">Select a node in any view, or a question on the left, to see it here.</p>
				</div>
			{/if}
		{:else if part === 'notes'}
			<section class="section notes">
				<h3>
					{node ? 'Notes' : 'Notes on the whole topic'}
					<span class="counts tabular">{notes.length || ''}</span>
				</h3>
				<NoteThread {notes} {node} />
				<Composer bind:this={composer} {node} />
			</section>
		{:else if node}
			<History path={node.path} version={node.updatedAt} />
		{:else}
			<p class="tip">Select a node to see its history.</p>
		{/if}
	</div>
</div>

<style>
	.inspector-wrap {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.1rem 3rem;
		scrollbar-width: thin;
	}
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem;
		margin-bottom: 0.6rem;
		font-size: 0.78rem;
	}
	.crumbs button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.crumbs button:hover {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.slash {
		color: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.kindline {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.kind {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
	}
	.pill {
		padding: 0.05rem 0.5rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		border: 1px solid var(--line);
		color: var(--muted);
	}
	.pill.s-open {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.pill.s-settled {
		color: var(--settled);
		border-color: color-mix(in srgb, var(--settled) 45%, transparent);
	}
	.pill.now {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.rank {
		font-size: 0.78rem;
		font-weight: 650;
		color: var(--accent);
	}
	.path {
		margin-left: auto;
		font-size: 0.7rem;
		color: color-mix(in srgb, var(--muted) 80%, transparent);
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.title {
		margin: 0.45rem 0 0.25rem;
		font-size: 1.3rem;
		font-weight: 650;
		letter-spacing: -0.015em;
		line-height: 1.22;
		text-wrap: balance;
	}
	.title.dropped {
		text-decoration: line-through;
		color: var(--muted);
	}
	.gist {
		margin: 0 0 0.75rem;
		font-size: 0.92rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--ink) 82%, var(--muted));
	}
	.stale {
		display: inline-block;
		margin-left: 0.3rem;
		padding: 0 0.4rem;
		border-radius: 4px;
		border: 1px dashed var(--changed);
		color: var(--changed);
		font-size: 0.7rem;
		font-weight: 600;
		vertical-align: 0.1em;
		cursor: help;
	}
	.pending {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-bottom: 0.8rem;
		padding: 0.55rem 0.7rem;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, var(--settled) 45%, var(--line));
		background: color-mix(in srgb, var(--settled) 8%, transparent);
		font-size: 0.84rem;
	}
	.pending-head {
		font-size: 0.72rem;
		font-weight: 650;
		color: var(--settled);
	}
	.block {
		margin: 0 0 0.85rem;
		padding: 0.55rem 0.75rem;
		border-left: 2px solid var(--line);
		border-radius: 0 8px 8px 0;
		background: color-mix(in srgb, var(--surface-2) 55%, transparent);
	}
	.block h3,
	.section h3 {
		margin: 0;
		font-size: 0.76rem;
		font-weight: 650;
		color: var(--muted);
	}
	.block p {
		margin: 0.2rem 0 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.rec {
		border-left-color: var(--accent);
	}
	.rec h3 {
		color: var(--accent);
	}
	.muted-rec {
		border-left-color: var(--line);
		opacity: 0.8;
	}
	.muted-rec h3 {
		color: var(--muted);
	}
	.answer {
		border-left-color: var(--settled);
	}
	.answer h3 {
		color: var(--settled);
	}
	.body {
		margin-bottom: 1rem;
	}
	.section {
		margin: 1.1rem 0 0;
	}
	.section h3 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.45rem;
	}
	.counts {
		display: inline-flex;
		gap: 0.6rem;
		font-weight: 500;
		color: color-mix(in srgb, var(--muted) 85%, transparent);
	}
	.kids,
	.sources {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.edge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
		padding: 0.2rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 7px;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 0.84rem;
		text-align: left;
		cursor: pointer;
	}
	.edge:hover {
		background: var(--surface-2);
	}
	.edge span:not(.edge-label) {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.edge.missing {
		cursor: default;
		border: 1px dashed color-mix(in srgb, var(--removed) 60%, transparent);
		color: var(--muted);
	}
	.edge-label {
		font-size: 0.72rem;
		color: var(--muted);
	}
	.missing .edge-label {
		color: var(--removed);
	}
	.edge-group {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: 0.5rem;
		align-items: start;
		padding: 0.2rem 0;
	}
	.rel {
		padding-top: 0.3rem;
		font-size: 0.76rem;
		color: var(--muted);
	}
	.rel-conflicts .rel {
		color: var(--removed);
	}
	.edge-list {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
	}
	.sources li {
		font-size: 0.82rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: baseline;
	}
	.sources a {
		color: var(--accent);
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}
	.src-label {
		color: var(--muted);
	}
	.widget {
		margin: 1.1rem 0 0;
	}
	.widget-head {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.35rem;
	}
	.pin {
		margin-left: auto;
		padding: 0.1rem 0.5rem;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.pin:hover,
	.pin.on {
		color: var(--ink);
		border-color: var(--accent);
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--line);
	}
	.notes h3 {
		margin-bottom: 0;
	}
	.overview .kind {
		display: block;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem 1rem;
		margin: 0.75rem 0;
	}
	.facts div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
		font-size: 0.82rem;
	}
	.facts .wide {
		grid-column: 1 / -1;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		font-weight: 600;
		text-align: right;
	}
	.now-asking {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		width: 100%;
		margin: 0.4rem 0 0.8rem;
		padding: 0.7rem 0.8rem;
		border-radius: 12px;
		border: 1px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 7%, var(--surface));
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		animation: pw-breathe 3.2s var(--ease) infinite;
	}
	.now-title {
		font-weight: 650;
	}
	.now-rec {
		font-size: 0.82rem;
		color: var(--muted);
	}
	.tip {
		margin: 0 0 0.5rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	@media (max-width: 900px) {
		.scroll {
			padding: 0.8rem 1rem 2rem;
		}
	}
</style>
