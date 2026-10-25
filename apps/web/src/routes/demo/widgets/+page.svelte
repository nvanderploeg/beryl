<script lang="ts">
	import { WIDGET_TYPES, type WidgetType } from '#lib/types.ts';
	import type { DemoFixture } from '#lib/fixtures/types.ts';
	import fixture from '#lib/fixtures/demo-grill.json';
	import WidgetView from '#lib/widgets/WidgetView.svelte';
	import { elementsOf } from '#lib/widgets/elements.ts';
	import { fakeMarks, fixtureEntries, sampleEntries, type GalleryEntry } from './gallery.ts';
	import { samples } from './samples.ts';

	type Theme = 'system' | 'light' | 'dark';

	const entries: GalleryEntry[] = [
		...fixtureEntries(fixture as unknown as DemoFixture),
		...sampleEntries(samples)
	];
	const widths = [420, 520, 640];

	let theme = $state<Theme>('system');
	let width = $state(520);
	let only = $state<WidgetType | 'all'>('all');
	let showSamples = $state(true);
	let selected = $state<Record<string, string | null>>({});

	const groups = $derived(
		WIDGET_TYPES.map((type) => ({
			type,
			entries: entries.filter(
				(e) => e.widget.type === type && (showSamples || e.source === 'fixture')
			)
		})).filter((g) => g.entries.length > 0 && (only === 'all' || g.type === only))
	);
	const countOf = (type: WidgetType) =>
		entries.filter((e) => e.widget.type === type && (showSamples || e.source === 'fixture')).length;

	$effect(() => {
		const root = document.documentElement;
		if (theme === 'system') delete root.dataset.theme;
		else root.dataset.theme = theme;
	});

	function select(entry: GalleryEntry, key: string | null) {
		selected[entry.id] = selected[entry.id] === key ? null : key;
	}
</script>

<svelte:head><title>Widgets · palantir</title></svelte:head>

