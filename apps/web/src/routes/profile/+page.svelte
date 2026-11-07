<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AccountNav from '#lib/components/AccountNav.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { ago } from '#lib/ui/time.ts';

	let { data } = $props();

	let error = $state('');
	let disconnected = $state(false);
	let pending = $state<string | null>(null);

	onMount(() => theme.start());

	async function disconnect() {
		pending = 'agents';
		error = '';
		try {
			const res = await fetch('/api/me/agents', { method: 'DELETE' });
			if (!res.ok) error = (await res.json().catch(() => null))?.error ?? 'Could not disconnect';
			else disconnected = true;
		} finally {
			pending = null;
		}
	}

	async function setPublic(topicId: string, value: boolean) {
		pending = topicId;
		error = '';
		try {
			const res = await fetch(`/api/topics/${topicId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ public: value })
			});
			if (!res.ok) error = (await res.json().catch(() => null))?.error ?? 'Could not save';
			await invalidateAll();
		} finally {
			pending = null;
		}
	}
</script>

<svelte:head>
	<title>Profile · beryl</title>
</svelte:head>

<div class="page">
	<header class="top">
		<a href={resolve('/')} class="brand"><Orb size={28} /> beryl</a>
		<AccountNav />
	</header>
	<main>
		<h1>Profile</h1>
		<p class="lede" data-testid="profile-who">{data.user?.email ?? data.user?.uid}</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#each data.pages as { project, topics } (project.id)}
			<section data-testid="owned-project">
				<h2>
					<a href={resolve('/p/[id]', { id: project.slug })}>{project.name}</a>
				</h2>
				{#if topics.length === 0}
					<p class="empty">No topics yet.</p>
				{:else}
					<ul>
						{#each topics as t (t.id)}
							<li>
								<a href={resolve('/p/[id]/t/[topicId]', { id: project.slug, topicId: t.slug })}
									>{t.title}</a
								>
								<time datetime={t.updatedAt}>{ago(t.updatedAt, Date.now())}</time>
								<label>
									<input
										type="checkbox"
										checked={t.public}
										disabled={pending === t.id}
										data-testid="public-toggle"
										onchange={(e) => setPublic(t.id, e.currentTarget.checked)}
									/>
									Public
								</label>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{:else}
			<p class="empty" data-testid="no-projects">
				No projects yet. Projects you create while signed in appear here, private until you share
				them.
			</p>
		{/each}
		<section class="agents" data-testid="agents">
			<h2>Connected agents</h2>
			<p class="empty">
				Agents sign in by asking you to approve a code at <a href={resolve('/device')}>/device</a>.
				Disconnecting stops every agent signed in as you; they ask again.
			</p>
			<button
				type="button"
				disabled={pending === 'agents'}
				data-testid="disconnect"
				onclick={disconnect}>Disconnect all agents</button
			>
			{#if disconnected}<p role="status">Disconnected.</p>{/if}
		</section>
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
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		font-size: 1.1rem;
		font-weight: 650;
	}
	h2 a,
	li > a {
		color: var(--ink);
		text-decoration: none;
	}
	h2 a:hover,
	li > a:hover {
		color: var(--accent);
	}
	section + section {
		margin-top: 2rem;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 1rem;
		align-items: center;
		padding: 0.7rem 1rem;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
	}
	time {
		font-size: 0.8rem;
		color: var(--muted);
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	button {
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink);
		border-radius: 8px;
		padding: 0.25rem 0.7rem;
		font: inherit;
		cursor: pointer;
	}
	.empty {
		padding: 1.25rem;
		border-radius: 12px;
		border: 1px dashed var(--line);
		color: var(--muted);
	}
	.error {
		color: var(--risk);
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
	@media (max-width: 640px) {
		li {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		time {
			display: none;
		}
	}
</style>
