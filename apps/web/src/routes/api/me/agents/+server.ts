import type { RequestHandler } from './$types';
import { ApiError, route } from '#lib/server/api.ts';
import { verifier } from '#lib/server/firebase.ts';
import { requireCookie } from '#lib/server/login.ts';

// Revokes every Firebase refresh token of the user: agents stop at their next request.
export const DELETE: RequestHandler = route(async ({ request }) => {
	const user = await requireCookie(request);
	const check = verifier();
	if (!check) throw new ApiError(503, 'sign-in is not configured');
	await check.revokeRefreshTokens(user.uid);
	return Response.json({ ok: true });
});
