# Using speculum

## Install

Needs Node.js 22+, pnpm 11 (`corepack enable`), and Docker with compose for the local board server.

```sh
scripts/install.sh --with-server --hooks
speculum doctor
```

This builds the packages, links the `speculum` skill and CLI (`~/.local/bin/speculum`), registers the MCP server with Claude Code (and Codex if present), starts the board server on <http://localhost:3270>, and adds the hooks that bring board notes into each turn. It is safe to re-run.

| Flag | Does |
| --- | --- |
| `--with-server` | `docker compose up -d` and wait for the server to answer |
| `--hooks` | add `speculum hook` to `~/.claude/settings.json` on `SessionStart` (compact, resume), `UserPromptSubmit` and `PostToolUse` of speculum tools |
| `--allow-tools` | add `mcp__speculum__*` to `permissions.allow` |
| `--replace` | move conflicting paths aside and re-register |
| `--skip-mcp` | do not register the MCP server |
| `--dry-run` | print what would happen |

`scripts/uninstall.sh` removes exactly what the installer recorded; `--purge` also deletes the registry (`projects.json`, `topics.json`), which holds the keys.

## How a grill uses it

1. The agent starts grilling and calls `open_topic` with its first sketch of the model. The private board link opens in your browser.
2. Each turn the agent writes what it learned (`put_nodes`), sets the Question it is asking (`update_topic current`), and asks it in the terminal.
3. On the board, open Questions sit in the Questions sidebar and the Frontier view, each with the agent's recommendation. Answer any of them, in any order. Accept a recommendation, correct an assumption, comment on a column of a proposed table, ask the agent to explore a foggy area.
4. Press **Send**. The agent's background listener (`speculum wait`) wakes it with your notes. Typing in the terminal brings them in too.
5. The agent folds each note into the model, resolves it with a one-line reply, and moves on to the next unanswered Question.

The private link (`#nk=…`) is for you: notes from it go straight into the agent's context. Share the plain link; it is read-only.

## Views

- **Graph**: the model as a zoomable map. Zoom out for areas and their counts, in for cards, closer still for gists, recommendations and widget previews.
- **Map**: a treemap of the whole tree, colored by status, for seeing where the unknowns cluster.
- **Outline**: the tree as a keyboard-driven list.
- **Frontier**: every open Question in the agent's order, with quick answers.

The Questions sidebar lists every Question the agent knows about; click one to fly to it in the current view. The inspector shows the selected node in full: widgets, edges, sources, notes and history.

## MCP tools

| Tool | Does |
| --- | --- |
| `open_topic` | start a grill's board (or resume one by `topicId`) and open the private link |
| `get_topic` | the model as an outline, a subtree in full, or JSON |
| `put_nodes` | create or update nodes in one batch |
| `remove_nodes` | delete nodes and their subtrees |
| `move_node` | move a subtree to a new path; edges and notes follow |
| `update_topic` | title, destination, summary, the Current Question, open or closed |
| `pull_notes` | take the notes waiting on the board |
| `resolve_notes` | close notes with a reply and the paths changed |

## CLI

```
speculum open "Team workspaces" --destination "A spec for …"     # prints: <topicId> <url> <noteUrl>
speculum put <topicId> --file nodes.json
speculum get <topicId> [--path storage] [--full] [--json]
speculum topic <topicId> --current storage/engine
speculum pull <topicId>
speculum resolve <topicId> <noteId> --reply "Settled: MySQL" --changed storage/engine
speculum wait <topicId>                                           # blocks until notes are sent
speculum url <topicId> [--private]
speculum doctor
```

## Configuration

| Variable | Default | Does |
| --- | --- | --- |
| `SPECULUM_URL` | unset | pin the client to one server (no fallback) |
| `SPECULUM_OPEN` | `1` | `0` stops the MCP server opening the board link |
| `XDG_CONFIG_HOME` | `~/.config` | the registry lives in `$XDG_CONFIG_HOME/speculum` |

Server: `DATABASE_URL`, `ORIGIN`, `SPECULUM_IDLE_MS`, `SPECULUM_WRITES_PER_WINDOW`, `SPECULUM_WRITE_WINDOW_MS`, `SPECULUM_HEARTBEAT_MS` (see `apps/web/src/env.ts`).

## Development

```sh
pnpm install
pnpm db:start                 # MySQL on 127.0.0.1:3326
pnpm dev                      # the web app on http://localhost:3271
pnpm test                     # packages and server specs
node scripts/simulate.mjs --server http://localhost:3271   # play the demo grill into a live board
```

`/demo` shows the demo grill without a server; `/demo/widgets` shows every widget type.
