# speculum API contract

Every package builds against this file. When behaviour and this file disagree, this file wins until it is changed. Vocabulary is in `CONTEXT.md`; widget data shapes are in `docs/widgets.md`.

## Types

`apps/web/src/lib/types.ts` holds these types exactly; `packages/client/src/types.ts` mirrors them.

```ts
type NodeKind = 'area' | 'decision' | 'assumption' | 'fact' | 'term' | 'fog' | 'constraint' | 'risk';
type NodeStatus = 'open' | 'settled' | 'parked' | 'dropped';
type EdgeRel = 'relies_on' | 'relates' | 'conflicts' | 'supersedes';
type TopicStatus = 'open' | 'closed';
type NoteIntent = 'answer' | 'accept' | 'correct' | 'comment' | 'explore' | 'defer' | 'drop';
type NoteStatus = 'queued' | 'delivered' | 'resolved';
type WidgetType =
	| 'markdown' | 'code' | 'schema' | 'migration' | 'files' | 'classes'
	| 'options' | 'sequence' | 'states' | 'api' | 'table';

interface AgentInfo {
	tool?: string; // ≤ 64 chars
	model?: string; // ≤ 64 chars
	effort?: string; // ≤ 64 chars
}

interface Edge {
	rel: EdgeRel;
	to: string; // a Path in the same Topic; may be dangling
	label?: string; // ≤ 120 chars
}

interface Source {
	label?: string; // ≤ 200 chars
	url?: string; // http(s), ≤ 2048 chars
	file?: string; // repo-relative path, ≤ 512 chars
	line?: number; // positive integer, only with `file`
} // at least one of url, file

interface Widget {
	key: string; // /^[A-Za-z0-9._-]{1,64}$/, unique within the Node
	type: WidgetType;
	title?: string; // ≤ 120 chars
	data: unknown; // shape per `type`, docs/widgets.md
}

interface Project {
	id: string; // UUID v4
	name: string;
	createdAt: string; // ISO 8601 UTC
	lastWriteAt: string;
}

interface Topic {
	id: string; // UUID v4
	projectId: string;
	title: string; // ≤ 200 chars
	destination: string; // ≤ 1000 chars, '' when unset
	summary: string; // ≤ 2000 chars, '' when unset
	status: TopicStatus;
	current: string | null; // Path of the Question being asked now
	agent: AgentInfo | null;
	repo: string | null; // 'owner/name', ≤ 255 chars
	branch: string | null; // ≤ 255 chars
	createdAt: string;
	updatedAt: string;
	closedAt: string | null; // set while status is closed
}

interface Node {
	topicId: string;
	path: string; // segments /^[A-Za-z0-9._-]{1,64}$/, depth ≤ 8, total ≤ 512 chars
	parentPath: string | null; // null at depth 1
	key: string; // last path segment
	depth: number; // 1 at the top
	position: number; // order among siblings
	kind: NodeKind;
	status: NodeStatus;
	title: string; // ≤ 120 chars
	gist: string; // ≤ 400 chars, '' when unset
	body: string; // markdown, ≤ 20 000 chars, '' when unset
	recommendation: string; // ≤ 2000 chars, '' when unset
	answer: string; // ≤ 4000 chars, '' when unset
	rank: number | null; // non-negative integer; asking order of open Questions
	edges: Edge[]; // ≤ 50, outgoing
	widgets: Widget[]; // ≤ 12
	sources: Source[]; // ≤ 20
	gistStale: boolean;
	createdAt: string;
	updatedAt: string;
	statusSince: string; // last time `status` changed
}

interface Anchor {
	path: string | null; // null: the Topic as a whole
	widget?: string; // a Widget key on that Node
	element?: string; // an Element key in that Widget, ≤ 200 chars
}

interface Note {
	id: string; // UUID v4
	topicId: string;
	anchor: Anchor;
	intent: NoteIntent;
	text: string; // ≤ 4000 chars, '' allowed for accept, defer, drop
	author: string; // ≤ 64 chars, '' when unset
	status: NoteStatus;
	sentAt: string | null; // stamped by Send
	deliveredAt: string | null; // stamped by Pull
	resolvedAt: string | null;
	reply: string; // ≤ 2000 chars, '' when unset
	changed: string[]; // ≤ 50 Paths the agent changed resolving it
	createdAt: string;
	updatedAt: string;
}

interface TopicSummary extends Topic {
	counts: Counts;
	queuedNotes: number;
}

interface Counts {
	questions: number; // open decisions
	assumptions: number; // open assumptions
	fog: number; // open fog
	risks: number; // open risks
	settled: number; // settled Nodes, any kind but area
	total: number; // Nodes, any kind but area
}

interface Snapshot {
	project: Project;
	topic: Topic;
	nodes: Node[]; // ordered by depth, position, path
	notes: Note[]; // ordered by createdAt, id
	lastSeq: number; // highest event seq for this Topic, 0 if none
}

interface SpeculumEvent {
	seq: number;
	type: 'topic' | 'node' | 'node_removed' | 'note' | 'note_removed' | 'send';
	topicId: string;
	path: string | null; // the Node for node and node_removed events
	payload:
		| Topic // topic
		| Node // node
		| { path: string } // node_removed
		| Note // note
		| { id: string } // note_removed
		| { count: number; at: string }; // send
	at: string;
}
```

