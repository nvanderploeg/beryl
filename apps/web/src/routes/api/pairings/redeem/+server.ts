import type { RequestHandler } from './$types';
import { ApiError, readBody, route } from '#lib/server/api.ts';
import { redeemPairing } from '#lib/server/sessions.ts';

export const POST: RequestHandler = route(async ({ request }) => {
	const { code } = await readBody(request);
	if (typeof code !== 'string' || code === '') throw new ApiError(400, 'code is required');
	const { token, projectId, expiresAt } = await redeemPairing(code);
	return Response.json({ token, projectId, expiresAt: expiresAt.toISOString() });
});
