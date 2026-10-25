import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description:
			'Public base URL used in links the API returns, e.g. `https://speculum.nanzero.com`. Unset: the request origin.',
		schema: (value) => value?.trim().replace(/\/+$/, '') || undefined
	},
	SPECULUM_IDLE_MS: {
		description: 'Milliseconds without a topic write before its stream sends `idle` and closes.',
		schema: (value) => Number(value || 14_400_000)
	},
	SPECULUM_WRITES_PER_WINDOW: {
		description:
			'Writes one client address may burst, refilled at this many per write window; excess gets 429. 0 disables the limit.',
		schema: (value) => Number(value || 300)
	},
	SPECULUM_WRITE_WINDOW_MS: {
		description: 'Milliseconds over which a client address regains its full write burst.',
		schema: (value) => Number(value || 300_000)
	},
	SPECULUM_HEARTBEAT_MS: {
		description: 'Milliseconds between `: ping` heartbeats on a topic stream.',
		schema: (value) => Number(value || 25_000)
	}
});
