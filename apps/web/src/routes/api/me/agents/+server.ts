import type { RequestHandler } from './$types';
import { route } from '#lib/server/api.ts';
import { requireCookie } from '#lib/server/login.ts';
import { revokeEverywhere } from '#lib/server/revoke.ts';

// Agents stop at their next request.
export const DELETE: RequestHandler = route(async ({ request }) => {
	const user = await requireCookie(request);
	await revokeEverywhere(user.uid);
	return Response.json({ ok: true });
});
