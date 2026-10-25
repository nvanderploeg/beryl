import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseTopicPatch } from '#lib/server/parse.ts';
import { getSnapshot, patchTopic } from '#lib/server/store.ts';

export const GET: RequestHandler = route(async ({ params }) => {
	const snapshot = await getSnapshot(parseId(params.id, 'topic'));
	if (!snapshot) throw new ApiError(404, 'topic not found');
	return Response.json(snapshot);
});

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	const topic = await patchTopic(topicId, parseTopicPatch(await readBody(request)));
	return Response.json({ topic });
});
