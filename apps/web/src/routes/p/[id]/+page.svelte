<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Mark from '#lib/components/Mark.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { ago } from '#lib/ui/time.ts';

	let { data } = $props();

	let now = $state(Date.now());
	onMount(() => {
		theme.start();
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	const open = $derived(data.topics.filter((t) => t.status === 'open'));
	const closed = $derived(data.topics.filter((t) => t.status === 'closed'));
</script>

<svelte:head>
	<title>{data.project.name} · palantir</title>
</svelte:head>

{#snippet topicList(list: typeof data.topics)}
	<ul class="topics">
		{#each list as t (t.id)}
			{@const unknowns = t.counts.questions + t.counts.assumptions + t.counts.fog + t.counts.risks}
			{@const pct = t.counts.total ? Math.round((t.counts.settled / t.counts.total) * 100) : 0}
			<li>
				<a
					class="topic"
					class:closed={t.status === 'closed'}
					href={resolve('/p/[id]/t/[topicId]', { id: data.project.id, topicId: t.id })}
					data-testid="topic-row"
				>
					<div class="t-main">
						<h3>{t.title}</h3>
						{#if t.destination}<p class="dest">{t.destination}</p>{/if}
					</div>
					<div class="t-gauge">
						<div class="bar"><span style:width="{pct}%"></span></div>
						<span class="tabular">{t.counts.settled} of {t.counts.total} settled</span>
					</div>
					<div class="t-counts">
						{#if t.counts.questions}<span
								><Mark kind="decision" status="open" size={13} />{t.counts.questions}</span
							>{/if}
						{#if t.counts.assumptions}<span
								><Mark kind="assumption" status="open" size={13} />{t.counts.assumptions}</span
							>{/if}
						{#if t.counts.fog}<span><Mark kind="fog" status="open" size={13} />{t.counts.fog}</span
							>{/if}
						{#if t.counts.risks}<span
								><Mark kind="risk" status="open" size={13} />{t.counts.risks}</span
							>{/if}
						{#if !unknowns}<span class="calm">No open unknowns</span>{/if}
					</div>
					<div class="t-meta">
						{#if t.queuedNotes}<span class="queued">{t.queuedNotes} queued</span>{/if}
						<span class="status s-{t.status}">{t.status === 'open' ? 'Open' : 'Closed'}</span>
						<time datetime={t.updatedAt} title={new Date(t.updatedAt).toLocaleString()}
							>{ago(t.updatedAt, now)}</time
						>
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="page">
	<header class="top">
		<a href={resolve('/')} class="brand"><Orb size={28} /> palantir</a>
	</header>
	<main>
		<h1>{data.project.name}</h1>
		<p class="lede">
			{data.topics.length}
			{data.topics.length === 1 ? 'topic' : 'topics'}, last written {ago(
				data.project.lastWriteAt,
				now
			)}
		</p>

		{#if data.topics.length === 0}
			<p class="empty">
				No topics yet. When an agent starts grilling in this repo, its board appears here.
			</p>
		{/if}
		{#if open.length}
			<section>
				<h2>Open</h2>
				{@render topicList(open)}
			</section>
		{/if}
		{#if closed.length}
			<section>
				<h2>Closed</h2>
				{@render topicList(closed)}
			</section>
		{/if}
	</main>
	<footer><SiteFooter /></footer>
</div>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	.top,
	main,
	footer {
		width: 100%;
		max-width: 60rem;
		margin: 0 auto;
		padding-inline: 1rem;
	}
	.top {
		padding-block: 1.1rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--ink);
		font-weight: 650;
		text-decoration: none;
	}
	main {
		flex: 1;
		padding-block: 1.5rem 3rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		font-weight: 680;
		letter-spacing: -0.02em;
	}
	.lede {
		margin: 0.3rem 0 2rem;
		color: var(--muted);
	}
	h2 {
		margin: 0 0 0.6rem;
		font-size: 0.95rem;
		font-weight: 650;
		color: var(--muted);
	}
	section + section {
		margin-top: 2rem;
	}
	.topics {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.topic {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 11rem auto;
		grid-template-areas: 'main gauge meta' 'main counts meta';
		gap: 0.35rem 1.25rem;
		align-items: center;
		padding: 0.9rem 1.1rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}
	.topic:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
	}
	.topic.closed {
		background: transparent;
	}
	.t-main {
		grid-area: main;
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: 1.02rem;
		font-weight: 650;
	}
	.dest {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.t-gauge {
		grid-area: gauge;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.76rem;
		color: var(--muted);
	}
	.bar {
		height: 5px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--settled);
	}
	.t-counts {
		grid-area: counts;
		display: flex;
		gap: 0.6rem;
		font-size: 0.8rem;
		font-weight: 650;
	}
	.t-counts span {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.calm {
		font-weight: 450;
		color: var(--muted);
	}
	.t-meta {
		grid-area: meta;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.status {
		padding: 0 0.45rem;
		border-radius: 999px;
		border: 1px solid var(--line);
	}
	.status.s-open {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, transparent);
	}
	.queued {
		color: var(--accent);
		font-weight: 600;
	}
	.empty {
		padding: 1.5rem;
		border-radius: 12px;
		border: 1px dashed var(--line);
		color: var(--muted);
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
	@media (max-width: 640px) {
		.topic {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas: 'main meta' 'gauge gauge' 'counts counts';
		}
	}
</style>
