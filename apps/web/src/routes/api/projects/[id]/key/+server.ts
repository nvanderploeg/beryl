import type { RequestHandler } from './$types';
import { parseId, route } from '#lib/server/api.ts';
import { authorizeOwner, generateKey, hashKey } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';
import { setWriteKeyHash } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeOwner(request, projectId);
	const writeKey = generateKey();
	await setWriteKeyHash(projectId, hashKey(writeKey));
	log('project.rotate_key', { id: projectId });
	return Response.json({ writeKey });
});

export const DELETE: RequestHandler = route(async ({ request, params }) => {
	const projectId = parseId(params.id, 'project');
	await authorizeOwner(request, projectId);
	await setWriteKeyHash(projectId, null);
	log('project.clear_key', { id: projectId });
	return new Response(null, { status: 204 });
});