## Node writes

`NodeInput` is `{ path, kind?, status?, title?, gist?, body?, recommendation?, answer?, rank?, edges?, widgets?, sources?, position? }`, with `rank: null` allowed to clear it.

- **Create** when absent. `kind` is required on create (400 `kind is required to create <path>`). `title` defaults to `key`. `status` defaults to `settled` for `fact`, `term` and `constraint`, else `open`.
- **Missing ancestors** are created first as `kind: 'area'`, `status: 'open'`, `title` = key, each with its own event.
- **Update** when present: fields given replace; omitted fields are unchanged. `edges`, `widgets` and `sources` replace the whole array.
- `position` given → set; omitted on create → `1 + max(position)` among siblings (0 when first); omitted on update → unchanged.
- `statusSince` moves only when `status` changes.
- Each Widget's `data` is checked against its type in `docs/widgets.md`; a failure → 400 `widget <key> on <path>: <reason>`.
- **Stale gists.** After a batch, every ancestor of a Node that was created, removed or moved, or whose `kind`, `status`, `title`, `gist`, `recommendation` or `answer` changed, gets `gistStale: true`. Then every Node whose `title` or `gist` was given in the batch gets `gistStale: false`. A Node with no children is never stale.
- **Current.** When the Node at `topic.current` leaves `open` or is removed, `current` becomes `null` (one topic event).
- A Node write that changes nothing emits no event. Every write bumps the Topic's `updatedAt` and the Project's `lastWriteAt`, appends one event per changed row and publishes it.
- A batch is all-or-nothing: at most 100 `NodeInput`s, applied in order in one transaction. A Topic holds at most 2000 Nodes (400 past that).

**Remove** deletes each Path and its descendants, emitting `node_removed` per removed Node, deepest first. Notes keep their Anchor. Edges pointing at removed Paths stay, dangling.

**Move** re-paths the Node at `from` and its subtree to `to`. `to` must not exist and must not lie inside `from` (400). Missing ancestors of `to` are created as for writes. Every Edge in the Topic whose `to` is a moved Path, every Note Anchor on one, and `topic.current` follow the move. Events: `node_removed` for each old Path, `node` for each new Path and for each other Node whose Edges changed, `note` for each re-anchored Note, `topic` when `current` changed. Stale-gist marking applies to the ancestors of both `from` and `to`.

## Notes

- A Note's Anchor must name an existing Node when `path` is set (400 `no node <path>`). `widget` and `element` are not checked against the Widget's data.
- `text` must be non-empty for `answer`, `correct`, `comment` and `explore`.
- A Note is `queued` on create. Only a `queued` Note can be edited or deleted (409 `note already delivered`).
- **Send** stamps `sentAt` on every `queued` Note with `sentAt: null`, emits a `note` event for each, then one `send` event `{ count, at }`. With nothing to stamp it emits nothing and answers `{ sent: 0 }`.
- **Pull** moves every `queued` Note, sent or not, to `delivered` in `createdAt` order and emits a `note` event for each.
- **Resolve** sets `resolved`, `resolvedAt`, and the given `reply` and `changed`. It accepts a Note in any status; resolving a resolved Note replaces its `reply` and `changed`.

## HTTP

