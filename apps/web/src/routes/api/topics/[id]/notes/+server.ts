import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeTopic } from '#lib/server/auth.ts';
import { parseNoteCreate } from '#lib/server/parse.ts';
import { createNote } from '#lib/server/store.ts';

export const POST: RequestHandler = route(async ({ request, params }) => {
	const topicId = parseId(params.id, 'topic');
	await authorizeTopic(request, topicId, 'note');
	const note = await createNote(topicId, parseNoteCreate(await readBody(request)));
	return Response.json({ note }, { status: 201 });
});
