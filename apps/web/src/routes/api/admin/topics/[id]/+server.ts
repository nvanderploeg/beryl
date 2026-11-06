import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { parseId, readBody } from '#lib/server/api.ts';
import { deleteTopic } from '#lib/server/admin/portal.ts';

export const DELETE: RequestHandler = adminRoute(async ({ request, params }) => {
	const body = await readBody(request);
	return Response.json(await deleteTopic(parseId(params.id, 'topic'), body));
});
