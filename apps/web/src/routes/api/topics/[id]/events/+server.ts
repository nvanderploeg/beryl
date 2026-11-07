import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { readableTopic } from '#lib/server/auth.ts';
import { parsePath } from '#lib/server/parse.ts';
import { topicEvents } from '#lib/server/store.ts';

export const GET: RequestHandler = route(async ({ request, params, url }) => {
	const topicId = parseId(params.id, 'topic');
	const raw = url.searchParams.get('path');
	const path = raw === null ? undefined : parsePath(raw);
	await readableTopic(request, topicId);
	return Response.json({ events: await topicEvents(topicId, path) });
});
