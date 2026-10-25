import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseResolve } from '#lib/server/parse.ts';
import { resolveNotes } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	const items = parseResolve(await readBody(request));
	return Response.json({ notes: await resolveNotes(topicId, items) });
});
