# beryl API contract

Every package builds against this file. When behaviour and this file disagree, this file wins until it is changed. Vocabulary is in `CONTEXT.md`; widget data shapes are in `docs/widgets.md`.

## Types

`apps/web/src/lib/types.ts` holds these types exactly; `packages/client/src/types.ts` mirrors them.

```ts
type NodeKind =
	'area' | 'decision' | 'assumption' | 'fact' | 'term' | 'fog' | 'constraint' | 'risk';
type NodeStatus = 'open' | 'settled' | 'parked' | 'dropped';
type EdgeRel = 'relies_on' | 'relates' | 'conflicts' | 'supersedes';
type TopicStatus = 'open' | 'closed';
type NoteIntent = 'answer' | 'accept' | 'correct' | 'comment' | 'explore' | 'defer' | 'drop';
type NoteStatus = 'queued' | 'delivered' | 'resolved';
type WidgetType =
	| 'markdown'
	| 'code'
	| 'schema'
	| 'migration'
	| 'files'
	| 'classes'
	| 'options'
	| 'sequence'
	| 'states'
	| 'api'
	| 'table';

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
	owned: boolean; // has an owner (a signed-in user); an anonymous Project has a Write key instead
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
	public: boolean; // always true in an anonymous Project
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

interface BerylEvent {
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

JSON in and out. Errors are `{ error: string }`. 🔑 needs the Project's Write key (`Authorization: Bearer <Write key>`) or, for an owned Project, its owner's login; ✎ needs `Authorization: Bearer <Session token>` or whatever 🔑 accepts, both of the Project that owns the target. See [Login](#login).

| Method    | Path                         | Body                                                                                      | Success                                                                                                                                                                                     |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/api/health`                | —                                                                                         | 200 `{ service: 'beryl', version, db: 'ok' }`; 503 `{ service, version, db: 'unavailable' }`                                                                                                |
| POST      | `/api/projects`              | `{ name? }`                                                                               | 201 `{ id, slug, name, owned, writeKey?, url }` (`writeKey` only when anonymous)                                                                                                            |
| GET       | `/api/projects/:id`          | —                                                                                         | 200 `{ project, topics: TopicSummary[] }` (updatedAt desc)                                                                                                                                  |
| PATCH 🔑  | `/api/projects/:id`          | `{ name }`                                                                                | 200 `{ project }`                                                                                                                                                                           |
| POST 🔑   | `/api/projects/:id/topics`   | `{ title, destination?, summary?, agent?, repo?, branch?, public?, nodes?: NodeInput[] }` | 201 `{ topicId, url, topic, nodes }`                                                                                                                                                        |
| POST 🔑   | `/api/projects/:id/pairings` | —                                                                                         | 201 `{ code, expiresAt }`                                                                                                                                                                   |
| POST      | `/api/pairings/redeem`       | `{ code }`                                                                                | 200 `{ token, projectId, expiresAt }`                                                                                                                                                       |
| POST      | `/api/session`               | — (header `Authorization: Bearer <Session token>`)                                        | 200 `{ expiresAt }`                                                                                                                                                                         |
| GET       | `/api/topics/:id`            | —                                                                                         | 200 `Snapshot`                                                                                                                                                                              |
| PATCH 🔑  | `/api/topics/:id`            | `{ title?, destination?, summary?, status?, current?, agent?, public? }`                  | 200 `{ topic }`                                                                                                                                                                             |
| PUT 🔑    | `/api/topics/:id/nodes`      | `{ nodes: NodeInput[] }`                                                                  | 200 `{ nodes }` (the written Nodes, in input order)                                                                                                                                         |
| DELETE 🔑 | `/api/topics/:id/nodes`      | `{ paths: string[] }`                                                                     | 200 `{ removed: string[] }`                                                                                                                                                                 |
| POST 🔑   | `/api/topics/:id/move`       | `{ from, to }`                                                                            | 200 `{ moved: { from, to }[] }`                                                                                                                                                             |
| GET       | `/api/topics/:id/events`     | query `path?`                                                                             | 200 `{ events: BerylEvent[] }` (seq asc; `path` filters to that Node)                                                                                                                       |
| GET       | `/api/topics/:id/stream`     | header `Last-Event-ID` or query `since`                                                   | 200 `text/event-stream`                                                                                                                                                                     |
| POST ✎    | `/api/topics/:id/notes`      | `{ anchor, intent, text?, author? }`                                                      | 201 `{ note }`                                                                                                                                                                              |
| PATCH ✎   | `/api/notes/:noteId`         | `{ intent?, text? }`                                                                      | 200 `{ note }`                                                                                                                                                                              |
| DELETE ✎  | `/api/notes/:noteId`         | —                                                                                         | 200 `{ removed: id }`                                                                                                                                                                       |
| POST ✎    | `/api/topics/:id/send`       | —                                                                                         | 200 `{ sent: number }`                                                                                                                                                                      |
| POST 🔑   | `/api/topics/:id/pull`       | —                                                                                         | 200 `Pulled`                                                                                                                                                                                |
| POST 🔑   | `/api/topics/:id/resolve`    | `{ notes: { id, reply?, changed? }[] }`                                                   | 200 `{ notes }`                                                                                                                                                                             |
| GET 🔑    | `/api/topics/:id/wait`       | query `timeoutMs?`                                                                        | 200 `{ sent: number }`                                                                                                                                                                      |
| GET       | `/api/auth/config`           | —                                                                                         | 200 `{ enabled: false }` or `{ enabled: true, config: { apiKey, authDomain, projectId, appId? } }`                                                                                          |
| POST      | `/api/auth/session`          | `{ idToken }`                                                                             | 200 `{ user }` and a `Set-Cookie` session cookie                                                                                                                                            |
| DELETE    | `/api/auth/session`          | —                                                                                         | 200 `{ ok: true, revoked }`, an expired cookie, and every Firebase refresh token of the user revoked (agents included); the cookie is expired even when revocation fails (`revoked: false`) |
| POST      | `/api/auth/device`           | `{ label? }`                                                                              | 201 `{ deviceCode, userCode, verificationUrl, expiresAt, interval }`                                                                                                                        |
| POST      | `/api/auth/device/approve`   | `{ userCode }` (cookie login)                                                             | 200 `{ label }`; 404 `unknown or expired code`; 429 when tried too often                                                                                                                    |
| POST      | `/api/auth/device/lookup`    | `{ userCode }` (cookie login)                                                             | 200 `{ label, ip, userAgent, startedSecondsAgo }` (all but `startedSecondsAgo` as reported by the requester); 404; 429                                                                      |
| POST      | `/api/auth/device/token`     | `{ deviceCode }`                                                                          | 202 `{ pending: true }`; 200 `{ uid, customToken, apiKey }` once; 410 `code expired`; 429 with `retry-after` when polled too fast                                                           |
| DELETE    | `/api/me/agents`             | — (cookie login or ID token bearer)                                                       | 200 `{ ok: true }`; revokes every Firebase refresh token of the user                                                                                                                        |
| GET       | `/api/me`                    | —                                                                                         | 200 `{ user: LoginUser \| null }`                                                                                                                                                           |

