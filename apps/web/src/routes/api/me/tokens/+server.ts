import type { RequestHandler } from './$types';
import { route } from '#lib/server/api.ts';
import { requireCookie } from '#lib/server/login.ts';
import { listLoginTokens } from '#lib/server/logins.ts';

export const GET: RequestHandler = route(async ({ request }) => {
	const user = await requireCookie(request);
	return Response.json({ tokens: await listLoginTokens(user.uid) });
});
