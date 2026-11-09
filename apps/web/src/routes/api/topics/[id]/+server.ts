import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic, isOwnerLogin, readableTopic } from '#lib/server/auth.ts';
import { parseTopicPatch } from '#lib/server/parse.ts';
import { getProjectRow, getSnapshot, patchTopic } from '#lib/server/store.ts';
import { endStreams } from '#lib/server/stream.ts';

export const GET: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await readableTopic(request, topicId);
	const snapshot = await getSnapshot(topicId);
	if (!snapshot) throw new ApiError(404, 'topic not found');
	return Response.json(snapshot);
});

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	const row = await authorizeTopic(request, topicId, 'write');
	const patch = parseTopicPatch(await readBody(request));
	if (patch.public === false) {
		const project = await getProjectRow(row.projectId);
		if (project?.ownerUid && !(await isOwnerLogin(request, project))) {
			throw new ApiError(403, 'only the owner can make a topic private');
		}
	}
	const topic = await patchTopic(topicId, patch);
	if (!topic.public) endStreams([topicId]);
	return Response.json({ topic });
});
