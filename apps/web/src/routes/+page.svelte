<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Mark from '#lib/components/Mark.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import type { NodeKind, NodeStatus } from '#lib/types.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';

	onMount(() => theme.start());

	const legend: { kind: NodeKind; status: NodeStatus; name: string; text: string }[] = [
		{
			kind: 'decision',
			status: 'open',
			name: 'Open question',
			text: 'With the agent’s recommended answer.'
		},
		{
			kind: 'assumption',
			status: 'open',
			name: 'Assumption',
			text: 'Taken for granted until you confirm it.'
		},
		{ kind: 'fog', status: 'open', name: 'Fog', text: 'Matters, but is not a question yet.' },
		{ kind: 'risk', status: 'open', name: 'Risk', text: 'What could go wrong if left alone.' },
		{ kind: 'decision', status: 'settled', name: 'Settled', text: 'Answered; it recedes.' },
		{ kind: 'decision', status: 'parked', name: 'Parked', text: 'Deliberately deferred.' }
	];

	// [x, y, width, height, tone]
	const cards: [number, number, number, number, string][] = [
		[64, 92, 92, 44, 'settled'],
		[168, 92, 92, 44, 'unknown'],
		[272, 92, 74, 44, 'settled'],
		[70, 176, 120, 52, 'current'],
		[204, 176, 84, 52, 'assume'],
		[300, 176, 60, 52, 'settled'],
		[96, 262, 96, 46, 'fog'],
		[206, 262, 104, 46, 'unknown'],
		[148, 336, 112, 40, 'risk']
	];
</script>

<svelte:head>
	<title>speculum: see the grill</title>
	<meta
		name="description"
		content="A live, zoomable board of what a grilling agent understands about your design, with every unknown lit."
	/>
</svelte:head>

