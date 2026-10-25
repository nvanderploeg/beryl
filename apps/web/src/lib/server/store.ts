import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, max, ne } from 'drizzle-orm';
import { ApiError } from '#lib/server/api.ts';
import { publish } from '#lib/server/bus.ts';
import { db } from '#lib/server/db/index.ts';
import { events, nodes, notes, projects, topics } from '#lib/server/db/schema.ts';
import {
	checkNoteText,
	type NoteInput,
	type ResolveInput,
	type TopicCreate,
	type TopicPatch
} from '#lib/server/parse.ts';
import {
	toEvent,
	toNode,
	toNote,
	toProject,
	toTopic,
	type NodeRow,
	type NoteRow,
	type ProjectRow,
	type TopicRow
} from '#lib/server/serialize.ts';
import { sameJson, Tree, type TreeResult } from '#lib/server/tree.ts';
import type {
	Anchor,
	Counts,
	Node,
	NodeInput,
	Note,
	NoteIntent,
	BerylEvent,
	Project,
	Pulled,
	Snapshot,
	Topic,
	TopicSummary
} from '#lib/types.ts';

export type { NodeRow, NoteRow, ProjectRow, TopicRow };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getProjectRow(id: string): Promise<ProjectRow | undefined> {
	const [row] = await db.select().from(projects).where(eq(projects.id, id));
	return row;
}

export async function getTopicRow(id: string): Promise<TopicRow | undefined> {
	const [row] = await db.select().from(topics).where(eq(topics.id, id));
	return row;
}

export async function getNoteRow(id: string): Promise<NoteRow | undefined> {
	const [row] = await db.select().from(notes).where(eq(notes.id, id));
	return row;
}

export async function insertProject(row: typeof projects.$inferInsert): Promise<void> {
	await db.insert(projects).values(row);
}

export async function renameProject(id: string, name: string): Promise<Project> {
	const now = new Date();
	await db.update(projects).set({ name, lastWriteAt: now }).where(eq(projects.id, id));
	const row = await getProjectRow(id);
	if (!row) throw new ApiError(404, 'project not found');
	return toProject(row);
}

function emptyCounts(): Counts {
	return { questions: 0, assumptions: 0, fog: 0, risks: 0, settled: 0, total: 0 };
}

const OPEN_COUNTS: Record<string, keyof Counts> = {
	decision: 'questions',
	assumption: 'assumptions',
	fog: 'fog',
	risk: 'risks'
};

export async function getProjectPage(
	projectId: string
): Promise<{ project: Project; topics: TopicSummary[] } | undefined> {
	const project = await getProjectRow(projectId);
	if (!project) return undefined;
	const topicRows = await db
		.select()
		.from(topics)
		.where(eq(topics.projectId, projectId))
		.orderBy(desc(topics.updatedAt), asc(topics.id));
	const ids = topicRows.map((row) => row.id);
	const counts = new Map(ids.map((id) => [id, emptyCounts()]));
	const queued = new Map<string, number>();
	if (ids.length) {
		const nodeCounts = await db
			.select({ topicId: nodes.topicId, kind: nodes.kind, status: nodes.status, n: count() })
			.from(nodes)
			.where(and(inArray(nodes.topicId, ids), ne(nodes.kind, 'area')))
			.groupBy(nodes.topicId, nodes.kind, nodes.status);
		for (const { topicId, kind, status, n } of nodeCounts) {
			const tally = counts.get(topicId)!;
			tally.total += n;
			if (status === 'settled') tally.settled += n;
			if (status === 'open' && OPEN_COUNTS[kind]) tally[OPEN_COUNTS[kind]] += n;
		}
		const noteCounts = await db
			.select({ topicId: notes.topicId, n: count() })
			.from(notes)
			.where(and(inArray(notes.topicId, ids), eq(notes.status, 'queued')))
			.groupBy(notes.topicId);
		for (const { topicId, n } of noteCounts) queued.set(topicId, n);
	}
	return {
		project: toProject(project),
		topics: topicRows.map((row) => ({
			...toTopic(row),
			counts: counts.get(row.id)!,
			queuedNotes: queued.get(row.id) ?? 0
		}))
	};
}

async function lastSeqOf(topicId: string): Promise<number> {
	const [row] = await db
		.select({ seq: max(events.seq) })
		.from(events)
		.where(eq(events.topicId, topicId));
	return Number(row?.seq ?? 0);
}

