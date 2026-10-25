import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { pullNotes } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	return Response.json(await pullNotes(topicId));
});
