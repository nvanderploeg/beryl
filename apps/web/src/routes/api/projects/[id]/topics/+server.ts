import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeProject } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { parseTopicCreate } from '#lib/server/parse.ts';
import { createTopic } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params, url }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeProject(request, projectId, 'write');
	const { topic, nodes } = await createTopic(projectId, parseTopicCreate(await readBody(request)));
	log('topic.create', { project: projectId, topic: topic.id, nodes: nodes.length });
	return Response.json(
		{
			topicId: topic.id,
			url: `${publicOrigin(url)}/p/${projectId}/t/${topic.id}`,
			topic,
			nodes
		},
		{ status: 201 }
	);
});
