---
name: speculum
description: "Show a grilling session as a live, zoomable board of your model of the design, with every open question marked, and fold in the notes the user leaves on it. Use whenever a grilling, grill-with-docs or design-interview session starts, or the user asks to see, map or visualise the design being discussed."
---

# speculum

A speculum board shows your model of the shared understanding as it forms: areas, decisions, facts, assumptions, fog, and widgets for the concrete shapes (schemas, migrations, files, diagrams). You write it; the user browses it, answers questions ahead in their own order, and leaves Notes pinned to nodes or widget elements. Grilling still asks one question at a time in the terminal, but every open question is on the board, so the user can head off the ones they already know.

A failed board write never blocks the grill. Once a board is open, keeping it current is part of every turn.

## Pick the channel

1. MCP tools `open_topic`, `get_topic`, `put_nodes`, `remove_nodes`, `move_node`, `update_topic`, `pull_notes`, `resolve_notes`. In Claude Code they are `mcp__speculum__*` and may be deferred: load them with ToolSearch, query `speculum`.
2. Otherwise the `speculum` CLI (run it with no arguments for its commands).
3. Neither: grill without the board, silently.

## Open the board

Before the first question, call `open_topic` with:

- `title`: the subject, a few words.
- `destination`: what this grill is finding its way to (a spec, a decision, a change), one or two lines.
- `summary`: why the work exists, one or two lines.
- `nodes`: your first sketch of the model (see Model). Chart breadth first: the areas you can see, the Questions you can already phrase, the facts you looked up, the assumptions you are making, and fog where you can tell something matters but can't yet phrase it.

Print the returned `noteUrl` to the user once, saying it is their private link: they can answer any open question there, in any order, add notes, and press Send. Notes from that link enter your context, so the `url` (read-only) is the one to share. To continue an earlier grill, call `open_topic` with its `topicId`.

## Model

A Node is addressed by a Path of short stable keys (`storage`, `storage/engine`). The tree is containment: a parent summarises its children, and zooming out shows only parents.

| kind | use for | starts |
| --- | --- | --- |
| `area` | a region of the design that groups nodes | open |
| `decision` | a choice to make; open, it is a Question | open |
| `assumption` | something you believe and want confirmed | open |
| `fact` | something you found, with `sources` (file and line, or URL) | settled |
| `term` | a domain term and its meaning | settled |
| `fog` | an area that matters but can't be phrased as a Question yet | open |
| `constraint` | a fixed limit the design must respect | settled |
| `risk` | something that could go wrong | open |

Status is `open`, `settled`, `parked` (the user deferred it) or `dropped` (out of scope, rejected or superseded, with one line of body saying why).

- **One idea per node.** Title up to eight words; `gist` one sentence; detail in `body` (markdown).
- **Every open Question** has a `recommendation` (your answer and why, as grilling asks) and a `rank`: your asking order, 1 first.
- **Settling** sets `status: settled` and `answer` in the user's words.
- **Edges**: `relies_on` when a decision depends on another; `conflicts` when two can't both hold; `supersedes` when one replaces another; `relates` otherwise.
- **Widgets** whenever the talk has a concrete shape: tables (`schema`), a migration with row changes (`migration`), files touched (`files`), classes (`classes`), alternatives (`options`), a flow (`sequence`), a lifecycle (`states`), endpoints or tools (`api`), a matrix (`table`), a snippet (`code`). Mark what a proposal adds, removes or changes with `change` on each element. Read [WIDGETS.md](WIDGETS.md) the first time you need one. A rejected widget write is a `speculum:` warning naming the field; fix it and resend.
- **Level of detail is yours to keep.** When children change, rewrite their parent's `gist` in the same write. The board flags parents whose gist went stale, and so do your turn reminders (`Stale gists: …`).
- **Fog graduates.** When fog sharpens into Questions, add them and remove the fog node.

## Each turn

1. **Take in notes.** A `speculum:` reminder at the start of a turn carries the notes from the board, and a finished `speculum wait` prints them. With neither, call `pull_notes`.
2. **Fold each note in.** `answer` settles that Question with the user's answer. `accept` settles it with your recommendation (on an assumption: confirms it). `correct` fixes the node. `comment` adjusts it, or gets a reply. `explore` makes that region your next line of questions. `defer` parks it. `drop` drops it. A note pinned to a widget element is about that element: change the widget. Settle only what the user decided, on the board or in the terminal. Never settle a Question for them.
3. **Resolve** every note with `resolve_notes`: a one-line reply each, and the Paths you changed.
4. **Write the turn** in one `put_nodes` batch: settled Questions with their answers, new Questions, updated widgets, refreshed gists.
5. **Ask the next Question**: the top of your ranks, skipping anything already answered on the board. Set it with `update_topic current`, then ask it in the terminal with your recommendation, as grilling does. Don't narrate the board in the terminal.
6. **Listen.** In Claude Code, when the reminder says no board listener is running, run `speculum wait <topicId>` with Bash `run_in_background: true` before you end the turn. When it finishes, its output holds the sent notes: work them from step 2, then start it again.

After compaction or on resume, call `get_topic` (it returns your outline; `detail: full` and a `path` give one subtree in full) before writing.

## Finish

When grilling reaches shared understanding, settle or drop what is left, write a final `summary`, and call `update_topic` with `status: closed`. The board stays as the record of the decisions.

## Warnings

A tool answer starting with `speculum:` is a warning (board unreachable, unknown topic, rejected write). Carry on with the grill. Don't retry an unreachable board in the same turn.
