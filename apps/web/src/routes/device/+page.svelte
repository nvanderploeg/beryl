<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AccountNav from '#lib/components/AccountNav.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { theme } from '#lib/ui/theme.svelte.ts';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let code = $state(data.code);
	let busy = $state(false);
	let approved = $state<string | null>(null);
	let error = $state('');

	onMount(() => theme.start());

	async function approve() {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/auth/device/approve', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userCode: code })
			});
			const body = await res.json().catch(() => null);
			if (res.ok) approved = body.label;
			else error = body?.error ?? 'Could not approve';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Connect an agent · beryl</title>
</svelte:head>

<div class="page">
	<header class="top">
		<a href={resolve('/')} class="brand"><Orb size={28} /> beryl</a>
		<AccountNav />
	</header>
	<main>
		<h1>Connect an agent</h1>
		{#if approved !== null}
			<p data-testid="approved">
				Approved. {approved} can now write to your private projects. Return to it.
			</p>
			<button type="button" class="secondary" onclick={() => goto(resolve('/profile'))}
				>Manage connected agents</button
			>
		{:else}
			{#if data.label}
				<p><strong>{data.label}</strong> is asking to act as you on this beryl.</p>
			{:else if data.code}
				<p class="error">That code is unknown or has expired. Ask the agent for a new one.</p>
			{/if}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void approve();
				}}
			>
				<label>
					Code from your agent
					<input bind:value={code} required autocomplete="off" data-testid="device-code" />
				</label>
				<button class="primary" type="submit" disabled={busy} data-testid="approve">Approve</button>
			</form>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
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
		max-width: 28rem;
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
		padding-block: 2rem 3rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 680;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.9rem;
		color: var(--muted);
	}
	input {
		height: 44px;
		padding: 0 0.8rem;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: 1.1rem var(--font-mono);
		letter-spacing: 0.08em;
	}
	button {
		height: 44px;
		padding: 0 1.25rem;
		border-radius: 10px;
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.primary {
		border: 0;
		background: var(--accent);
		color: var(--bg);
	}
	.secondary {
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink);
	}
	.error {
		color: var(--risk);
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
</style>