export async function getSnapshot(topicId: string): Promise<Snapshot | undefined> {
	// lastSeq is read before the rows so replaying from it can only repeat events, never skip one.
	const lastSeq = await lastSeqOf(topicId);
	const topic = await getTopicRow(topicId);
	if (!topic) return undefined;
	const project = await getProjectRow(topic.projectId);
	if (!project) return undefined;
	const nodeRows = await db
		.select()
		.from(nodes)
		.where(eq(nodes.topicId, topicId))
		.orderBy(asc(nodes.depth), asc(nodes.position), asc(nodes.path));
	const noteRows = await db
		.select()
		.from(notes)
		.where(eq(notes.topicId, topicId))
		.orderBy(asc(notes.createdAt), asc(notes.id));
	return {
		project: toProject(project),
		topic: toTopic(topic),
		nodes: nodeRows.map(toNode),
		notes: noteRows.map(toNote),
		lastSeq
	};
}

export async function eventsSince(topicId: string, seq: number): Promise<BerylEvent[]> {
	const rows = await db
		.select()
		.from(events)
		.where(and(eq(events.topicId, topicId), gt(events.seq, seq)))
		.orderBy(asc(events.seq));
	return rows.map(toEvent);
}

export async function topicEvents(topicId: string, path?: string): Promise<BerylEvent[]> {
	const rows = await db
		.select()
		.from(events)
		.where(and(eq(events.topicId, topicId), path === undefined ? undefined : eq(events.path, path)))
		.orderBy(asc(events.seq));
	return rows.map(toEvent);
}

export async function sentQueuedCount(topicId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(notes)
		.where(and(eq(notes.topicId, topicId), eq(notes.status, 'queued'), isNotNull(notes.sentAt)));
	return row?.n ?? 0;
}

interface Ctx {
	tx: Tx;
	now: Date;
	topic: TopicRow;
	emit(
		type: BerylEvent['type'],
		path: string | null,
		payload: BerylEvent['payload']
	): Promise<void>;
}

const chains = new Map<string, Promise<void>>();

// Serialises writes per Topic so its events publish in seq order.
async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
	const run = (chains.get(key) ?? Promise.resolve()).then(work);
	const tail = run.then(
		() => undefined,
		() => undefined
	);
	chains.set(key, tail);
	try {
		return await run;
	} finally {
		if (chains.get(key) === tail) chains.delete(key);
	}
}

async function mutate<T>(
	topicId: string,
	work: (ctx: Ctx) => Promise<T>,
	create?: TopicRow
): Promise<T> {
	return exclusive(topicId, async () => {
		const stored: BerylEvent[] = [];
		const value = await db.transaction(async (tx) => {
			const now = create?.createdAt ?? new Date();
			let topic: TopicRow | undefined = create;
			if (create) {
				// Lock the Project first: the insert's foreign-key check would otherwise share-lock it and
				// deadlock with a sibling Topic's write bumping lastWriteAt.
				await tx
					.select({ id: projects.id })
					.from(projects)
					.where(eq(projects.id, create.projectId))
					.for('update');
				await tx.insert(topics).values(create);
			} else {
				[topic] = await tx.select().from(topics).where(eq(topics.id, topicId)).for('update');
			}
			if (!topic) throw new ApiError(404, 'topic not found');
			const ctx: Ctx = {
				tx,
				now,
				topic,
				async emit(type, path, payload) {
					const [result] = await tx
						.insert(events)
						.values({ topicId, path, type, payload, at: now });
					stored.push({
						seq: Number(result.insertId),
						type,
						topicId,
						path,
						payload,
						at: now.toISOString()
					});
				}
			};
			const result = await work(ctx);
			if (stored.length) {
				await tx.update(topics).set({ updatedAt: now }).where(eq(topics.id, topicId));
				await tx
					.update(projects)
					.set({ lastWriteAt: now })
					.where(eq(projects.id, ctx.topic.projectId));
			}
			return result;
		});
		for (const event of stored) publish(topicId, event);
		return value;
	});
}

async function saveTopic(ctx: Ctx, patch: Partial<TopicRow>): Promise<void> {
	ctx.topic = { ...ctx.topic, ...patch, updatedAt: ctx.now };
	await ctx.tx
		.update(topics)
		.set({ ...patch, updatedAt: ctx.now })
		.where(eq(topics.id, ctx.topic.id));
	await ctx.emit('topic', null, toTopic(ctx.topic));
}

