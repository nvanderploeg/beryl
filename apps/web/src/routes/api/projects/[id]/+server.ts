import type { RequestHandler } from './$types';
import { ApiError, parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeProject } from '#lib/server/auth.ts';
import { parseProjectPatch } from '#lib/server/parse.ts';
import { getProjectPage, renameProject } from '#lib/server/store.ts';

export const GET: RequestHandler = route(async ({ params }) => {
	const page = await getProjectPage(parseId(params.id, 'project'));
	if (!page) throw new ApiError(404, 'project not found');
	return Response.json(page);
});

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeProject(request, projectId, 'write');
	const { name } = parseProjectPatch(await readBody(request));
	return Response.json({ project: await renameProject(projectId, name) });
});
