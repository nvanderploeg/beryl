import type { RequestHandler } from './$types';
import { adminRoute } from '#lib/server/admin/auth.ts';
import { listProjects } from '#lib/server/admin/portal.ts';

export const GET: RequestHandler = adminRoute(async () =>
	Response.json({ projects: await listProjects() }, { headers: { 'cache-control': 'no-store' } })
);