async function loadTree(ctx: Ctx): Promise<Tree> {
	const rows = await ctx.tx.select().from(nodes).where(eq(nodes.topicId, ctx.topic.id));
	return new Tree(ctx.topic.id, rows, ctx.topic.current, ctx.now);
}

function updatable(row: NodeRow) {
	return {
		position: row.position,
		kind: row.kind,
		status: row.status,
		title: row.title,
		gist: row.gist,
		body: row.body,
		recommendation: row.recommendation,
		answer: row.answer,
		rank: row.rank,
		edges: row.edges,
		widgets: row.widgets,
		sources: row.sources,
		gistStale: row.gistStale,
		updatedAt: row.updatedAt,
		statusSince: row.statusSince
	};
}

async function writeNodes(ctx: Ctx, result: TreeResult): Promise<void> {
	const topicId = ctx.topic.id;
	if (result.removed.length) {
		await ctx.tx
			.delete(nodes)
			.where(and(eq(nodes.topicId, topicId), inArray(nodes.path, result.removed)));
	}
	for (const path of result.removed) await ctx.emit('node_removed', path, { path });
	for (const { row, isNew } of result.changes) {
		if (isNew) {
			await ctx.tx.insert(nodes).values(row);
		} else {
			await ctx.tx
				.update(nodes)
				.set(updatable(row))
				.where(and(eq(nodes.topicId, topicId), eq(nodes.path, row.path)));
		}
		await ctx.emit('node', row.path, toNode(row));
	}
}

async function writeCurrent(ctx: Ctx, result: TreeResult): Promise<void> {
	if (result.currentChanged) await saveTopic(ctx, { current: result.current });
}

function written(tree: Tree, inputs: NodeInput[]): Node[] {
	return inputs.map((input) => toNode(tree.rows.get(input.path)!));
}

export async function createTopic(
	projectId: string,
	input: TopicCreate
): Promise<{ topic: Topic; nodes: Node[] }> {
	const now = new Date();
	const row: TopicRow = {
		id: randomUUID(),
		projectId,
		title: input.title,
		destination: input.destination,
		summary: input.summary,
		status: 'open',
		current: null,
		agent: input.agent,
		repo: input.repo,
		branch: input.branch,
		createdAt: now,
		updatedAt: now,
		closedAt: null
	};
	return mutate(
		row.id,
		async (ctx) => {
			await ctx.emit('topic', null, toTopic(row));
			const tree = new Tree(row.id, [], null, now);
			for (const node of input.nodes) tree.put(node);
			await writeNodes(ctx, tree.finish());
			return { topic: toTopic(ctx.topic), nodes: written(tree, input.nodes) };
		},
		row
	);
}

export async function patchTopic(topicId: string, patch: TopicPatch): Promise<Topic> {
	return mutate(topicId, async (ctx) => {
		const old = ctx.topic;
		if (patch.current !== undefined && patch.current !== null) {
			const [node] = await ctx.tx
				.select({ status: nodes.status })
				.from(nodes)
				.where(and(eq(nodes.topicId, topicId), eq(nodes.path, patch.current)));
			if (node?.status !== 'open') {
				throw new ApiError(400, 'current must be null or the path of an open node');
			}
		}
		const next = {
			title: patch.title ?? old.title,
			destination: patch.destination ?? old.destination,
			summary: patch.summary ?? old.summary,
			status: patch.status ?? old.status,
			current: patch.current === undefined ? old.current : patch.current,
			agent: patch.agent === undefined ? old.agent : patch.agent
		};
		const statusChanged = next.status !== old.status;
		const changed =
			statusChanged ||
			next.title !== old.title ||
			next.destination !== old.destination ||
			next.summary !== old.summary ||
			next.current !== old.current ||
			!sameJson(next.agent, old.agent);
		if (!changed) return toTopic(old);
		await saveTopic(ctx, {
			...next,
			closedAt: statusChanged ? (next.status === 'closed' ? ctx.now : null) : old.closedAt
		});
		return toTopic(ctx.topic);
	});
}

