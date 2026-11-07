# beryl

A live, zoomable view of a grilling agent's model of a design. The agent writes what it understands as a tree of Nodes; people browse it, answer ahead in their own order, and leave Notes that flow back into the agent's next turn. Terms below are binding vocabulary; the contracts are `docs/api.md` (types, HTTP, stream), `docs/widgets.md` (widget data), `docs/client.md` (client, CLI, MCP, hook) and `docs/ui.md` (board helpers and views). Where this file and a contract disagree, the contract wins.

## Language

**Project**:
One repo's beryl space: its Topics and a Write key. Its UUID is also its URL (`/p/<id>`).

**Owner**:
The signed-in user (a Firebase uid) a Project belongs to. An owned Project has no Write key and no anonymous reach: its Owner writes with their login, and mints Pairing codes with it. A Project with no Owner is anonymous.

**Login**:
A browser's proof of who is signed in: the Firebase session cookie `runestone_session`, shared with sagas and chronicle and verified on every request.

**Device login**:
How an agent signs in: it shows a code, a signed-in person approves it, and the agent trades the Firebase custom token it gets for ID tokens it sends as its bearer. The bearer stands for the person's uid.

**Public**:
A Topic flag. A private Topic of an owned Project is readable only by its Owner's login; anonymous Projects' Topics are always public.

**Write key**:
The secret that writes the model of an anonymous Project. Returned once at Project creation, kept on the agent's machine; the server stores only its sha256.

**Pairing code**:
A single-use secret the agent mints with the Write key. It travels in the Private link's URL fragment and is redeemed for a Session within five minutes.

**Session**:
A browser's bearer for writing Notes, issued for a redeemed Pairing code. It lapses ten minutes after its last renewal; a visible tab renews it, but never more than thirty minutes after the person's last action. A lapsed Session leaves the board locked, read-only, until the agent mints a new Private link.

**Share link**:
A Topic URL without the Note key: read-only.

**Private link**:
A Topic URL with `#pc=<Pairing code>`: lets the browser that redeems it add Notes and press Send. Opened for the user by the agent; not for sharing, because Notes enter the agent's context.

**Slug**:
The friendly address of a Project (unique on the server) or a Topic (unique within its Project), derived from its name or title at creation, fixed afterwards. First to claim wins; later claims get `-2`, `-3`. Resolves to the same row as its id.

**Topic**:
One subject being grilled, with its own page. Holds the Destination, the Nodes and the Notes. Open until the grill concludes, then closed.

**Destination**:
What the grill is finding its way to: the spec, decision or change that marks shared understanding. One or two lines on the Topic.

**Node**:
One piece of the agent's model, addressed by Path within a Topic. Created on first write, with any missing ancestors as Areas.

**Path**:
Agent-chosen keys joined by `/` that address a Node (`storage`, `storage/engine`). The tree it forms is containment, which drives LOD.

**Kind**:
What a Node is: `area` (a grouping), `decision`, `assumption`, `fact`, `term`, `fog`, `constraint` or `risk`. Rendering and the Frontier key off Kind.

**Status**:
Where a Node stands: `open`, `settled`, `parked` (deliberately deferred) or `dropped` (out of scope, rejected or superseded).

**Question**:
An open decision. Carries the agent's Recommendation and, once settled, the Answer.

**Recommendation**:
The answer the agent would pick for a Question, with its reason.

**Fog**:
A Node of kind `fog`: an area the agent can tell matters but cannot yet phrase as a Question. It graduates into Questions as the grill advances.

**Unknown**:
Any Node that is open and of kind `decision`, `assumption`, `fog` or `risk`. The board marks Unknowns loudly.

**Edge**:
A relation from one Node to another by Path: `relies_on`, `relates`, `conflicts` or `supersedes`. Separate from containment. An Edge to a missing Path is dangling and shown as such.

**Ready**:
A Question whose every `relies_on` target is settled.

**Leaning**:
An open Question with at least one `relies_on` target that is not settled.

**Frontier**:
The Topic's Ready Questions in Rank order: what the agent would ask next, and what a person can answer ahead.

**Rank**:
The agent's order for asking open Questions, lowest first. Unranked Questions come after ranked ones.

**Current**:
The Question the agent is asking in the terminal right now; at most one per Topic.

**Gist**:
A Node's one-sentence summary. A parent's Gist summarises its children.

**Stale gist**:
A Node whose children changed in meaning since its Title or Gist was last written. The agent is prompted to rewrite it.

**LOD**:
Level of detail. Zoomed out, a Node shows its Title; closer, its Gist and counts; closest, its Body and Widgets. Zoom changes what a box shows, never where it sits.

**Widget**:
A typed visual block on a Node: schema, migration, files, classes, options, sequence, states, api, table, code or markdown. Its data shape is in `docs/widgets.md`.

**Element**:
An addressable part of a Widget (a column, a row, a file, a class) named by a key stable within that Widget. Notes can pin to one.

**Change**:
The marker a Widget Element carries in a proposal: `added`, `removed`, `changed` or `renamed`.

**Anchor**:
Where a Note is pinned: a Topic as a whole, a Node, a Widget on it, or one Element of that Widget.

**Note**:
What a person adds on the board, pinned to an Anchor, with an Intent and text. People write only Notes; the model is the agent's alone.

**Intent**:
What a Note asks of the agent: `answer`, `accept` (take the Recommendation or confirm an assumption), `correct`, `comment`, `explore`, `defer` or `drop`.

**Queued**:
A Note added on the board and not yet pulled by the agent.

**Send**:
The board action that stamps every Queued Note as sent and wakes a waiting agent. Notes also reach the agent on its next turn without Send.

**Pull**:
The agent taking every Queued Note into its context, which marks them delivered.

**Resolve**:
The agent closing a delivered Note with a one-line Reply and the Paths it changed.

**Wait**:
`beryl wait`: a listener the agent runs in the background between turns. It exits when Notes are sent, pulls them and prints them, which wakes the agent.

**Event**:
A full-row snapshot after a write (Topic, Node, Note), or a Node removal or Send marker, numbered by `seq`.

**seq**:
The event counter. A page that remembers the last `seq` it saw resumes its Stream without gaps.

**Stream**:
`GET /api/topics/:id/stream`: server-sent Events for one Topic, with replay from a `seq`.

**Admin token**:
The server owner's secret, set as `ADMIN_TOKEN`. It opens the admin portal and `/api/admin`; unset, both answer 404. It is not a Write key and reaches no agent.

**Bundle**:
A zip the admin portal exports and imports: `db.ndjson`, a logical snapshot of every Project, Topic, Node and Note, and `manifest.json` naming the format, schema level and each file's sha256. Importing one replaces everything.

**Registry**:
`projects.json` and `topics.json` in the client config dir: which Project a repo writes to, with its keys, and which server and Project each Topic belongs to.
