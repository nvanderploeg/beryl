import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '#lib/server/api.ts';
import {
	getNoteRow,
	getProjectRow,
	getTopicRow,
	type NoteRow,
	type ProjectRow,
	type TopicRow
} from '#lib/server/store.ts';

export type KeyKind = 'write' | 'note';

const PREFIX: Record<KeyKind, string> = { write: 'pw_', note: 'pn_' };

export function generateKey(kind: KeyKind): string {
	return `${PREFIX[kind]}${randomBytes(32).toString('base64url')}`;
}

export function hashKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}

function checkKey(request: Request, project: ProjectRow, kind: KeyKind): void {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '');
	if (!match) throw new ApiError(401, 'missing key');
	const given = Buffer.from(hashKey(match[1]), 'hex');
	const stored = Buffer.from(kind === 'write' ? project.writeKeyHash : project.noteKeyHash, 'hex');
	if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
		throw new ApiError(403, 'invalid key');
	}
}

export async function authorizeProject(
	request: Request,
	projectId: string,
	kind: KeyKind
): Promise<ProjectRow> {
	const project = await getProjectRow(projectId);
	if (!project) throw new ApiError(404, 'project not found');
	checkKey(request, project, kind);
	return project;
}

export async function authorizeTopic(
	request: Request,
	topicId: string,
	kind: KeyKind
): Promise<TopicRow> {
	const topic = await getTopicRow(topicId);
	if (!topic) throw new ApiError(404, 'topic not found');
	await authorizeProject(request, topic.projectId, kind);
	return topic;
}

export async function authorizeNote(request: Request, noteId: string): Promise<NoteRow> {
	const note = await getNoteRow(noteId);
	if (!note) throw new ApiError(404, 'note not found');
	await authorizeTopic(request, note.topicId, 'note');
	return note;
}
