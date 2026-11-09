import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeProject, isOwnerLogin } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { parseTopicCreate } from '#lib/server/parse.ts';
import { createTopic } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params, url }) => {
	const projectId = parseId(params.id, 'project');
	const project = await authorizeProject(request, projectId, 'write');
	const input = parseTopicCreate(await readBody(request));
	if (
		project.ownerUid !== null &&
		input.public !== true &&
		!(await isOwnerLogin(request, project))
	) {
		throw new ApiError(403, 'a Write key creates only public topics of an owned project');
	}
	const { topic, nodes } = await createTopic(projectId, input);
	log('topic.create', { project: projectId, topic: topic.id, nodes: nodes.length });
	return Response.json(
		{
			topicId: topic.id,
			url: `${publicOrigin(url)}/p/${project?.slug ?? projectId}/t/${topic.slug}`,
			topic,
			nodes
		},
		{ status: 201 }
	);
});
