# beryl board contract

The web app in `apps/web`: pure helpers, the live store, routes and views. Types are from `apps/web/src/lib/types.ts` (as in `docs/api.md`); widget rendering is in `docs/widgets.md`.

## Helpers

Pure functions in `apps/web/src/lib/ui/topic.ts`. No DOM, no timers, no I/O.

```ts
export interface TopicState {
	project: Project;
	topic: Topic;
	nodes: Node[];
	notes: Note[];
	lastSeq: number;
}

export function applyEvent(state: TopicState, event: BerylEvent): TopicState;
export function nodeAt(nodes: Node[], path: string): Node | undefined;
export function childrenOf(nodes: Node[], parentPath: string | null): Node[];
export function descendantsOf(nodes: Node[], path: string): Node[];
export function ancestorsOf(path: string): string[];
export function isUnknown(node: Node): boolean;
export function countsOf(nodes: Node[], path?: string | null): Counts;
export function progressOf(nodes: Node[]): { settled: number; total: number };
export function frontier(nodes: Node[], current: string | null): Frontier;
export function questionList(nodes: Node[], current: string | null, include?: NodeKind[]): QuestionGroup[];
export type Lod = 'far' | 'mid' | 'near';
export const LOD_MID = 0.5;
export const LOD_NEAR = 1.0;
export function lodFor(zoom: number): Lod;
export function notesOn(notes: Note[], path: string | null, options?: { subtree?: boolean; nodes?: Node[] }): Note[];
export function marksOf(notes: Note[], path: string, widget: string): Record<string, number>;
export function pendingAnswer(notes: Note[], path: string): Note | undefined;
export function queuedCount(notes: Note[]): number;
export function freshSince(nodes: Node[], since: string | null): Set<string>;
export function defaultIntent(node: Node | null): NoteIntent;
export function incomingEdges(nodes: Node[], path: string): { from: string; edge: Edge }[];

export interface Frontier {
	current: Node | null;
	ready: Node[];
	leaning: { node: Node; waitingOn: string[] }[];
	assumptions: Node[];
	fog: Node[];
	risks: Node[];
}

export interface QuestionGroup {
	key: 'current' | 'ready' | 'leaning' | 'open' | 'parked' | 'settled' | 'dropped';
	label: string;
	nodes: Node[];
}
```

- **applyEvent** — returns a new state, never mutating its input. `seq <= lastSeq` → the same state reference. Otherwise `lastSeq = seq` and: `topic` replaces the Topic; `node` upserts by `path`; `node_removed` drops that path; `note` upserts by `id`; `note_removed` drops that id; `send` changes nothing else.
- **childrenOf** — `position` asc, then `path` asc. **descendantsOf** — the Node's descendants, not itself, by `depth`, `position`, `path`. **ancestorsOf** — `'a/b/c'` → `['a', 'a/b']`.
- **isUnknown** — open and of kind `decision`, `assumption`, `fog` or `risk`.
- **countsOf** — `Counts` (`docs/api.md`) over the Node at `path` and its descendants; the whole Topic when `path` is absent or null.
- **progressOf** — decisions that are settled, over decisions that are not dropped.
- **frontier** — `current` is the Node at `current` when it is open. `ready` and `leaning` split the other open decisions by Ready / Leaning, each ordered by `rank` asc with unranked after, then `depth`, `position`, `path`. `waitingOn` lists the `relies_on` targets that are missing or not settled, in edge order. `assumptions`, `fog` and `risks` are the open Nodes of that kind by `depth`, `position`, `path`.
- **questionList** — the Questions sidebar's groups, in this order, empty groups left out: `current` (Now asking), `ready` (Ready), `leaning` (Waiting), `open` (open Nodes of the extra kinds in `include`), `parked` (Parked), `settled` (Settled, most recent `statusSince` first), `dropped` (Dropped). Decisions always; `include` adds `assumption`, `fog` or `risk` Nodes in their open, parked, settled or dropped group.
- **lodFor** — `< LOD_MID` → `far`, `< LOD_NEAR` → `mid`, else `near`.
- **notesOn** — Notes whose `anchor.path` equals `path`; with `subtree`, also those on its descendants (needs `nodes`). `createdAt` order.
- **marksOf** — for Notes on that Node and Widget that are not resolved: Element key → count.
- **pendingAnswer** — the newest Note on that exact Node (no widget) with intent `answer`, `accept`, `defer` or `drop` that is not resolved: "answered on the board, waiting on the agent".
- **freshSince** — Paths whose `updatedAt` is after `since`; `null` → empty set.
- **defaultIntent** — open decision → `answer`; open assumption → `accept`; fog → `explore`; anything else or null → `comment`.
- **incomingEdges** — Edges from other Nodes whose `to` is `path`.

