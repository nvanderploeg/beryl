<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AccountNav from '#lib/components/AccountNav.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import { theme } from '#lib/ui/theme.svelte.ts';

	let code = $state('');
	let busy = $state(false);
	let found = $state<{ label: string; ip: string | null; startedSecondsAgo: number } | null>(null);
	let approved = $state<string | null>(null);
	let error = $state('');

	onMount(() => theme.start());

	async function send(path: string) {
		busy = true;
		error = '';
		try {
			const res = await fetch(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userCode: code })
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) error = body?.error ?? 'Could not reach the server';
			return res.ok ? body : null;
		} finally {
			busy = false;
		}
	}

	async function lookUp() {
		found = await send('/api/auth/device/lookup');
	}

	async function approve() {
		const body = await send('/api/auth/device/approve');
		if (body) approved = body.label;
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
			{#if found}
				<dl class="request" data-testid="request">
					<dt>Name it gave (not verified)</dt>
					<dd>{found.label}</dd>
					<dt>Requested from</dt>
					<dd>{found.ip ?? 'unknown address'}</dd>
					<dt>Started</dt>
					<dd>{found.startedSecondsAgo} seconds ago</dd>
				</dl>
				<p>Approve only if you just asked your agent to sign in from this address.</p>
				<div class="row">
					<button type="button" class="secondary" onclick={() => ((found = null), (code = ''))}
						>Not me</button
					>
					<button
						class="primary"
						type="button"
						disabled={busy}
						onclick={approve}
						data-testid="approve">Approve</button
					>
				</div>
			{:else}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void lookUp();
					}}
				>
					<label>
						Code from your agent
						<input bind:value={code} required autocomplete="off" data-testid="device-code" />
					</label>
					<button class="primary" type="submit" disabled={busy} data-testid="look-up"
						>Continue</button
					>
				</form>
			{/if}
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
	.request {
		display: grid;
		gap: 0.15rem;
		margin: 0;
	}
	.request dt {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.request dd {
		margin: 0 0 0.5rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		gap: 0.75rem;
	}
	.error {
		color: var(--risk);
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
</style>