JSON in and out. Errors are `{ error: string }`. 🔑 needs `Authorization: Bearer <Write key>`; ✎ needs `Authorization: Bearer <Note key>`, both of the Project that owns the target.

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| GET | `/api/health` | — | 200 `{ service: 'speculum', version, db: 'ok' }`; 503 `{ service, version, db: 'unavailable' }` |
| POST | `/api/projects` | `{ name? }` | 201 `{ id, name, writeKey, noteKey, url }` |
| GET | `/api/projects/:id` | — | 200 `{ project, topics: TopicSummary[] }` (updatedAt desc) |
| PATCH 🔑 | `/api/projects/:id` | `{ name }` | 200 `{ project }` |
| POST 🔑 | `/api/projects/:id/topics` | `{ title, destination?, summary?, agent?, repo?, branch?, nodes?: NodeInput[] }` | 201 `{ topicId, url, topic, nodes }` |
| GET | `/api/topics/:id` | — | 200 `Snapshot` |
| PATCH 🔑 | `/api/topics/:id` | `{ title?, destination?, summary?, status?, current?, agent? }` | 200 `{ topic }` |
| PUT 🔑 | `/api/topics/:id/nodes` | `{ nodes: NodeInput[] }` | 200 `{ nodes }` (the written Nodes, in input order) |
| DELETE 🔑 | `/api/topics/:id/nodes` | `{ paths: string[] }` | 200 `{ removed: string[] }` |
| POST 🔑 | `/api/topics/:id/move` | `{ from, to }` | 200 `{ moved: { from, to }[] }` |
| GET | `/api/topics/:id/events` | query `path?` | 200 `{ events: SpeculumEvent[] }` (seq asc; `path` filters to that Node) |
| GET | `/api/topics/:id/stream` | header `Last-Event-ID` or query `since` | 200 `text/event-stream` |
| POST ✎ | `/api/topics/:id/notes` | `{ anchor, intent, text?, author? }` | 201 `{ note }` |
| PATCH ✎ | `/api/notes/:noteId` | `{ intent?, text? }` | 200 `{ note }` |
| DELETE ✎ | `/api/notes/:noteId` | — | 200 `{ removed: id }` |
| POST ✎ | `/api/topics/:id/send` | — | 200 `{ sent: number }` |
| POST 🔑 | `/api/topics/:id/pull` | — | 200 `Pulled` |
| POST 🔑 | `/api/topics/:id/resolve` | `{ notes: { id, reply?, changed? }[] }` | 200 `{ notes }` |
| GET 🔑 | `/api/topics/:id/wait` | query `timeoutMs?` | 200 `{ sent: number }` |

```ts
interface Pulled {
	notes: Note[]; // just delivered, createdAt order
	unresolved: Note[]; // delivered earlier, not yet resolved
	context: Record<string, { title: string; kind: NodeKind; status: NodeStatus }>; // each anchored Path
	stale: { path: string; title: string }[]; // Nodes with gistStale, depth asc
}
```

- `POST /api/projects`: `name` defaults to `'Untitled'`. `url` = `<origin>/p/<id>`. Keys are `sw_` and `sn_` followed by 43 base64url characters.
- `POST /api/projects/:id/topics`: `url` = `<origin>/p/<projectId>/t/<topicId>`. `nodes` are written as one batch after the Topic.
- `PATCH /api/topics/:id`: `current` must be `null` or the Path of an open Node (400). `status: 'closed'` sets `closedAt`; `'open'` clears it.
- `GET /api/topics/:id/wait`: `timeoutMs` defaults to 25 000, clamped to 1 000–60 000. Answers at once when any `queued` Note has `sentAt` set, with their count; otherwise on the next `send` event for the Topic, or `{ sent: 0 }` at the timeout.
- `TopicSummary.counts` and `queuedNotes` are computed from the Topic's Nodes and Notes on read.
- Every `POST`, `PUT`, `PATCH` and `DELETE` under `/api` draws from a token bucket per client address: `SPECULUM_WRITES_PER_WINDOW` (default 300) at once, refilled at that many per `SPECULUM_WRITE_WINDOW_MS` (default 300 000); `0` disables it. An empty bucket → 429 `{ error: 'too many writes from this address; retry later' }` with `Retry-After: <whole seconds>`. `GET /wait` is not a write.
- 401 `{ error: 'missing key' }` with no bearer token; 403 `{ error: 'invalid key' }` when it is not the key that route needs; 404 `{ error: 'project not found' | 'topic not found' | 'note not found' }`; 400 for malformed ids, paths or bodies.

## Stream

`GET /api/topics/:id/stream` (404 JSON for an unknown Topic). Headers: `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`.

- Replay: with `Last-Event-ID: N` or `?since=N`, first send every Topic event with `seq > N` in order, then live events. Without either, live only.
- Frame: `id: <seq>\nevent: <type>\ndata: <JSON payload>\n\n`.
- Opening: `: ok\n\n` as soon as the stream opens, before any replay.
- Heartbeat: `: ping\n\n` every `SPECULUM_HEARTBEAT_MS` (default 25 000).
- Idle: deadline = max(Topic `updatedAt`, stream open time) + `SPECULUM_IDLE_MS` (default 14 400 000); each published event resets it. At the deadline send `event: idle\ndata: {}\n\n` and close.

## Storage

MySQL through drizzle, migrations in `apps/web/drizzle`, run at server start. Tables: `projects` (key hashes, never keys), `topics`, `nodes` (primary key `topic_id, path`; path columns ascii, case-sensitive), `notes`, `events` (serial `seq`). `edges`, `widgets`, `sources`, `agent`, `anchor` and `changed` are JSON columns.