`apps/web/src/lib/ui/markdown.ts`: `renderMarkdown(text: string): string` with markdown-it, `html: false`, `linkify: true`; links get `target="_blank" rel="noopener noreferrer"`.

`apps/web/src/lib/fixtures/fold.ts`: `foldTurns(fixture: DemoFixture, upTo?: number): Snapshot` applies the fixture's turns with the write semantics of `docs/api.md` (ancestors, defaults, positions, stale gists, Current, notes and their statuses) without a server. Fixture shape in `apps/web/src/lib/fixtures/types.ts`.

## Live store

`apps/web/src/lib/ui/live.svelte.ts` holds a `TopicState` in `$state`, loaded from the SSR Snapshot, then follows `GET /api/topics/:id/stream?since=<lastSeq>` through `applyEvent`. On error it reconnects with backoff from the last `seq`. On `idle` it stops and shows "Paused — reload to follow". The `/demo` route uses the same views with a static state and no stream.

## Theme tokens

`src/routes/layout.css` defines these custom properties for light and dark (`prefers-color-scheme`, overridden by `:root[data-theme]`). Every component and widget colors itself from them; values may be tuned, names may not change.

`--bg --surface --surface-2 --ink --muted --line --accent --open --settled --parked --dropped --fog --added --removed --changed --font-sans --font-mono`

## Routes

- `/` — what beryl is, install in three lines, a link to `/demo`.
- `/p/[id]` — the Project: its Topics (`TopicSummary`) with progress, counts, status and last update.
- `/p/[id]/t/[topicId]` — the board.
- `/demo` — the board over `fixtures/demo-grill.json` folded by `foldTurns`, read-only with a banner; `?turn=N` shows the state after N turns, and a turn scrubber steps through them.
- `/demo/widgets` — every widget type from the fixture at `preview` and `full`.

## The board

**Header.** Topic title and status; the Destination on one line, expanding on click; progress (`progressOf`) as a bar; count chips for questions, assumptions, fog and risks; a Live indicator; view tabs Graph, Map, Outline, Frontier; Send with the queued count; Share (copies the Share link); theme toggle.

**Layout.** Four panels — Questions, Details, Notes, History — sit in three docks around the view: left, right and bottom. Each dock holds one or more groups; a group tabs its panels. Drag a tab onto another group's tab strip or centre to tab it, onto a group's leading or trailing edge to stack it beside, or onto a dock edge shown while dragging to dock it there. The `⋯` menu on a group moves its active panel to a dock by keyboard, collapses the dock to a rail, or resets the layout. Dock sizes and the dividers between groups are draggable splitters (arrow keys nudge, double-click resets a dock). The layout is one JSON value in localStorage `beryl:layout`; malformed or incomplete values fall back to the default (Questions left; Details and History tabbed over Notes on the right). Pure operations are in `apps/web/src/lib/ui/layout.ts`. Under 900px the layout is fixed: a Questions drawer and one bottom sheet tabbing Details, Notes and History.

**Questions sidebar.** The Questions panel (left by default), collapsible. It lists every Question the agent knows about, grouped by `questionList`: Now asking, Ready (with `#rank`), Waiting (with what each waits on), Parked, Settled (with the answer's first line), Dropped. Filter chips add assumptions, fog and risks; a search box filters by title and gist. Each row shows its status mark, title, its area (the depth-1 ancestor's title) and a badge for open notes or a pending answer. Clicking a row selects the Node and brings it into view in the active view:
- Graph: expands any collapsed ancestor, then pans and zooms to fit the Node at `near` LOD with a short animation.
- Map: zooms into the Node's parent cell and pulses the Node's cell.
- Outline: expands its ancestors and scrolls its row into view.
- Frontier: scrolls its card into view, or shows it in the Settled section.
The selected row stays highlighted and scrolls into view when selection changes elsewhere. `↑`/`↓` move through the list while it has focus; `Enter` jumps.

