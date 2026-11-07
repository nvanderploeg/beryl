import { defineEnvVars } from '@sveltejs/kit/env';

// A malformed number must stop the server: NaN would make every `>` cap pass.
function positive(value: string | undefined, fallback: number, allowZero = false): number {
	if (!value?.trim()) return fallback;
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || (number === 0 && !allowZero)) {
		throw new Error(`expected a positive number, got ${JSON.stringify(value)}`);
	}
	return number;
}

const optional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	ORIGIN: {
		description:
			'Public base URL used in links the API returns, e.g. `https://beryl.nanzero.com`. Unset: the request origin.',
		schema: (value) => value?.trim().replace(/\/+$/, '') || undefined
	},
	BERYL_IDLE_MS: {
		description: 'Milliseconds without a topic write before its stream sends `idle` and closes.',
		schema: (value) => positive(value, 14_400_000)
	},
	BERYL_WRITES_PER_WINDOW: {
		description:
			'Writes one client address may burst, refilled at this many per write window; excess gets 429. 0 disables the limit.',
		schema: (value) => positive(value, 300, true)
	},
	BERYL_WRITE_WINDOW_MS: {
		description: 'Milliseconds over which a client address regains its full write burst.',
		schema: (value) => positive(value, 300_000)
	},
	ADMIN_TOKEN: {
		description:
			'The Admin token. At least 16 characters. Unset: the admin portal and every `/api/admin` route answer 404.',
		schema: (value) => {
			const token = value?.trim();
			if (!token) return undefined;
			if (token.length < 16) throw new Error('ADMIN_TOKEN must be at least 16 characters');
			return token;
		}
	},
	ADMIN_BACKUP_DIR: {
		description: 'Directory for the automatic pre-import backup Bundles. Unset: the OS temp dir.',
		schema: (value) => value?.trim() || undefined
	},
	ADMIN_MAX_BUNDLE_MB: {
		description: 'Largest Bundle an import accepts, in MiB of zip.',
		schema: (value) => positive(value, 256)
	},
	ADMIN_MAX_UNPACKED_MB: {
		description: 'Largest total unpacked size of a Bundle, in MiB.',
		schema: (value) => positive(value, 2048)
	},
	BERYL_HEARTBEAT_MS: {
		description: 'Milliseconds between `: ping` heartbeats on a topic stream.',
		schema: (value) => positive(value, 25_000)
	},
	FIREBASE_SERVICE_ACCOUNT_FILE: {
		description:
			'Path to a Firebase service account JSON file, used to verify sign-ins. With `FIREBASE_SERVICE_ACCOUNT` unset too, sign-in is off.',
		schema: optional
	},
	FIREBASE_SERVICE_ACCOUNT: {
		description:
			'The Firebase service account JSON itself, when a file is awkward. Wins over `FIREBASE_SERVICE_ACCOUNT_FILE`.',
		schema: optional
	},
	AUTH_COOKIE_DOMAIN: {
		description:
			'Domain attribute of the shared `runestone_session` cookie, e.g. `.nanzero.com`. Unset: a host-only cookie.',
		schema: optional
	},
	FIREBASE_WEB_API_KEY: {
		description: 'The Firebase web app API key the sign-in page loads. Unset: sign-in is off.',
		schema: optional
	},
	FIREBASE_AUTH_DOMAIN: {
		description: 'The Firebase auth domain. Unset: `<project id>.firebaseapp.com`.',
		schema: optional
	},
	FIREBASE_APP_ID: {
		description: 'The Firebase web app id. Optional.',
		schema: optional
	}
});
