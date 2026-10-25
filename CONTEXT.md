# speculum

A live, zoomable view of a grilling agent's model of a design. The agent writes what it understands as a tree of Nodes; people browse it, answer ahead in their own order, and leave Notes that flow back into the agent's next turn. Terms below are binding vocabulary; the contracts are `docs/api.md` (types, HTTP, stream), `docs/widgets.md` (widget data), `docs/client.md` (client, CLI, MCP, hook) and `docs/ui.md` (board helpers and views). Where this file and a contract disagree, the contract wins.

## Language

**Project**:
One repo's speculum space: its Topics, a Write key and a Note key. Its UUID is also its URL (`/p/<id>`).

**Write key**:
The secret that writes the model. Returned once at Project creation, kept on the agent's machine; the server stores only its sha256.

**Note key**:
The secret that writes Notes. Returned once at Project creation beside the Write key. It travels in the Private link's URL fragment and is kept per browser.

**Share link**:
A Topic URL without the Note key: read-only.

**Private link**:
A Topic URL with `#nk=<Note key>`: lets that browser add Notes and press Send. Opened for the user by the agent; not for sharing, because Notes enter the agent's context.

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
`speculum wait`: a listener the agent runs in the background between turns. It exits when Notes are sent, pulls them and prints them, which wakes the agent.

**Event**:
A full-row snapshot after a write (Topic, Node, Note), or a Node removal or Send marker, numbered by `seq`.

**seq**:
The event counter. A page that remembers the last `seq` it saw resumes its Stream without gaps.

**Stream**:
`GET /api/topics/:id/stream`: server-sent Events for one Topic, with replay from a `seq`.

**Registry**:
`projects.json` and `topics.json` in the client config dir: which Project a repo writes to, with its keys, and which server and Project each Topic belongs to.