**Inspector.** The Details, Notes and History panels (right by default), for the selected Node: ancestors as a breadcrumb, kind and status, title, gist with a Stale gist marker, body (rendered markdown), recommendation, answer, sources (`url`, or `file:line`), outgoing and incoming Edges grouped by rel (each a link that selects that Node), widgets at `full` with Element selection, the Notes thread for this Node (anchors, status, replies) and the composer. A History tab lists the Node's events from `GET /api/topics/:id/events?path=`. On narrow screens it is a bottom sheet, and the sidebar a drawer.

**Composer.** Intent picker defaulting to `defaultIntent`; an anchor chip (Node, Widget or Element; removable back to the Node); text; author, remembered per browser; Add (or Ctrl/⌘+Enter). Queued Notes can be edited or deleted. Without a Note key the composer, quick actions and Send are replaced by a line saying the board is read-only and the private link comes from the terminal.

**Note key.** Read from `#nk=` on any `/p/[id]…` page, saved to localStorage `beryl:nk:<projectId>`, then stripped from the URL with `history.replaceState`.

**Send.** Disabled with no queued Notes or no Note key. Posts `/send` and confirms "Sent N notes to the agent". Notes also reach the agent on its next terminal turn without Send.

**Selection and view** live in the URL (`?view=graph&node=<path>`), so a link opens on the same Node.

**Fresh.** Nodes updated since this browser last looked at the Topic glow until selected; a chip "N changed since your last visit" lists them. The last visit is saved per Topic when the page is hidden or closed.

**Unknowns read loudest.** Open decisions carry the accent ring and a `?`; assumptions a dashed outline; fog a hazy, hatched fill; risks a warning mark. Settled Nodes are calm with a check, parked are grey, dropped are faded with a strikethrough. The Current Question is marked "Now asking" in every view.

### Graph

Svelte Flow canvas with pan, zoom, controls and a minimap. ELK lays out a compound graph: a Node with children is a container holding them; `relies_on` Edges guide layering; Edges render by rel — `relies_on` solid arrow, `relates` thin dotted, `conflicts` red, `supersedes` dashed with a hollow arrow; dangling Edges end in a small "missing" stub.

Layout runs on structural change only (Nodes added, removed or moved; a container collapsed or expanded). Content updates and zoom never move a box. LOD swaps what a box shows:
- `far`: depth-1 containers are opaque tiles with title, gist, counts and progress; their contents are hidden.
- `mid`: depth-2 content shows as cards with kind, status, title and a clipped gist; deeper containers are opaque tiles.
- `near`: everything expanded shows; cards add gist, the recommendation for Questions and the first widget's `preview`.

Cards show a badge for unresolved Notes and a "waiting on agent" mark from `pendingAnswer`. Click selects; double-click a container fits it; a toggle collapses or expands a container. Containers start expanded to depth 3.

### Map

A squarified treemap (d3-hierarchy) of the Node tree: each leaf weighs 1, a container the sum of its leaves. Cells color by status, fog hatched; labels appear as cells grow. Clicking a container cell zooms into it with a breadcrumb back out; clicking a leaf selects it. This is the view for seeing where the Unknowns cluster.

### Outline

A collapsible tree. Each row: kind mark, title, status, `#rank` on open Questions, counts on containers, note badge. Expanding a row shows its gist, body, recommendation or answer, and widgets at `full`. Keyboard: `↑`/`↓` move, `←`/`→` collapse and expand, `Enter` selects.

### Frontier

Answer ahead, in your order. Sections: Now asking, Ready (rank order), Waiting (with the unsettled Paths each relies on, as links), Assumptions to confirm, Fog to explore, Risks; Settled collapsed at the end, newest first. Each card shows title, gist and recommendation, with quick actions that create Notes: Accept recommendation, Answer… (inline text), Defer, Drop; on assumptions Confirm and Correct…; on fog Explore…. A card with a `pendingAnswer` shows that Note with edit and undo while it is queued.
