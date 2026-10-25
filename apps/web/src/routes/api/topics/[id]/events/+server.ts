import type { RequestHandler } from './$types';
import { ApiError, parseId, route } from '#lib/server/api.ts';
import { parsePath } from '#lib/server/parse.ts';
import { getTopicRow, topicEvents } from '#lib/server/store.ts';

export const GET: RequestHandler = route(async ({ params, url }) => {
	const topicId = parseId(params.id, 'topic');
	const raw = url.searchParams.get('path');
	const path = raw === null ? undefined : parsePath(raw);
	if (!(await getTopicRow(topicId))) throw new ApiError(404, 'topic not found');
	return Response.json({ events: await topicEvents(topicId, path) });
});
