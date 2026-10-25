import { expect } from 'vitest';
import { GET as getHealth } from '../../../routes/api/health/+server.ts';
import {
	DELETE as deleteNoteRoute,
	PATCH as patchNoteRoute
} from '../../../routes/api/notes/[noteId]/+server.ts';
import { POST as postProjectRoute } from '../../../routes/api/projects/+server.ts';
import {
	GET as getProjectRoute,
	PATCH as patchProjectRoute
} from '../../../routes/api/projects/[id]/+server.ts';
import { POST as postTopicRoute } from '../../../routes/api/projects/[id]/topics/+server.ts';
import {
	GET as getTopicRoute,
	PATCH as patchTopicRoute
} from '../../../routes/api/topics/[id]/+server.ts';
import { GET as getEventsRoute } from '../../../routes/api/topics/[id]/events/+server.ts';
import { POST as moveRoute } from '../../../routes/api/topics/[id]/move/+server.ts';
import {
	DELETE as deleteNodesRoute,
	PUT as putNodesRoute
} from '../../../routes/api/topics/[id]/nodes/+server.ts';
import { POST as postNoteRoute } from '../../../routes/api/topics/[id]/notes/+server.ts';
import { POST as pullRoute } from '../../../routes/api/topics/[id]/pull/+server.ts';
import { POST as resolveRoute } from '../../../routes/api/topics/[id]/resolve/+server.ts';
import { POST as sendRoute } from '../../../routes/api/topics/[id]/send/+server.ts';
import { GET as streamRoute } from '../../../routes/api/topics/[id]/stream/+server.ts';
import { GET as waitRoute } from '../../../routes/api/topics/[id]/wait/+server.ts';

export const ORIGIN = 'http://beryl.test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Body = Record<string, any>;

export interface Call {
	method?: string;
	path: string;
	body?: unknown;
	rawBody?: string;
	key?: string;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export function event({
	method = 'GET',
	path,
	body,
	rawBody,
	key,
	params = {},
	headers = {},
	signal
}: Call) {
	const url = new URL(path, ORIGIN);
	const init: RequestInit = { method, headers: new Headers(headers), signal };
	const h = init.headers as Headers;
	if (rawBody !== undefined || body !== undefined) {
		h.set('content-type', 'application/json');
		init.body = rawBody ?? JSON.stringify(body);
	}
	if (key !== undefined) h.set('authorization', `Bearer ${key}`);
	return {
		request: new Request(url, init),
		params,
		url,
		getClientAddress: () => '10.0.0.1'
	} as never;
}

export interface Reply {
	status: number;
	body: Body;
	headers: Headers;
}

async function reply(response: Response | Promise<Response>): Promise<Reply> {
	const res = await response;
	return { status: res.status, body: await res.json(), headers: res.headers };
}

const topicCall = (method: string, id: string, tail: string, key?: string, body?: unknown) =>
	event({ method, path: `/api/topics/${id}${tail}`, key, body, params: { id } });

export const api = {
	health: () => reply(getHealth(event({ path: '/api/health' }))),
	createProject: (body: unknown = {}) =>
		reply(postProjectRoute(event({ method: 'POST', path: '/api/projects', body }))),
	rawCreateProject: (rawBody: string) =>
		reply(postProjectRoute(event({ method: 'POST', path: '/api/projects', rawBody }))),
	getProject: (id: string) =>
		reply(getProjectRoute(event({ path: `/api/projects/${id}`, params: { id } }))),
	patchProject: (id: string, body: unknown, key?: string) =>
		reply(
			patchProjectRoute(
				event({ method: 'PATCH', path: `/api/projects/${id}`, body, key, params: { id } })
			)
		),
	createTopic: (id: string, body: unknown, key?: string) =>
		reply(
			postTopicRoute(
				event({ method: 'POST', path: `/api/projects/${id}/topics`, body, key, params: { id } })
			)
		),
	getTopic: (id: string) => reply(getTopicRoute(topicCall('GET', id, ''))),
	patchTopic: (id: string, body: unknown, key?: string) =>
		reply(patchTopicRoute(topicCall('PATCH', id, '', key, body))),
	putNodes: (id: string, body: unknown, key?: string) =>
		reply(putNodesRoute(topicCall('PUT', id, '/nodes', key, body))),
	deleteNodes: (id: string, body: unknown, key?: string) =>
		reply(deleteNodesRoute(topicCall('DELETE', id, '/nodes', key, body))),
	move: (id: string, body: unknown, key?: string) =>
		reply(moveRoute(topicCall('POST', id, '/move', key, body))),
	events: (id: string, path?: string) =>
		reply(
			getEventsRoute(
				topicCall(
					'GET',
					id,
					`/events${path === undefined ? '' : `?path=${encodeURIComponent(path)}`}`
				)
			)
		),
	addNote: (id: string, body: unknown, key?: string) =>
		reply(postNoteRoute(topicCall('POST', id, '/notes', key, body))),
	patchNote: (noteId: string, body: unknown, key?: string) =>
		reply(
			patchNoteRoute(
				event({ method: 'PATCH', path: `/api/notes/${noteId}`, body, key, params: { noteId } })
			)
		),
	deleteNote: (noteId: string, key?: string) =>
		reply(
			deleteNoteRoute(
				event({ method: 'DELETE', path: `/api/notes/${noteId}`, key, params: { noteId } })
			)
		),
	send: (id: string, key?: string) => reply(sendRoute(topicCall('POST', id, '/send', key))),
	pull: (id: string, key?: string) => reply(pullRoute(topicCall('POST', id, '/pull', key))),
	resolve: (id: string, body: unknown, key?: string) =>
		reply(resolveRoute(topicCall('POST', id, '/resolve', key, body))),
	wait: (id: string, key?: string, query = '', signal?: AbortSignal) =>
		reply(
			waitRoute(event({ path: `/api/topics/${id}/wait${query}`, key, params: { id }, signal }))
		),
	stream: (id: string, opts: { since?: string; lastEventId?: string } = {}) =>
		streamRoute(
			event({
				path: `/api/topics/${id}/stream${opts.since === undefined ? '' : `?since=${opts.since}`}`,
				params: { id },
				headers: opts.lastEventId === undefined ? {} : { 'last-event-id': opts.lastEventId }
			})
		)
};

export interface Seeded {
	id: string;
	writeKey: string;
	noteKey: string;
}

export async function seedProject(name = 'spec'): Promise<Seeded> {
	const res = await api.createProject({ name });
	expect(res.status).toBe(201);
	return res.body as Seeded;
}

export async function seedTopic(
	project: Seeded,
	body: Body = {}
): Promise<{ topicId: string; topic: Body; nodes: Body[] }> {
	const res = await api.createTopic(project.id, { title: 'Spec topic', ...body }, project.writeKey);
	expect(res.status).toBe(201);
	return res.body as { topicId: string; topic: Body; nodes: Body[] };
}
