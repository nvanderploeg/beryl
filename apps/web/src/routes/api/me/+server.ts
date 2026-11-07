import type { RequestHandler } from './$types';
import { route } from '#lib/server/api.ts';
import { loginUser } from '#lib/server/login.ts';

export const GET: RequestHandler = route(async ({ request }) =>
	Response.json({ user: await loginUser(request) }, { headers: { 'cache-control': 'no-store' } })
);
