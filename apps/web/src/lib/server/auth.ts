import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '#lib/server/api.ts';
import { hashKey } from '#lib/server/hash.ts';
import { actOnSession, SESSION_PREFIX } from '#lib/server/sessions.ts';
import {
	getNoteRow,
	getProjectRow,
	getTopicRow,
	type NoteRow,
	type ProjectRow,
	type TopicRow
} from '#lib/server/store.ts';

export { hashKey };

// 'note' is the person's reach: a session token, or the Write key.
export type KeyKind = 'write' | 'note';

export function generateKey(): string {
	return `bw_${randomBytes(32).toString('base64url')}`;
}

export function bearer(request: Request): string {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '');
	if (!match) throw new ApiError(401, 'missing key');
	return match[1];
}

function isWriteKey(key: string, project: ProjectRow): boolean {
	const given = Buffer.from(hashKey(key), 'hex');
	const stored = Buffer.from(project.writeKeyHash, 'hex');
	return given.length === stored.length && timingSafeEqual(given, stored);
}

async function checkKey(request: Request, project: ProjectRow, kind: KeyKind): Promise<void> {
	const key = bearer(request);
	if (kind === 'note' && key.startsWith(SESSION_PREFIX)) {
		await actOnSession(key, project.id);
		return;
	}
	if (!isWriteKey(key, project)) throw new ApiError(403, 'invalid key');
}

export async function authorizeProject(
	request: Request,
	projectId: string,
	kind: KeyKind
): Promise<ProjectRow> {
	const project = await getProjectRow(projectId);
	if (!project) throw new ApiError(404, 'project not found');
	await checkKey(request, project, kind);
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