export async function putNodes(topicId: string, inputs: NodeInput[]): Promise<Node[]> {
	return mutate(topicId, async (ctx) => {
		const tree = await loadTree(ctx);
		for (const input of inputs) tree.put(input);
		const result = tree.finish();
		await writeNodes(ctx, result);
		await writeCurrent(ctx, result);
		return written(tree, inputs);
	});
}

export async function removeNodes(topicId: string, paths: string[]): Promise<string[]> {
	return mutate(topicId, async (ctx) => {
		const tree = await loadTree(ctx);
		for (const path of paths) tree.remove(path);
		const result = tree.finish();
		await writeNodes(ctx, result);
		await writeCurrent(ctx, result);
		return result.removed;
	});
}

export async function moveNode(
	topicId: string,
	from: string,
	to: string
): Promise<{ from: string; to: string }[]> {
	return mutate(topicId, async (ctx) => {
		const tree = await loadTree(ctx);
		const { mapping, moved } = tree.move(from, to);
		const result = tree.finish();
		await writeNodes(ctx, result);
		const noteRows = await ctx.tx
			.select()
			.from(notes)
			.where(eq(notes.topicId, topicId))
			.orderBy(asc(notes.createdAt), asc(notes.id));
		for (const row of noteRows) {
			const anchor = row.anchor as Anchor;
			const path = anchor.path === null ? undefined : mapping.get(anchor.path);
			if (path === undefined) continue;
			const next: NoteRow = { ...row, anchor: { ...anchor, path }, updatedAt: ctx.now };
			await ctx.tx
				.update(notes)
				.set({ anchor: next.anchor, updatedAt: ctx.now })
				.where(eq(notes.id, row.id));
			await ctx.emit('note', null, toNote(next));
		}
		await writeCurrent(ctx, result);
		return moved;
	});
}

export async function createNote(topicId: string, input: NoteInput): Promise<Note> {
	return mutate(topicId, async (ctx) => {
		const path = input.anchor.path;
		if (path !== null) {
			const [node] = await ctx.tx
				.select({ path: nodes.path })
				.from(nodes)
				.where(and(eq(nodes.topicId, topicId), eq(nodes.path, path)));
			if (!node) throw new ApiError(400, `no node ${path}`);
		}
		const row: NoteRow = {
			id: randomUUID(),
			topicId,
			anchor: input.anchor,
			intent: input.intent,
			text: input.text,
			author: input.author,
			status: 'queued',
			sentAt: null,
			deliveredAt: null,
			resolvedAt: null,
			reply: '',
			changed: [],
			createdAt: ctx.now,
			updatedAt: ctx.now
		};
		await ctx.tx.insert(notes).values(row);
		const note = toNote(row);
		await ctx.emit('note', null, note);
		return note;
	});
}

async function queuedNote(ctx: Ctx, noteId: string): Promise<NoteRow> {
	const [row] = await ctx.tx
		.select()
		.from(notes)
		.where(and(eq(notes.id, noteId), eq(notes.topicId, ctx.topic.id)));
	if (!row) throw new ApiError(404, 'note not found');
	if (row.status !== 'queued') throw new ApiError(409, 'note already delivered');
	return row;
}

export async function patchNote(
	topicId: string,
	noteId: string,
	patch: { intent?: NoteIntent; text?: string }
): Promise<Note> {
	return mutate(topicId, async (ctx) => {
		const old = await queuedNote(ctx, noteId);
		const intent = patch.intent ?? (old.intent as NoteIntent);
		const text = patch.text ?? old.text;
		checkNoteText(intent, text);
		if (intent === old.intent && text === old.text) return toNote(old);
		const row: NoteRow = { ...old, intent, text, updatedAt: ctx.now };
		await ctx.tx
			.update(notes)
			.set({ intent, text, updatedAt: ctx.now })
			.where(eq(notes.id, noteId));
		const note = toNote(row);
		await ctx.emit('note', null, note);
		return note;
	});
}

export async function deleteNote(topicId: string, noteId: string): Promise<string> {
	return mutate(topicId, async (ctx) => {
		await queuedNote(ctx, noteId);
		await ctx.tx.delete(notes).where(eq(notes.id, noteId));
		await ctx.emit('note_removed', null, { id: noteId });
		return noteId;
	});
}

