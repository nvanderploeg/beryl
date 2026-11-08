import { globSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { buildInfo } from './build-info.ts';

const DB_IMPORT = /from '(?:[^']*(?:test\/(?:db|http)|db\/index|\/db)\.ts|\$app\/env\/private)'/;

function reachable(url: string): Promise<boolean> {
	const { hostname, port } = new URL(url);
	return new Promise((done) => {
		const socket = connect({ host: hostname, port: Number(port) || 5432, timeout: 1000 });
		socket.once('connect', () => (socket.destroy(), done(true)));
		socket.once('timeout', () => (socket.destroy(), done(false)));
		socket.once('error', () => done(false));
	});
}

export default defineConfig(async ({ mode, command }) => {
	// Set before the sveltekit plugin loads the environment; the real environment wins.
	if (mode === 'test') {
		process.env.DATABASE_URL ??= 'postgres://beryl:beryl@127.0.0.1:5446/beryl_test';
	}
	if (mode === 'development') {
		process.env.DATABASE_URL ??= 'postgres://beryl:beryl@127.0.0.1:5446/beryl_dev';
	}
	// Route analysis imports server modules; the runtime environment supplies the real value.
	if (command === 'build') {
		process.env.DATABASE_URL ??= 'postgres://build:build@127.0.0.1:5432/build';
	}

	// Specs that import the database are skipped, not failed, when Postgres is down.
	const dbUp = mode !== 'test' || (await reachable(process.env.DATABASE_URL!));
	const needsDb = dbUp
		? []
		: globSync('src/**/*.spec.ts').filter((f) => DB_IMPORT.test(readFileSync(f, 'utf8')));
	if (!dbUp) {
		console.warn(`Postgres unreachable: skipping ${needsDb.length} database specs`);
	}

	return {
		define: buildInfo(),
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', ...needsDb],
						globalSetup: dbUp ? ['./src/lib/server/test/global-setup.ts'] : [],
						fileParallelism: false
					}
				}
			]
		}
	};
});
