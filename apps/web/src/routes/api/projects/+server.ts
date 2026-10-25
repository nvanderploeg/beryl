import type { RequestHandler } from './$types';
import { readBody, route } from '#lib/server/api.ts';
import { generateKey, hashKey } from '#lib/server/auth.ts';
import { log } from '#lib/server/log.ts';
import { publicOrigin } from '#lib/server/origin.ts';
import { parseProjectCreate } from '#lib/server/parse.ts';
import { insertProject } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, url, getClientAddress }) => {
	const { name } = parseProjectCreate(await readBody(request));
	const id = crypto.randomUUID();
	const writeKey = generateKey('write');
	const noteKey = generateKey('note');
	const now = new Date();
	await insertProject({
		id,
		name,
		writeKeyHash: hashKey(writeKey),
		noteKeyHash: hashKey(noteKey),
		createdAt: now,
		lastWriteAt: now
	});
	log('project.create', { id, name, ip: getClientAddress() });
	return Response.json(
		{ id, name, writeKey, noteKey, url: `${publicOrigin(url)}/p/${id}` },
		{ status: 201 }
	);
});
