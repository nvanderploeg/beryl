import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseNodeInputs, parsePaths } from '#lib/server/parse.ts';
import { putNodes, removeNodes } from '#lib/server/store.ts';

export const PUT: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	const body = await readBody(request);
	return Response.json({ nodes: await putNodes(topicId, parseNodeInputs(body.nodes)) });
});

export const DELETE: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'write');
	const paths = parsePaths(await readBody(request));
	return Response.json({ removed: await removeNodes(topicId, paths) });
});
