import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { stats } from '#lib/server/admin/portal.ts';

export const GET: RequestHandler = adminRoute(async () =>
	Response.json(await stats(), { headers: { 'cache-control': 'no-store' } })
);
