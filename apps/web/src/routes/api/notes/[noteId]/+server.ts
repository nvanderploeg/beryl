import type { RequestHandler } from './$types';
import { parseId, readBody, route } from '#lib/server/api.ts';
import { authorizeNote } from '#lib/server/auth.ts';
import { parseNotePatch } from '#lib/server/parse.ts';
import { deleteNote, patchNote } from '#lib/server/store.ts';

export const PATCH: RequestHandler = route(async ({ request, params }) => {
	const noteId = parseId(params.noteId, 'note');
	const { topicId } = await authorizeNote(request, noteId);
	const note = await patchNote(topicId, noteId, parseNotePatch(await readBody(request)));
	return Response.json({ note });
});

export const DELETE: RequestHandler = route(async ({ request, params }) => {
	const noteId = parseId(params.noteId, 'note');
	const { topicId } = await authorizeNote(request, noteId);
	return Response.json({ removed: await deleteNote(topicId, noteId) });
});
