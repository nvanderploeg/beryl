# palantir client, CLI, MCP and hook contract

Builds on `docs/api.md`. Nothing here may throw into an agent's work: every failure becomes a warning, and the grill goes on without the board.

## `@palantir/client` (`packages/client/src/index.ts`)

```ts
export const DEFAULT_CANDIDATES = ['http://localhost:3270'];
export const UNREACHABLE_WARNING = 'palantir unreachable — continuing without the board';

export interface ClientOptions {
	env?: Record<string, string | undefined>; // default process.env
	configDir?: string; // default `${XDG_CONFIG_HOME ?? ~/.config}/palantir`, read from `env`
	fetch?: typeof fetch; // default globalThis.fetch
	candidates?: string[]; // default DEFAULT_CANDIDATES
	probeTimeoutMs?: number; // loopback hosts; default 300
	remoteProbeTimeoutMs?: number; // other hosts; default 2000
	requestTimeoutMs?: number; // default 5000
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>; // default timers/promises setTimeout
}

export type Result<T> = { ok: true; value: T } | { ok: false; warning: string };

export interface NodeInput {
	path: string;
	kind?: NodeKind;
	status?: NodeStatus;
	title?: string;
	gist?: string;
	body?: string;
	recommendation?: string;
	answer?: string;
	rank?: number | null;
	edges?: Edge[];
	widgets?: Widget[];
	sources?: Source[];
	position?: number;
}

export interface PalantirClient {
	discover(): Promise<string | null>;
	openTopic(input: {
		title?: string; // required unless topicId is given
		destination?: string;
		summary?: string;
		nodes?: NodeInput[];
		agent?: AgentInfo;
		repo?: string; // default: `owner/name` of the cwd's origin remote
		branch?: string; // default: the cwd's checked-out branch
		project?: string; // Project name on creation; renames the registered Project when it differs
		topicId?: string; // resume this Topic instead of creating one
		cwd?: string; // default process.cwd()
	}): Promise<
		Result<{
			topicId: string;
			url: string; // Share link
			noteUrl: string; // Private link: url + '#nk=' + Note key
			projectUrl: string;
			server: string;
			projectId: string;
			createdProject: boolean;
			resumed: boolean;
		}>
	>;
	getTopic(input: { topicId: string }): Promise<Result<{ snapshot: Snapshot; url: string; noteUrl: string }>>;
	putNodes(input: { topicId: string; nodes: NodeInput[] }): Promise<Result<{ nodes: Node[] }>>;
	removeNodes(input: { topicId: string; paths: string[] }): Promise<Result<{ removed: string[] }>>;
	moveNode(input: { topicId: string; from: string; to: string }): Promise<Result<{ moved: { from: string; to: string }[] }>>;
	updateTopic(input: {
		topicId: string;
		title?: string;
		destination?: string;
		summary?: string;
		status?: TopicStatus;
		current?: string | null;
		agent?: AgentInfo;
	}): Promise<Result<{ topic: Topic }>>;
	pullNotes(input: { topicId: string }): Promise<Result<Pulled>>;
	resolveNotes(input: {
		topicId: string;
		notes: { id: string; reply?: string; changed?: string[] }[];
	}): Promise<Result<{ notes: Note[] }>>;
	waitForSent(input: {
		topicId: string;
		timeoutMs?: number; // overall; default 43 200 000 (12 h); 0 = no limit
		pollMs?: number; // per request; default 25 000
		signal?: AbortSignal;
	}): Promise<Result<{ sent: number }>>; // sent 0 = the overall timeout passed or the signal aborted
	addNote(input: { topicId: string; anchor: Anchor; intent: NoteIntent; text?: string; author?: string }): Promise<Result<{ note: Note }>>;
	send(input: { topicId: string }): Promise<Result<{ sent: number }>>;
	topicUrl(input: { topicId: string; private?: boolean }): Promise<Result<{ url: string }>>;
	doctor(input?: { cwd?: string }): Promise<DoctorReport>;
}

export interface DoctorReport {
	configDir: string;
	pinned: string | null; // PALANTIR_URL, normalised
	probes: { server: string; ok: boolean; version?: string }[];
	server: string | null;
	repoKey: string;
	registered: { projectId: string; name: string } | null;
	registryError: string | null;
}

export function createClient(options?: ClientOptions): PalantirClient;
export function formatPulled(pulled: Pulled, topic: { id: string; title?: string }): string;
export function formatOutline(snapshot: Snapshot, options?: { path?: string; detail?: 'outline' | 'full' }): string;
export function repoIdentity(cwd: string): Promise<{ repoKey: string; name: string }>;
export function gitRefs(cwd: string): Promise<{ repo?: string; branch?: string }>;
```

Also export the types of `docs/api.md` exactly.

Behaviour:

