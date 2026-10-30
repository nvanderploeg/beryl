import type { RequestHandler } from './$types';
import { route } from '#lib/server/api.ts';
import { bearer } from '#lib/server/auth.ts';
import { refreshSession } from '#lib/server/sessions.ts';

export const POST: RequestHandler = route(async ({ request }) => {
	const expiresAt = await refreshSession(bearer(request));
	return Response.json({ expiresAt: expiresAt.toISOString() });
});
