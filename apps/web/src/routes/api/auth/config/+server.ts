import type { RequestHandler } from './$types';
import { route } from '#lib/server/api.ts';
import { webConfig } from '#lib/server/firebase.ts';

export const GET: RequestHandler = route(async () => {
	const config = webConfig();
	return Response.json(config ? { enabled: true, config } : { enabled: false });
});
