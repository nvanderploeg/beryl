<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { IMPORT_CONFIRM } from '#lib/admin-confirm.ts';

	let { data } = $props();

	let token = $state('');
	let csrf = $state('');
	let message = $state('');
	let failed = $state(false);
	let busy = $state(false);
	let file = $state<File | null>(null);
	let importPhrase = $state('');
	let pending = $state<{ kind: 'projects' | 'topics'; id: string; label: string } | null>(null);
	let typed = $state('');
	let owners = $state<Record<string, string>>({});

	$effect(() => {
		if (data.authed) csrf = data.csrf;
	});

	const size = (bytes: number) =>
		bytes < 1024
			? `${bytes} B`
			: bytes < 1048576
				? `${(bytes / 1024).toFixed(1)} KiB`
				: `${(bytes / 1048576).toFixed(1)} MiB`;
	const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

	async function call(url: string, init: RequestInit): Promise<Response> {
		busy = true;
		message = '';
		try {
			const response = await fetch(url, {
				...init,
				headers: { ...init.headers, 'x-csrf-token': csrf }
			});
			failed = !response.ok;
			return response;
		} finally {
			busy = false;
		}
	}

	async function say(response: Response, ok: string) {
		const body = await response.json().catch(() => ({}));
		message = response.ok ? ok : (body.error ?? `failed (${response.status})`);
	}

	async function login(event: SubmitEvent) {
		event.preventDefault();
		const response = await call('/api/admin/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token })
		});
		if (response.ok) {
			token = '';
			await invalidateAll();
		} else await say(response, '');
	}

	async function logout() {
		await call('/api/admin/logout', { method: 'POST' });
		await invalidateAll();
	}

	async function remove() {
		if (!pending) return;
		const response = await call(`/api/admin/${pending.kind}/${pending.id}`, {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ confirm: typed, confirmId: pending.id })
		});
		await say(response, `Deleted ${pending.label}.`);
		if (response.ok) {
			pending = null;
			typed = '';
			await invalidateAll();
		}
	}

	async function assign(id: string, name: string) {
		const who = (owners[id] ?? '').trim();
		const response = await call(`/api/admin/projects/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(who.includes('@') ? { email: who } : { uid: who })
		});
		await say(response, `${who} now owns ${name}.`);
		if (response.ok) {
			owners[id] = '';
			await invalidateAll();
		}
	}

	async function upload() {
		if (!file) return;
		const response = await call(`/api/admin/import?confirm=${IMPORT_CONFIRM}`, {
			method: 'POST',
			headers: { 'content-type': 'application/zip' },
			body: file
		});
		const body = await response.json().catch(() => ({}));
		message = response.ok
			? `Imported schema ${body.schema}. The previous database was saved to ${body.backup}.${body.warning ? ` Warning: ${body.warning}` : ''}`
			: (body.error ?? `failed (${response.status})`);
		if (response.ok) {
			file = null;
			importPhrase = '';
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>beryl admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-8 p-6 text-(--ink)">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold">beryl admin</h1>
		{#if data.authed}
			<button class="rounded border border-(--line) px-3 py-1" onclick={logout}>Log out</button>
		{/if}
	</header>

	{#if message}
		<p
			role="status"
			data-testid="message"
			class="rounded border p-3 {failed ? 'border-(--removed)' : 'border-(--added)'}"
		>
			{message}
		</p>
	{/if}

	{#if !data.authed}
		<form onsubmit={login} class="max-w-sm space-y-3">
			<label class="block">
				<span class="text-sm text-(--muted)">Admin token</span>
				<input
					type="password"
					autocomplete="current-password"
					bind:value={token}
					class="mt-1 w-full rounded border border-(--line) bg-(--surface) p-2"
				/>
			</label>
			<button
				disabled={busy || !token}
				class="rounded bg-(--accent) px-4 py-2 text-white disabled:opacity-50"
			>
				Log in
			</button>
		</form>
	{:else}
		<section aria-labelledby="health" class="space-y-2">
			<h2 id="health" class="text-lg font-semibold">Health</h2>
			<dl class="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
				<div>
					<dt class="text-sm text-(--muted)">Version</dt>
					<dd>{data.stats.appVersion} ({data.stats.build})</dd>
				</div>
				<div>
					<dt class="text-sm text-(--muted)">Database</dt>
					<dd>{data.stats.database.name}, {size(data.stats.database.bytes)}</dd>
				</div>
				<div>
					<dt class="text-sm text-(--muted)">Schema</dt>
					<dd>{data.stats.schema}</dd>
				</div>
				{#each Object.entries(data.stats.counts) as [table, count] (table)}
					<div>
						<dt class="text-sm text-(--muted)">{table}</dt>
						<dd>{count}</dd>
					</div>
				{/each}
			</dl>
			<details>
				<summary class="cursor-pointer text-sm text-(--muted)">Migrations</summary>
				<ul class="mt-1 font-mono text-sm">
					{#each data.stats.migrations as migration (migration.tag)}
						<li>{migration.applied ? 'applied' : 'PENDING'} {migration.tag}</li>
					{/each}
				</ul>
			</details>
		</section>

		<section aria-labelledby="projects" class="space-y-3">
			<h2 id="projects" class="text-lg font-semibold">Projects</h2>
			{#each data.projects as project (project.id)}
				<div class="rounded border border-(--line) bg-(--surface) p-3" data-testid="project">
					<div class="flex items-baseline justify-between gap-4">
						<div>
							<strong>{project.name}</strong>
							<span class="text-sm text-(--muted)">
								{project.slug ?? project.id} · {size(project.bytes)} · active {when(
									project.lastActivityAt
								)}
							</span>
						</div>
						<button
							class="text-sm text-(--removed)"
							onclick={() => {
								pending = { kind: 'projects', id: project.id, label: `Project ${project.name}` };
								typed = '';
							}}>Delete</button
						>
					</div>
					<form
						class="mt-2 flex items-center gap-2 text-sm"
						onsubmit={(event) => {
							event.preventDefault();
							void assign(project.id, project.name);
						}}
					>
						<span class="text-(--muted)">
							Owner: {project.ownerEmail ?? project.ownerUid ?? 'none'}{project.ownerUid &&
							project.hasWriteKey
								? ' (Write key active)'
								: ''}
						</span>
						<input
							bind:value={owners[project.id]}
							aria-label="Owner email or uid for {project.name}"
							placeholder="email or uid"
							class="min-w-0 flex-1 rounded border border-(--line) bg-(--surface) p-1"
						/>
						<button
							disabled={busy || !(owners[project.id] ?? '').trim()}
							class="rounded border border-(--line) px-3 py-1 disabled:opacity-50"
						>
							{project.ownerUid ? 'Reassign' : 'Assign'}
						</button>
					</form>
					<ul class="mt-2 space-y-1 text-sm">
						{#each project.topics as topic (topic.id)}
							<li class="flex justify-between gap-4">
								<span>
									{topic.title}
									<span class="text-(--muted)">
										{topic.status} · {topic.nodes} nodes · {topic.notes} notes · {size(topic.bytes)} ·
										{when(topic.lastActivityAt)}
									</span>
								</span>
								<button
									class="text-(--removed)"
									onclick={() => {
										pending = { kind: 'topics', id: topic.id, label: `Topic ${topic.title}` };
										typed = '';
									}}>Delete</button
								>
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="text-(--muted)">No Projects.</p>
			{/each}
		</section>

		{#if pending}
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void remove();
				}}
				class="space-y-2 rounded border border-(--removed) p-3"
			>
				<p>
					Delete <strong>{pending.label}</strong> and everything under it? Type its exact name to confirm.
				</p>
				<input
					bind:value={typed}
					aria-label="Confirm name"
					class="w-full rounded border border-(--line) bg-(--surface) p-2"
				/>
				<button
					disabled={busy || !typed}
					class="rounded bg-(--removed) px-4 py-2 text-white disabled:opacity-50"
				>
					Delete forever
				</button>
				<button type="button" class="px-3 py-2" onclick={() => (pending = null)}>Cancel</button>
			</form>
		{/if}

		<section aria-labelledby="export" class="space-y-2">
			<h2 id="export" class="text-lg font-semibold">Export</h2>
			<p class="text-sm text-(--muted)">
				A zip with a consistent snapshot of every Project, Topic, Node and Note, plus a manifest.
				Write keys keep working on the new host; browser Sessions and Pairing codes are not carried.
			</p>
			<a
				href={resolve('/api/admin/export')}
				download
				class="inline-block rounded bg-(--accent) px-4 py-2 text-white">Download bundle</a
			>
		</section>

		<section aria-labelledby="import" class="space-y-2">
			<h2 id="import" class="text-lg font-semibold">Import</h2>
			<p class="text-sm text-(--muted)">
				Replaces everything on this server. The current database is saved as a bundle first, and
				open boards reload.
			</p>
			<input
				type="file"
				accept=".zip,application/zip"
				aria-label="Bundle file"
				onchange={(event) => (file = event.currentTarget.files?.[0] ?? null)}
			/>
			<label class="block">
				<span class="text-sm text-(--muted)">Type <code>{IMPORT_CONFIRM}</code> to confirm</span>
				<input
					bind:value={importPhrase}
					aria-label="Import confirmation"
					class="mt-1 w-full rounded border border-(--line) bg-(--surface) p-2"
				/>
			</label>
			<button
				disabled={busy || !file || importPhrase !== IMPORT_CONFIRM}
				onclick={upload}
				class="rounded bg-(--removed) px-4 py-2 text-white disabled:opacity-50"
			>
				Replace everything
			</button>
		</section>
	{/if}
</main>
