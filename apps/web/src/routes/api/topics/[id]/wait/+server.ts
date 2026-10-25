import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseTimeout } from '#lib/server/parse.ts';
import { waitForSent } from '#lib/server/wait.ts';

export const GET: RequestHandler = route(async ({ request, params, url }) => {
	const topicId = parseId(params.id, 'topic');
	const timeoutMs = parseTimeout(url.searchParams.get('timeoutMs'));
	await authorizeTopic(request, topicId, 'write');
	const sent = await waitForSent(topicId, timeoutMs, request.signal);
	return Response.json({ sent }, { headers: { 'cache-control': 'no-store' } });
});
