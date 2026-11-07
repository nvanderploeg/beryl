<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AccountNav from '#lib/components/AccountNav.svelte';
	import Orb from '#lib/components/Orb.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import {
		completeEmailLink,
		isEmailLink,
		rememberedEmail,
		safeNext,
		sendEmailLink,
		signInWithGoogle
	} from '#lib/ui/auth.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';

	const next = $derived(safeNext(page.url.searchParams.get('next')));

	let email = $state('');
	let busy = $state(false);
	let sent = $state(false);
	let arriving = $state(false);
	let error = $state('');

	onMount(async () => {
		theme.start();
		if (!page.data.authEnabled) return;
		try {
			if (!(await isEmailLink())) return;
			arriving = true;
			const known = rememberedEmail();
			if (known) await finish(known);
		} catch (e) {
			error = message(e);
		}
	});

	const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

	async function done() {
		await invalidateAll();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- `next` is a checked same-origin path
		await goto(next);
	}

	async function run(work: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await work();
		} catch (e) {
			error = message(e);
		} finally {
			busy = false;
		}
	}

	const google = () =>
		run(async () => {
			await signInWithGoogle();
			await done();
		});

	const finish = (address: string) =>
		run(async () => {
			await completeEmailLink(address);
			await done();
		});

	const sendLink = () =>
		run(async () => {
			await sendEmailLink(email.trim(), next);
			sent = true;
		});
</script>

<svelte:head>
	<title>Log in · beryl</title>
</svelte:head>

<div class="page">
	<header class="top">
		<a href={resolve('/')} class="brand"><Orb size={28} /> beryl</a>
		<AccountNav />
	</header>
	<main>
		<h1>Log in</h1>
		{#if !page.data.authEnabled}
			<p class="note" data-testid="auth-off">Sign-in is not configured on this server.</p>
		{:else if arriving}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void finish(email.trim());
				}}
			>
				<p class="note">Confirm the address this link was sent to.</p>
				<label>
					Email
					<input type="email" bind:value={email} required autocomplete="email" />
				</label>
				<button class="primary" type="submit" disabled={busy}>Finish signing in</button>
			</form>
		{:else}
			<button class="primary" type="button" onclick={google} disabled={busy} data-testid="google">
				Continue with Google
			</button>
			<p class="or">or</p>
			{#if sent}
				<p class="note" data-testid="link-sent">
					A sign-in link is on its way to {email}. Open it in this browser.
				</p>
			{:else}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void sendLink();
					}}
				>
					<label>
						Email
						<input
							type="email"
							bind:value={email}
							required
							autocomplete="email"
							data-testid="email"
						/>
					</label>
					<button class="secondary" type="submit" disabled={busy} data-testid="send-link">
						Email me a link
					</button>
				</form>
			{/if}
		{/if}
		{#if error}<p class="error" role="alert" data-testid="auth-error">{error}</p>{/if}
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
		font: inherit;
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
	.or,
	.note {
		margin: 0;
		color: var(--muted);
	}
	.or {
		text-align: center;
	}
	.error {
		margin: 0;
		color: var(--risk);
	}
	footer {
		padding-block: 1.5rem 2rem;
		border-top: 1px solid var(--line);
	}
</style>