- **discover** — as chronicle's: servers normalised (trim, strip trailing `/`). `PALANTIR_URL` set and non-empty → probe it alone. Otherwise the first healthy candidate. Healthy = `GET <server>/api/health` answers 2xx with JSON `service === 'palantir'` within the probe timeout for its host.
- **Registry** — `projects.json` = `{ [server]: { [repoKey]: { projectId, writeKey, noteKey, name, projectUrl } } }` and `topics.json` = `{ [topicId]: { server, projectId, projectUrl } }` in `configDir`. Read, lock and write them exactly as chronicle's client does (missing file reads `{}`; a damaged file is never overwritten and fails the call with `palantir failed: <path> is not a JSON object; fix or delete it`; atomic writes, dir 0700, files 0600).
- **openTopic** — with `topicId`: needs its `topics.json` handle (else `unknown topic <id> on this machine`), `GET /api/topics/:id` to confirm it exists, `resumed: true`, nothing created. Without: `title` required; `discover()` (`null` → `UNREACHABLE_WARNING`); find or create the Project for `(server, repoKey)` as chronicle's `startTask` does (name = `project`, else the repo name from `repoIdentity`; rename when `project` differs; a 401/403/404 on topic create → create a fresh Project, overwrite the entry, retry once). `POST /api/projects/:id/topics`; `repo` and `branch` default from `gitRefs(cwd)`; `agent.tool` defaults to `'claude-code'` when `env.CLAUDECODE === '1'`. Save the handle.
- **Topic-scoped calls** need the `topics.json` handle and use its server only, never Discovery. Write calls use the Project's Write key; `addNote` and `send` its Note key.
- **waitForSent** — loops `GET /api/topics/:id/wait?timeoutMs=<pollMs>`. `sent > 0` → return it. Network error, timeout or 5xx → sleep with backoff starting at 1 s, doubling to 30 s, reset after any good answer. A 4xx → return the warning. Stops with `{ sent: 0 }` at the overall timeout or when `signal` aborts.
- **Rate limit** — a 429 with `Retry-After` ≤ 5 s is waited out and the request sent once more; otherwise reported.
- **Failures** — network error, timeout or 5xx → `UNREACHABLE_WARNING`; other non-2xx → `palantir rejected the write: <error>`. Methods never throw.

### formatPulled

Plain text for the agent's context, ids included so it can resolve:

```
palantir: 2 new notes from the board on topic <id> (Payments retry design):
- [answer] storage/engine "Pick the database": MySQL, same as chronicle. (note 6f1c…)
- [comment] storage/schema "Tables" › tables › users.email: should be unique. (by Sam) (note 9a2e…)
Unresolved from earlier: 1b7d… [correct] auth/session.
Stale gists: storage, auth.
Fold each note into the model, then call resolve_notes with a one-line reply for each.
```

- Header: `palantir: <n> new note(s) …` when there are notes, else `palantir: no new notes on the board for topic <id>.`
- Where: `topic` for a null path; else `<path> "<title>"` from `context`, then ` › <widget>` and ` › <element>` when set.
- Empty text: `accept` → `accept the recommendation`, `defer` → `defer this`, `drop` → `drop this`.
- The `Unresolved` and `Stale gists` lines appear only when non-empty; the last line only when there are new notes. Full UUIDs, not shortened.

### formatOutline

The agent's own LOD read. `outline` (default): a header `Topic "<title>" (<status>)`, then `Destination: …` when set, then one line per Node, indented two spaces per depth below the given `path` (the whole Topic when absent):

```
storage [area/open]* Storage — Where the model and events live.
  storage/engine [decision/open] #1 Pick the database — MySQL or SQLite? ← now asking
```

`*` marks a Stale gist, `#<rank>` an open decision's rank, `← now asking` the Current. Last line: `Notes: <q> queued, <u> delivered and unresolved.` `full` adds under each Node its body, recommendation, answer, edges (`→ relies_on storage/engine`), sources and each widget as `widget <key> (<type>): <compact JSON>`.

## `palantir` CLI (`packages/cli`)

`src/run.ts` exports `run(argv, io)` like chronicle's; `src/index.ts` dispatches `hook` and `wait` (long-running) itself and everything else to `run`. Parse with `node:util` `parseArgs`.

```
palantir open <title> [--destination d] [--summary s] [--project name] [--repo owner/name] [--branch b]
              [--tool t] [--model m] [--effort e] [--file nodes.json] [--cwd dir]
palantir open --topic <id>                                   resume
    stdout: "<topicId> <url> <noteUrl>"
palantir get <topicId> [--path p] [--full] [--json]          formatOutline, or the Snapshot as JSON
palantir put <topicId> [--file nodes.json]                   NodeInput[] or { nodes } from the file or stdin
    stdout: "<n> nodes written"
palantir rm <topicId> <path>...                              stdout: removed paths, one per line
palantir mv <topicId> <from> <to>                            stdout: "<from> -> <to>" per moved path
palantir topic <topicId> [--title t] [--destination d] [--summary s] [--status open|closed]
              [--current path | --no-current]               stdout: "<topicId> <status>"
palantir pull <topicId>                                      stdout: formatPulled
palantir resolve <topicId> <noteId> [--reply text] [--changed path]...
palantir wait <topicId> [--timeout 12h]                      see Wait
palantir note <topicId> <intent> [text] [--path p] [--widget w] [--element e] [--author a]
palantir send <topicId>                                      stdout: "sent <n>"
palantir url <topicId> [--private]
palantir doctor
palantir hook
```

