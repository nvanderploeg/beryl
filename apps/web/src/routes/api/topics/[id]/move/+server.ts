import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseMove } from '#lib/server/parse.ts';
import { moveNode } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	const { from, to } = parseMove(await readBody(request));
	return Response.json({ moved: await moveNode(topicId, from, to) });
});
