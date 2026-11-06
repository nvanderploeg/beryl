import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { BERYL_WRITE_WINDOW_MS, BERYL_WRITES_PER_WINDOW } from '$app/env/private';
import { bootstrap } from '#lib/server/bootstrap.ts';
import { log } from '#lib/server/log.ts';
import { adminAuth } from '#lib/server/admin/auth.ts';
import { isImporting } from '#lib/server/admin/bundle.ts';
import { normalizePath } from '#lib/server/path.ts';
import { createRateLimiter, limitWrites } from '#lib/server/ratelimit.ts';

// The import itself, the way in and out of the portal, and the health probe stay reachable during an import.
const FREEZE_EXEMPT = new Set([
	'/api/admin/import',
	'/api/admin/login',
	'/api/admin/logout',
	'/api/health'
]);

const writes = createRateLimiter(BERYL_WRITES_PER_WINDOW, BERYL_WRITE_WINDOW_MS);

export const init: ServerInit = async () => {
	if (building) return;
	await bootstrap();
};

export const handle: Handle = async ({ event, resolve }) => {
	const gated = adminAuth.gate(event);
	if (gated) return gated;
	const refused = limitWrites(writes, event);
	if (refused) {
		log('ratelimit', {
			ip: event.getClientAddress(),
			method: event.request.method,
			path: event.url.pathname,
			retry_after: refused.headers.get('retry-after')
		});
		return refused;
	}
	const path = normalizePath(event.url.pathname) ?? '';
	if (isImporting() && path.startsWith('/api/') && !FREEZE_EXEMPT.has(path)) {
		return Response.json(
			{ error: 'the server is importing a bundle; retry shortly' },
			{ status: 503, headers: { 'retry-after': '30' } }
		);
	}
	const response = await resolve(event);
	if (response.status >= 400 && path.startsWith('/api/')) {
		const body = await response
			.clone()
			.json()
			.catch(() => null);
		log('api.fail', {
			ip: event.getClientAddress(),
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			error: typeof body?.error === 'string' ? body.error : undefined
		});
	}
	return response;
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind !== 'unknown') return;
	log('error', {
		method: event.request.method,
		path: event.url.pathname,
		error: error instanceof Error ? (error.stack ?? error.message) : String(error)
	});
};
