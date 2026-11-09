import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { parseOwnerTarget } from '#lib/server/parse.ts';
import { parseId, readBody } from '#lib/server/api.ts';
import { assignOwner, deleteProject } from '#lib/server/admin/portal.ts';

export const DELETE: RequestHandler = adminRoute(async ({ request, params }) => {
	const body = await readBody(request);
	return Response.json(await deleteProject(parseId(params.id, 'project'), body));
});

export const PATCH: RequestHandler = adminRoute(async ({ request, params }) => {
	const target = parseOwnerTarget(await readBody(request));
	return Response.json(await assignOwner(parseId(params.id, 'project'), target));
});
