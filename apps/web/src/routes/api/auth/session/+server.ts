import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import {
	COOKIE_TTL_MS,
	cookieUser,
	exchangeIdToken,
	sessionCookie,
	verifyCookie
} from '#lib/server/login.ts';
import { log } from '#lib/server/log.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { revokeEverywhere } from '#lib/server/revoke.ts';

const secure = (url: URL) => publicOrigin(url).startsWith('https:');

export const POST: RequestHandler = route(async ({ request, url }) => {
	const { idToken } = await readBody(request);
	if (typeof idToken !== 'string' || idToken === '') throw new ApiError(400, 'idToken is required');
	const cookie = await exchangeIdToken(idToken);
	const user = await verifyCookie(cookie);
	return Response.json(
		{ user },
		{ headers: { 'set-cookie': sessionCookie(cookie, secure(url), COOKIE_TTL_MS) } }
	);
});

// Signing out revokes every session and agent of the user; the cookie is cleared even if that fails.
export const DELETE: RequestHandler = route(async ({ request, url }) => {
	const clear = { 'set-cookie': sessionCookie('', secure(url), 0) };
	try {
		const user = await cookieUser(request);
		if (user) await revokeEverywhere(user.uid);
	} catch (error) {
		log('logout.revoke_failed', { error: error instanceof Error ? error.message : String(error) });
		return Response.json({ ok: true, revoked: false }, { headers: clear });
	}
	return Response.json({ ok: true, revoked: true }, { headers: clear });
});