- A `Result` with `ok: false` → stderr `palantir: <warning>`, exit 0. Usage errors → usage on stderr, exit 2.
- Durations: `90s`, `30m`, `12h`, or `0` for no limit.

### Wait

`palantir wait <topicId>` is the listener the agent runs in the background (Claude Code: Bash with `run_in_background`), so a Send on the board wakes it.

1. A live listener for this Topic already running (`<configDir>/waits/<topicId>.json` holds `{ pid, startedAt }` and that pid answers `kill(pid, 0)`) → stdout `palantir: already listening for topic <id> (pid <pid>).`, exit 0.
2. Write the pid file; remove it on every exit path, if it is still ours.
3. `waitForSent`. On `sent > 0`: `pullNotes` (one retry), print `formatPulled`, then `Run palantir wait <id> in the background again once you have resolved them.`, exit 0. Pull failing twice → `palantir: notes were sent for topic <id> but could not be pulled; call pull_notes.`
4. Overall timeout → `palantir: stopped listening for topic <id> after <duration>. Run palantir wait <id> in the background to keep listening.`, exit 0.
5. SIGINT or SIGTERM → remove the pid file, exit 0 silently.

### Hook

`palantir hook` reads one Claude Code hook event on stdin and prints hook JSON or nothing; it always exits 0. `src/hook.ts` exports `handleHook(raw: string, deps: { dir: string; client: PalantirClient; isListening(topicId: string): boolean; timeoutMs?: number }): Promise<string>`. Per-session state lives in `<configDir>/sessions/<session_id>.json`: `{ topicId?, url?, closed: boolean }`, pruned after two weeks.

| Event | Does |
| --- | --- |
| `PostToolUse` of `mcp__palantir__open_topic` or `mcp__palantir__get_topic` | Records the `topicId` from the response (`"topicId":"…"`) or the input; `closed: false`. |
| `PostToolUse` of `mcp__palantir__update_topic` with `status` | `closed` follows it for that Topic. |
| `UserPromptSubmit`, Topic open | Pulls within `timeoutMs` (default 1500) and returns `formatPulled` as `additionalContext`. Without a live listener it adds: `palantir: no board listener is running. Before you end this turn, run \`palantir wait <id>\` in the background so Send on the board reaches you.` A failed pull returns `palantir: could not reach the board for topic <id>; call pull_notes before you answer.` |
| `SessionStart` with source `compact` or `resume`, Topic open | `palantir: this session grills topic <id> (<url>). Call get_topic before writing to it again.` |

Anything else, unparseable input, a missing `session_id` or any failure → no output.

## `palantir-mcp` (`packages/mcp`)

`src/server.ts` exports `createServer(client?: PalantirClient, open?: Opener): McpServer`, server name `palantir`; `src/index.ts` connects it over stdio.

| Tool | Input | Answer |
| --- | --- | --- |
| `open_topic` | `{ title?, destination?, summary?, nodes?, agent?, repo?, branch?, project?, topicId?, cwd? }` | JSON of the `openTopic` value |
| `get_topic` | `{ topicId, path?, detail?: 'outline' \| 'full' \| 'json' }` | `formatOutline`, or the Snapshot JSON for `json` |
| `put_nodes` | `{ topicId, nodes: NodeInput[] }` | JSON `{ written: { path, kind, status, gistStale }[] }` |
| `remove_nodes` | `{ topicId, paths }` | JSON `{ removed }` |
| `move_node` | `{ topicId, from, to }` | JSON `{ moved }` |
| `update_topic` | `{ topicId, title?, destination?, summary?, status?, current?, agent? }` | JSON `{ topic }` |
| `pull_notes` | `{ topicId }` | `formatPulled` |
| `resolve_notes` | `{ topicId, notes: { id, reply?, changed? }[] }` | JSON `{ resolved: id[] }` |

- Failures → one text item `palantir: <warning>`, never `isError`.
- `widgets[].data` is passed through unchecked; the server validates it.
- `open_topic` without `agent.tool` fills it from the MCP client's name (`claude` → `claude-code`, `codex` → `codex`).
- **Opener** — after an `open_topic` that returns `ok`, open its `noteUrl` once with `open`, `cmd /c start` or `xdg-open`, detached, output discarded; `PALANTIR_OPEN=0` disables it; failures are swallowed.
- Tool descriptions are one sentence an agent can act on. `open_topic`'s says to call it when a grill starts and to print the `noteUrl` to the user; `put_nodes`'s says widget shapes are in the palantir skill's `WIDGETS.md`.