<div class="page">
	<header class="bar">
		<h1>Widgets</h1>
		<p class="lede">
			Every widget in the demo grill at <code>preview</code> and <code>full</code>, plus samples for
			edge cases. Click an Element to select it.
		</p>
		<div class="controls">
			<div class="seg" role="group" aria-label="Theme">
				{#each ['system', 'light', 'dark'] as const as t (t)}
					<button class:on={theme === t} onclick={() => (theme = t)}>{t}</button>
				{/each}
			</div>
			<div class="seg" role="group" aria-label="Inspector width">
				{#each widths as w (w)}
					<button class:on={width === w} onclick={() => (width = w)}>{w}px</button>
				{/each}
			</div>
			<label class="check">
				<input type="checkbox" bind:checked={showSamples} /> samples
			</label>
		</div>
		<nav class="types">
			<button class:on={only === 'all'} onclick={() => (only = 'all')}>all</button>
			{#each WIDGET_TYPES as type (type)}
				{@const n = countOf(type)}
				<button class:on={only === type} disabled={n === 0} onclick={() => (only = type)}>
					{type}<span class="n">{n}</span>
				</button>
			{/each}
		</nav>
	</header>

	{#each groups as group (group.type)}
		<section class="group">
			<h2>{group.type}</h2>
			{#each group.entries as entry (entry.id)}
				{@const marks = fakeMarks(entry)}
				{@const elements = elementsOf(entry.widget)}
				{@const current = selected[entry.id] ?? null}
				{@const known = new Set(elements.map((e) => e.key))}
				<article class="entry" data-entry={entry.id}>
					<header class="entry-head">
						<span class="path">{entry.path}</span>
						<span class="sep">·</span>
						<span class="key">{entry.widget.key}</span>
						{#if entry.turn}
							<span class="chip">turn {entry.turn}</span>
						{:else}
							<span class="chip">sample</span>
						{/if}
						{#if entry.version > 1}<span class="chip">v{entry.version}</span>{/if}
						{#if entry.widget.title}<span class="wtitle">{entry.widget.title}</span>{/if}
					</header>
					<div class="views">
						<figure>
							<figcaption>preview · 300 × 180</figcaption>
							<div class="preview-frame">
								<WidgetView widget={entry.widget} lod="preview" {marks} />
							</div>
						</figure>
						<figure class="full" style="width: {width}px">
							<figcaption>full · {width}px</figcaption>
							<WidgetView
								widget={entry.widget}
								lod="full"
								{marks}
								selected={current}
								onselect={(key) => select(entry, key)}
							/>
						</figure>
					</div>
					<footer class="entry-foot">
						<div class="selected">
							{#if current}
								selected <code>{current}</code>
								<span class="label">{elements.find((e) => e.key === current)?.label ?? '?'}</span>
								<button class="link" onclick={() => select(entry, null)}>clear</button>
							{:else}
								<span class="muted">
									{[
										elements.length ? 'nothing selected' : 'no Elements',
										Object.keys(marks).length && `marks on ${Object.keys(marks).join(', ')}`
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							{/if}
						</div>
						{#if entry.notes.length}
							<div class="anchors">
								Note anchors:
								{#each entry.notes as key (key)}
									<code class:ok={known.has(key)} class:bad={!known.has(key)}>
										{known.has(key) ? '✓' : '✗'}
										{key}
									</code>
								{/each}
							</div>
						{/if}
						{#if elements.length}
							<details>
								<summary>Elements ({elements.length})</summary>
								<ol class="elements">
									{#each elements as element (element.key)}
										<li>
											<button
												class:on={current === element.key}
												onclick={() => select(entry, element.key)}
											>
												<code>{element.key}</code>
												<span>{element.label}</span>
												{#if marks[element.key]}<span class="n">{marks[element.key]}</span>{/if}
											</button>
										</li>
									{/each}
								</ol>
							</details>
						{/if}
					</footer>
				</article>
			{/each}
		</section>
	{/each}
</div>

<style>
	.page {
		max-width: 1240px;
		margin: 0 auto;
		padding: 1.5rem 1rem 4rem;
		color: var(--ink);
	}
	.bar {
		margin: 0 0 1rem;
		padding: 0 0 0.7rem;
		border-bottom: 1px solid var(--line);
	}
	h1 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 650;
	}
	.lede {
		margin: 0.15rem 0 0.6rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.55rem;
	}
	.seg {
		display: inline-flex;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 0.4rem;
		background: var(--surface);
	}
	.seg button {
		padding: 0.22rem 0.6rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.seg button + button {
		border-left: 1px solid var(--line);
	}
	.seg button.on {
		background: var(--surface-2);
		color: var(--ink);
		font-weight: 600;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.types button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--ink);
	}
	.types button.on {
		border-color: var(--accent);
		color: var(--accent);
	}
	.types button:disabled {
		opacity: 0.4;
	}
	.n {
		min-width: 1rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 0.65rem;
		color: var(--muted);
		text-align: center;
	}

	.group h2 {
		margin: 1.6rem 0 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.entry {
		margin-bottom: 1rem;
		padding: 0.75rem 0.9rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 0.6rem;
		background: color-mix(in srgb, var(--surface) 45%, var(--bg));
	}
	.entry-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
		font-size: 0.8rem;
	}
	.path,
	.key {
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.key {
		color: var(--accent);
	}
	.sep {
		color: var(--muted);
	}
	.chip {
		padding: 0 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 0.68rem;
		color: var(--muted);
	}
	.wtitle {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.views {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 1.25rem;
	}
	figure {
		margin: 0;
	}
	figcaption {
		margin-bottom: 0.3rem;
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.preview-frame {
		width: 300px;
		height: 180px;
		outline: 1px dashed color-mix(in srgb, var(--muted) 45%, transparent);
		outline-offset: 3px;
	}
	.full {
		max-width: 100%;
	}
	.entry-foot {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.7rem;
		font-size: 0.75rem;
	}
	.selected code {
		padding: 0 0.3rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.label {
		margin-left: 0.3rem;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.link {
		margin-left: 0.4rem;
		color: var(--accent);
		text-decoration: underline;
	}
	.anchors code {
		margin-left: 0.3rem;
	}
	.anchors .ok {
		color: var(--settled);
	}
	.anchors .bad {
		color: var(--removed);
		font-weight: 700;
	}
	details summary {
		cursor: pointer;
		color: var(--muted);
	}
	.elements {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.4rem 0 0;
		padding: 0;
		list-style: none;
	}
	.elements button {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 0.3rem;
		background: var(--surface);
		font-size: 0.7rem;
		color: var(--ink);
	}
	.elements button.on {
		border-color: var(--accent);
	}
	.elements button span:not(.n) {
		color: var(--muted);
	}
</style>
