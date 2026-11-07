import type { RequestHandler } from './$types';
import { ApiError, route } from '#lib/server/api.ts';
import { loginUser } from '#lib/server/login.ts';
import { revokeEverywhere } from '#lib/server/revoke.ts';

// Agents stop at their next request. Called with an agent's ID token or the browser's cookie.
export const DELETE: RequestHandler = route(async ({ request }) => {
	const user = await loginUser(request);
	if (!user) throw new ApiError(401, 'sign in required');
	await revokeEverywhere(user.uid);
	return Response.json({ ok: true });
});
