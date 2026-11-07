import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { COOKIE_TTL_MS, exchangeIdToken, sessionCookie, verifyCookie } from '#lib/server/login.ts';

const secure = (url: URL) => url.protocol === 'https:';

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

export const DELETE: RequestHandler = route(async ({ url }) =>
	Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie('', secure(url), 0) } })
);
