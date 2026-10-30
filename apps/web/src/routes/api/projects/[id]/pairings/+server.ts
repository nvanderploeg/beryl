import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { authorizeProject } from '#lib/server/auth.ts';
import { createPairing } from '#lib/server/sessions.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeProject(request, projectId, 'write');
	const { code, expiresAt } = await createPairing(projectId);
	return Response.json({ code, expiresAt: expiresAt.toISOString() }, { status: 201 });
});
