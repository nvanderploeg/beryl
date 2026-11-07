import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { requireCookie } from '#lib/server/login.ts';
import { revokeLoginToken } from '#lib/server/logins.ts';

export const DELETE: RequestHandler = route(async ({ request, params }) => {
	const user = await requireCookie(request);
	const id = parseId(params.id, 'token');
	await revokeLoginToken(user.uid, id);
	return Response.json({ removed: id });
});
