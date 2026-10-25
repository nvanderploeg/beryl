<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Orb from '#lib/components/Orb.svelte';
</script>

<svelte:head><title>{page.status} · beryl</title></svelte:head>

<main>
	<Orb size={56} heat={0} />
	<h1>{page.status === 404 ? (page.error?.message ?? 'Not found') : 'Something went wrong'}</h1>
	<p>
		{#if page.status === 404}
			The link may be mistyped, or the topic was removed. Ask the agent for the board link again.
		{:else}
			{page.error?.message}
		{/if}
	</p>
	<a href={resolve('/')}>Go to beryl</a>
</main>

<style>
	main {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		text-align: center;
	}
	h1 {
		margin: 0.5rem 0 0;
		font-size: 1.6rem;
		font-weight: 650;
	}
	p {
		max-width: 28rem;
		margin: 0;
		color: var(--muted);
	}
	a {
		margin-top: 0.75rem;
		color: var(--accent);
		text-underline-offset: 3px;
	}
</style>
