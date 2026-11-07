import type { RequestHandler } from './$types';
import { readBody, route } from '#lib/server/api.ts';
import { generateKey, hashKey } from '#lib/server/auth.ts';
import { loginUser } from '#lib/server/login.ts';
import { log } from '#lib/server/log.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { parseProjectCreate } from '#lib/server/parse.ts';
import { insertProject } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, url, getClientAddress }) => {
	const { name } = parseProjectCreate(await readBody(request));
	const id = crypto.randomUUID();
	const user = await loginUser(request);
	const writeKey = user ? undefined : generateKey();
	const now = new Date();
	const slug = await insertProject({
		id,
		name,
		writeKeyHash: writeKey ? hashKey(writeKey) : null,
		ownerUid: user?.uid ?? null,
		createdAt: now,
		lastWriteAt: now
	});
	log('project.create', { id, name, owned: Boolean(user), ip: getClientAddress() });
	return Response.json(
		{ id, slug, name, owned: Boolean(user), writeKey, url: `${publicOrigin(url)}/p/${slug}` },
		{ status: 201 }
	);
});