<div class="page">
	<header class="top">
		<span class="brand"><Orb size={28} heat={6} /> speculum</span>
		<nav>
			<a href={resolve('/demo')}>Demo</a>
			<a href="#install">Install</a>
		</nav>
	</header>

	<main>
		<section class="hero">
			<div class="copy">
				<h1>See what your agent understands, and what it doesn’t yet.</h1>
				<p class="lede">
					While an agent grills you about a plan, speculum draws its model of the design as a live,
					zoomable board: decisions, assumptions, fog and risks, with every open question lit. Zoom
					out for the landscape and in for the schema. Answer ahead in your own order, pin a note to
					a column or a file, and press Send to wake the agent.
				</p>
				<div class="cta">
					<a class="primary" href={resolve('/demo')} data-testid="demo-link">Open the demo</a>
					<a class="secondary" href="#install">Install it</a>
				</div>
			</div>

			<figure class="stone" aria-label="A board seen through the stone">
				<svg viewBox="0 0 420 420" role="img">
					<title>Cards on a board, the open ones glowing</title>
					<defs>
						<radialGradient id="hero-depth" cx="50%" cy="55%" r="60%">
							<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.16" />
							<stop offset="70%" stop-color="var(--accent)" stop-opacity="0.02" />
							<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
						</radialGradient>
						<radialGradient id="hero-glass" cx="32%" cy="24%" r="75%">
							<stop offset="0%" stop-color="var(--ink)" stop-opacity="0.14" />
							<stop offset="55%" stop-color="var(--ink)" stop-opacity="0" />
						</radialGradient>
						<pattern
							id="hero-hatch"
							width="7"
							height="7"
							patternUnits="userSpaceOnUse"
							patternTransform="rotate(-45)"
						>
							<rect width="2" height="7" fill="var(--fog)" fill-opacity="0.35" />
						</pattern>
						<clipPath id="hero-clip"><circle cx="210" cy="210" r="196" /></clipPath>
						<filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="7" />
						</filter>
					</defs>
					<circle
						cx="210"
						cy="210"
						r="200"
						fill="var(--surface)"
						stroke="var(--line)"
						stroke-width="2"
					/>
					<g clip-path="url(#hero-clip)">
						<circle cx="210" cy="210" r="196" fill="url(#hero-depth)" />
						<rect
							x="40"
							y="70"
							width="340"
							height="320"
							rx="18"
							fill="none"
							stroke="var(--line)"
							stroke-dasharray="4 5"
						/>
						<path
							d="M214 136 C214 156 130 156 130 176"
							stroke="var(--muted)"
							stroke-opacity="0.5"
							fill="none"
							stroke-width="1.5"
						/>
						<path
							d="M130 228 C130 245 144 245 144 262"
							stroke="var(--muted)"
							stroke-opacity="0.5"
							fill="none"
							stroke-width="1.5"
						/>
						<path
							d="M246 228 C246 245 258 245 258 262"
							stroke="var(--muted)"
							stroke-opacity="0.5"
							fill="none"
							stroke-width="1.5"
						/>
						<path
							d="M258 308 C258 322 204 322 204 336"
							stroke="var(--muted)"
							stroke-opacity="0.5"
							fill="none"
							stroke-width="1.5"
							stroke-dasharray="2 4"
						/>
						{#each cards as [x, y, w, h, tone], i (i)}
							{#if tone === 'unknown' || tone === 'current' || tone === 'risk'}
								<rect
									x={x - 2}
									y={y - 2}
									width={w + 4}
									height={h + 4}
									rx="11"
									fill={tone === 'risk' ? 'var(--risk)' : 'var(--accent)'}
									opacity="0.45"
									filter="url(#hero-glow)"
									class:breathe={tone === 'current'}
								/>
							{/if}
							<rect
								{x}
								{y}
								width={w}
								height={h}
								rx="9"
								fill={tone === 'fog'
									? 'url(#hero-hatch)'
									: tone === 'settled'
										? 'var(--bg)'
										: 'var(--surface)'}
								stroke={tone === 'settled'
									? 'var(--line)'
									: tone === 'fog'
										? 'var(--fog)'
										: tone === 'risk'
											? 'var(--risk)'
											: 'var(--accent)'}
								stroke-width={tone === 'settled' ? 1 : 1.8}
								stroke-dasharray={tone === 'assume' ? '5 4' : undefined}
							/>
							<rect
								x={x + 10}
								y={y + 12}
								width={w * 0.55}
								height="5"
								rx="2.5"
								fill="var(--ink)"
								opacity={tone === 'settled' ? 0.25 : 0.7}
							/>
							<rect
								x={x + 10}
								y={y + 23}
								width={w * 0.7}
								height="4"
								rx="2"
								fill="var(--muted)"
								opacity={tone === 'settled' ? 0.25 : 0.55}
							/>
						{/each}
						<circle cx="210" cy="210" r="196" fill="url(#hero-glass)" />
					</g>
				</svg>
			</figure>
		</section>

		<section class="legend" aria-label="How the board reads">
			<h2>Unknowns read loudest</h2>
			<ul>
				{#each legend as item (item.name)}
					<li>
						<Mark kind={item.kind} status={item.status} size={22} />
						<div>
							<strong>{item.name}</strong>
							<span>{item.text}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<section id="install" class="install">
			<h2>Install</h2>
			<pre><code
					>git clone https://github.com/nvanderploeg/speculum
cd speculum && pnpm install && pnpm build
scripts/install.sh --with-server</code
				></pre>
			<p>
				This adds the speculum skill and MCP server to your agent and starts a local board on port
				3270. Then ask your agent to grill you about a plan; it opens the board for you.
			</p>
		</section>
	</main>

	<footer><SiteFooter /></footer>
</div>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
	}
	.top,
	main,
	footer {
		width: 100%;
		max-width: 68rem;
		margin: 0 auto;
		padding-inline: 1.25rem;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-block: 1.2rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		font-weight: 650;
		font-size: 1.05rem;
	}
	nav {
		display: flex;
		gap: 1.25rem;
		font-size: 0.92rem;
	}
	nav a {
		color: var(--muted);
		text-decoration: none;
	}
	nav a:hover {
		color: var(--ink);
	}
	main {
		flex: 1;
	}
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
		gap: 3rem;
		align-items: center;
		padding-block: 3.5rem 3rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(2.1rem, 5.2vw, 3.6rem);
		font-weight: 680;
		font-stretch: 88%;
		line-height: 1.02;
		letter-spacing: -0.03em;
		text-wrap: balance;
	}
	.lede {
		max-width: 36rem;
		margin: 1.4rem 0 2rem;
		font-size: 1.08rem;
		line-height: 1.6;
		color: var(--muted);
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.cta a {
		display: inline-flex;
		align-items: center;
		height: 44px;
		padding: 0 1.25rem;
		border-radius: 10px;
		font-weight: 650;
		text-decoration: none;
	}
	.primary {
		background: var(--accent);
		color: var(--bg);
		box-shadow: 0 0 0 0 var(--glow);
		transition: box-shadow 200ms;
	}
	.primary:hover {
		box-shadow: 0 0 0 6px var(--glow-soft);
	}
	.secondary {
		border: 1px solid var(--line);
		color: var(--ink);
	}
	.secondary:hover {
		background: var(--surface);
	}
	.stone {
		margin: 0;
		justify-self: center;
		width: min(100%, 440px);
	}
	.stone svg {
		display: block;
		width: 100%;
		height: auto;
		filter: drop-shadow(0 30px 60px rgb(0 0 0 / 0.35));
	}
	.breathe {
		animation: hero-breathe 3.2s var(--ease) infinite;
	}
	@keyframes hero-breathe {
		50% {
			opacity: 0.85;
		}
	}
	.legend,
	.install {
		padding-block: 2.5rem;
		border-top: 1px solid var(--line);
	}
	h2 {
		margin: 0 0 1.25rem;
		font-size: 1.3rem;
		font-weight: 650;
		letter-spacing: -0.015em;
	}
	.legend ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem 2rem;
	}
	.legend li {
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
	}
	.legend li div {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.legend strong {
		font-weight: 650;
	}
	.legend span {
		color: var(--muted);
		font-size: 0.92rem;
	}
	pre {
		margin: 0 0 1rem;
		padding: 1rem 1.2rem;
		overflow-x: auto;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		line-height: 1.75;
	}
	.install p {
		max-width: 40rem;
		margin: 0;
		color: var(--muted);
		line-height: 1.6;
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
	@media (max-width: 820px) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
			gap: 2rem;
			padding-block: 2rem;
		}
		.stone {
			order: -1;
			width: min(72%, 320px);
		}
	}
</style>