```ts
interface Pulled {
	notes: Note[]; // just delivered, createdAt order
	unresolved: Note[]; // delivered earlier, not yet resolved
	context: Record<string, { title: string; kind: NodeKind; status: NodeStatus }>; // each anchored Path
	stale: { path: string; title: string }[]; // Nodes with gistStale, depth asc
}
```

- `POST /api/projects`: with a login the Project is owned by that user and no Write key exists (`writeKey` absent); without one it is anonymous. `name` defaults to `'Untitled'`. `url` = `<origin>/p/<slug>`. The Write key is `bw_` followed by 43 base64url characters.
- `POST /api/projects/:id/topics`: `url` = `<origin>/p/<projectSlug>/t/<topicSlug>`. `nodes` are written as one batch after the Topic.
- `PATCH /api/topics/:id`: `current` must be `null` or the Path of an open Node (400). `status: 'closed'` sets `closedAt`; `'open'` clears it.
- **Slugs.** `/api` routes take ids only; the `/p/...` pages take an id or a slug. A Project's slug is unique across the server, a Topic's within its Project; the first to claim one keeps it and later claims take `-2`, `-3`, … Slugs derive from the name or title at creation and never change.
- `public` on a Topic: an owned Project's Topics are created private unless the body says `public: true`; an anonymous Project's are always public, and `public: false` is refused (400). `PATCH` flips it with the owner's login.
- **Login.** Sign-in is Firebase Auth (Google popup or email link) in the browser. The page POSTs the Firebase ID token to `/api/auth/session`, which must have been issued within five minutes, and the server exchanges it for a Firebase session cookie (Admin SDK `createSessionCookie`, five days): `runestone_session`, the same name in sagas, chronicle and beryl so one sign-in serves all, with `Domain=$AUTH_COOKIE_DOMAIN` when set (host-only otherwise), `HttpOnly`, `SameSite=Lax`, `Secure` when the public origin is https, path `/`. The ID token must come from a fresh sign-in that is not a custom-token (device) login. Every request verifies the cookie with the revocation check; a missing, forged, expired or revoked one is signed out, not an error, while a Firebase outage answers 503. An unsafe request that carries the cookie and no bearer must be same-origin (`Sec-Fetch-Site`, else `Origin`), or it is refused 403. 503 `sign-in is not configured` when the server has no service account; `/api/auth/config` then answers `{ enabled: false }`. The first verified request of a uid inserts this app's `users` row. `LoginUser` is `{ uid, email: string | null, name: string | null }`.
  - An owned Project answers to its owner's login and, if it still has one, its Write key on 🔑 and ✎ routes: 401 `sign in required` with no login and no bearer, 403 `invalid key` for another user or a wrong key (on a private Topic, 404 instead). A Project created owned never has a key; one an Admin assigned an owner keeps its key. A Write key on an owned Project cannot see or write private Topics, creates only public Topics (`public: true` required, else 403) and cannot flip a Topic private (403).
  - `POST /api/projects/:id/key` (owner's login only; 401/403 otherwise, 403 `project has no owner` when anonymous) rotates the Write key and returns `{ writeKey }` once, invalidating the old one; it also mints a key for an owned Project without one. `DELETE` clears it (204): no Write key then works. A Pairing code for it is minted with the login and redeems to a Session as for an anonymous Project; the Session carries Notes into public Topics only.
  - **Agent login (device code).** An agent has no browser, so it signs in through a person. It POSTs `/api/auth/device`, shows `verificationUrl` (which carries no code) and the `userCode` (like `BCDF-2345`, valid ten minutes), and polls `/api/auth/device/token` every `interval` seconds. A signed-in person opens the URL, types the code, sees the requester's address and age beside the unverified label, and approves, which binds the code to their uid. The next poll returns a Firebase custom token (Admin SDK `createCustomToken`) and the web `apiKey`, once. The agent trades the custom token at Firebase (`accounts:signInWithCustomToken`) for an ID token and refresh token, keeps the refresh token, and sends refreshed ID tokens as `Authorization: Bearer <ID token>`. beryl issues no credential of its own.
  - **ID token bearers.** A bearer that is not a Write key (`bw_`) or Session token (`bs_`) and has three dot-separated parts is verified as a Firebase ID token with revocation checked per request (401 `invalid login token` when bad, expired or revoked; never read as anonymous). Its uid acts as the owner on 🔑 and ✎ routes, on `POST /api/projects` (owned Project) and for reading private Topics. Cookie-only routes (`approve`, `lookup`) refuse it; a verifier outage answers 503, not 401. `DELETE /api/me/agents` (cookie or the agent's own token) disconnects every agent of the user at once; Firebase has no per-agent revocation.
  - **Visibility.** An anonymous Project and its Topics are readable by anyone. A private Topic (`public: false`) is readable (`GET /api/topics/:id`, `/events`, `/stream`, the board page) only by its owner's login; everyone else gets 404 `topic not found`, as if it did not exist. `GET /api/projects/:id` and the Project page list a private Topic only to the owner. A Session does not grant reading, and writes nothing into a private Topic. Every route on a private Topic, reads and writes alike, answers 404 to anyone but the owner's login. Flipping a Topic private, signing out and disconnecting agents close the open streams. Pages and REST responses are `Cache-Control: private` and `Vary: Cookie, Authorization`.
- **Pairing and Sessions.** A code is `bp_` and a token `bs_`, each followed by 43 base64url characters; only their sha256 is stored.
  - A code expires five minutes after it is minted and redeems once (403 `invalid or used code`, also for an unknown or expired code).
  - A token expires ten minutes after its last renewal. Every ✎ request made with it counts as an action and sets expiry to ten minutes from now.
  - `POST /api/session` renews without counting as an action: expiry becomes the sooner of ten minutes from now and thirty minutes after the last action.
  - A lapsed token answers 401 `session expired`. A renewal more than thirty minutes after the last action answers 401 `session idle`. Neither revives the token; the agent mints a new code.
  - A token is accepted only on ✎ routes of its own Project. It is refused (403 `invalid key`) on 🔑 routes and for another Project.
  - Lapsed Sessions and codes are deleted whenever a code is minted or redeemed, and hourly.
  - Renewal never shortens an expiry.
- `GET /api/topics/:id/wait`: `timeoutMs` defaults to 25 000, clamped to 1 000–60 000. Answers at once when any `queued` Note has `sentAt` set, with their count; otherwise on the next `send` event for the Topic, or `{ sent: 0 }` at the timeout.
- `TopicSummary.counts` and `queuedNotes` are computed from the Topic's Nodes and Notes on read.
- Every `POST`, `PUT`, `PATCH` and `DELETE` under `/api` draws from a token bucket per client address: `BERYL_WRITES_PER_WINDOW` (default 300) at once, refilled at that many per `BERYL_WRITE_WINDOW_MS` (default 300 000); `0` disables it. An empty bucket → 429 `{ error: 'too many writes from this address; retry later' }` with `Retry-After: <whole seconds>`. `GET /wait` is not a write.
- 401 `{ error: 'missing key' }` with no bearer token; 403 `{ error: 'invalid key' }` when it is not the key that route needs; 404 `{ error: 'project not found' | 'topic not found' | 'note not found' }`; 400 for malformed ids, paths or bodies.

## Stream

`GET /api/topics/:id/stream` (404 JSON for an unknown Topic). Headers: `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`.

- Replay: with `Last-Event-ID: N` or `?since=N`, first send every Topic event with `seq > N` in order, then live events. Without either, live only.
- Frame: `id: <seq>\nevent: <type>\ndata: <JSON payload>\n\n`.
- Opening: `: ok\n\n` as soon as the stream opens, before any replay.
- Heartbeat: `: ping\n\n` every `BERYL_HEARTBEAT_MS` (default 25 000).
- Idle: deadline = max(Topic `updatedAt`, stream open time) + `BERYL_IDLE_MS` (default 14 400 000); each published event resets it. At the deadline send `event: idle\ndata: {}\n\n` and close.
- Reset: when an admin import replaces the database, or deletes the Topic, send `event: reset\ndata: {}\n\n` and close. The board reloads.

## Storage

Postgres through drizzle, migrations in `apps/web/drizzle`, run at server start. Tables: `beryl_projects` (key hash, never keys; `owner_uid` is the Firebase uid of an owned Project, whose `write_key_hash` is NULL unless it was anonymous before an Admin assigned its owner), `beryl_topics` carries `public`; also `beryl_pairings`, `beryl_sessions` (hashes, never secrets), `beryl_nodes` (primary key `topic_id, path`; path columns `COLLATE "C"`: case-sensitive, byte-ordered), `beryl_notes`, `beryl_events` (bigserial `seq`). `edges`, `widgets`, `sources`, `agent`, `anchor` and `changed` are `json` columns (text kept as written, not `jsonb`).