export async function sendNotes(topicId: string): Promise<number> {
	return mutate(topicId, async (ctx) => {
		const rows = await ctx.tx
			.select()
			.from(notes)
			.where(and(eq(notes.topicId, topicId), eq(notes.status, 'queued'), isNull(notes.sentAt)))
			.orderBy(asc(notes.createdAt), asc(notes.id));
		if (!rows.length) return 0;
		await ctx.tx
			.update(notes)
			.set({ sentAt: ctx.now, updatedAt: ctx.now })
			.where(
				inArray(
					notes.id,
					rows.map((row) => row.id)
				)
			);
		for (const row of rows) {
			await ctx.emit('note', null, toNote({ ...row, sentAt: ctx.now, updatedAt: ctx.now }));
		}
		await ctx.emit('send', null, { count: rows.length, at: ctx.now.toISOString() });
		return rows.length;
	});
}

export async function pullNotes(topicId: string): Promise<Pulled> {
	return mutate(topicId, async (ctx) => {
		const all = await ctx.tx
			.select()
			.from(notes)
			.where(and(eq(notes.topicId, topicId), ne(notes.status, 'resolved')))
			.orderBy(asc(notes.createdAt), asc(notes.id));
		const queued = all.filter((row) => row.status === 'queued');
		const delivered = queued.map((row) => ({
			...row,
			status: 'delivered',
			deliveredAt: ctx.now,
			updatedAt: ctx.now
		}));
		if (delivered.length) {
			await ctx.tx
				.update(notes)
				.set({ status: 'delivered', deliveredAt: ctx.now, updatedAt: ctx.now })
				.where(
					inArray(
						notes.id,
						delivered.map((row) => row.id)
					)
				);
		}
		for (const row of delivered) await ctx.emit('note', null, toNote(row));
		const unresolved = all.filter((row) => row.status === 'delivered');
		const anchored = [...delivered, ...unresolved]
			.map((row) => (row.anchor as Anchor).path)
			.filter((path): path is string => path !== null);
		const context: Pulled['context'] = {};
		if (anchored.length) {
			const rows = await ctx.tx
				.select({ path: nodes.path, title: nodes.title, kind: nodes.kind, status: nodes.status })
				.from(nodes)
				.where(and(eq(nodes.topicId, topicId), inArray(nodes.path, [...new Set(anchored)])));
			for (const row of rows) {
				context[row.path] = {
					title: row.title,
					kind: row.kind as Node['kind'],
					status: row.status as Node['status']
				};
			}
		}
		const stale = await ctx.tx
			.select({ path: nodes.path, title: nodes.title })
			.from(nodes)
			.where(and(eq(nodes.topicId, topicId), eq(nodes.gistStale, true)))
			.orderBy(asc(nodes.depth), asc(nodes.position), asc(nodes.path));
		return {
			notes: delivered.map(toNote),
			unresolved: unresolved.map(toNote),
			context,
			stale
		};
	});
}

export async function resolveNotes(topicId: string, items: ResolveInput[]): Promise<Note[]> {
	return mutate(topicId, async (ctx) => {
		const ids = [...new Set(items.map((item) => item.id))];
		const rows = ids.length
			? await ctx.tx
					.select()
					.from(notes)
					.where(and(eq(notes.topicId, topicId), inArray(notes.id, ids)))
			: [];
		const original = new Map(rows.map((row) => [row.id, row]));
		const current = new Map(original);
		for (const item of items) {
			const row = current.get(item.id);
			if (!row) throw new ApiError(404, 'note not found');
			current.set(item.id, {
				...row,
				status: 'resolved',
				resolvedAt: row.status === 'resolved' ? row.resolvedAt : ctx.now,
				reply: item.reply,
				changed: item.changed
			});
		}
		for (const id of ids) {
			const before = original.get(id)!;
			const after = current.get(id)!;
			if (
				after.status === before.status &&
				after.reply === before.reply &&
				sameJson(after.changed, before.changed)
			) {
				continue;
			}
			const row = { ...after, updatedAt: ctx.now };
			current.set(id, row);
			await ctx.tx
				.update(notes)
				.set({
					status: row.status,
					resolvedAt: row.resolvedAt,
					reply: row.reply,
					changed: row.changed,
					updatedAt: ctx.now
				})
				.where(eq(notes.id, id));
			await ctx.emit('note', null, toNote(row));
		}
		return items.map((item) => toNote(current.get(item.id)!));
	});
}
