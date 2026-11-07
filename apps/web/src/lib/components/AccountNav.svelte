<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { signOut } from '#lib/ui/auth.ts';

	const user = $derived(page.data.user);
	const here = $derived(page.url.pathname + page.url.search);
	const login = $derived(`${resolve('/login')}?next=${encodeURIComponent(here)}`);

	async function logout() {
		await signOut();
		await invalidateAll();
		if (page.url.pathname.startsWith('/profile')) await goto(resolve('/'));
	}
</script>

{#if page.data.authEnabled}
	<span class="account" data-testid="account-nav">
		{#if user}
			<a href={resolve('/profile')} title={user.email ?? user.uid} data-testid="profile-link"
				>Profile</a
			>
			<button type="button" onclick={logout} data-testid="logout">Log out</button>
		{:else}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved above -->
			<a href={login} data-testid="login-link">Log in</a>
		{/if}
	</span>
{/if}

<style>
	.account {
		display: inline-flex;
		align-items: center;
		gap: 0.9rem;
		font-size: 0.92rem;
	}
	a,
	button {
		color: var(--muted);
		text-decoration: none;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		cursor: pointer;
	}
	a:hover,
	button:hover {
		color: var(--ink);
	}
</style>
