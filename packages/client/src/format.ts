import type { Anchor, Node, NoteIntent, Note, Pulled, Snapshot } from './types.ts';

const EMPTY_TEXT: Partial<Record<NoteIntent, string>> = {
	accept: 'accept the recommendation',
	defer: 'defer this',
	drop: 'drop this'
};

const indentLines = (text: string, indent: string) => text.replace(/\r?\n/g, `\n${indent}`);

function anchorTail(anchor: Anchor): string {
	return (
		(anchor.widget ? ` › ${anchor.widget}` : '') + (anchor.element ? ` › ${anchor.element}` : '')
	);
}

function where(anchor: Anchor, context: Pulled['context']): string {
	if (anchor.path === null) return 'topic';
	const title = Object.hasOwn(context, anchor.path) ? ` "${context[anchor.path].title}"` : '';
	return `${anchor.path}${title}${anchorTail(anchor)}`;
}

function noteLine(note: Note, context: Pulled['context']): string {
	const text = indentLines(note.text || EMPTY_TEXT[note.intent] || '', '  ');
	const by = note.author ? ` (by ${note.author})` : '';
	return `- [${note.intent}] ${where(note.anchor, context)}: ${text}${by} (note ${note.id})`;
}

export function formatPulled(pulled: Pulled, topic: { id: string; title?: string }): string {
	const count = pulled.notes.length;
	const lines =
		count > 0
			? [
					`beryl: ${count} new note${count === 1 ? '' : 's'} from the board on topic ${topic.id}${
						topic.title ? ` (${topic.title})` : ''
					}:`,
					...pulled.notes.map((note) => noteLine(note, pulled.context))
				]
			: [`beryl: no new notes on the board for topic ${topic.id}.`];
	if (pulled.unresolved.length > 0) {
		lines.push(
			'Still unresolved from earlier:',
			...pulled.unresolved.map((note) => noteLine(note, pulled.context))
		);
	}
	if (pulled.stale.length > 0) {
		lines.push(`Stale gists: ${pulled.stale.map((s) => s.path).join(', ')}.`);
	}
	if (count > 0 || pulled.unresolved.length > 0) {
		lines.push(
			'Fold each note into the model, then call resolve_notes with a one-line reply for each.'
		);
	}
	return lines.join('\n');
}

function nodeLine(node: Node, current: string | null): string {
	const rank =
		node.kind === 'decision' && node.status === 'open' && node.rank !== null
			? `#${node.rank} `
			: '';
	return (
		`${node.path} [${node.kind}/${node.status}]${node.gistStale ? '*' : ''} ${rank}${node.title}` +
		(node.gist ? ` — ${node.gist}` : '') +
		(node.path === current ? ' ← now asking' : '')
	);
}

function detailLines(node: Node, indent: string): string[] {
	const more = `${indent}  `;
	const lines: string[] = [];
	const field = (label: string, value: string) => {
		if (value) lines.push(`${indent}${label}: ${indentLines(value, more)}`);
	};
	field('body', node.body);
	field('recommendation', node.recommendation);
	field('answer', node.answer);
	for (const edge of node.edges) {
		lines.push(`${indent}→ ${edge.rel} ${edge.to}${edge.label ? ` (${edge.label})` : ''}`);
	}
	for (const source of node.sources) {
		const file = source.file ? `${source.file}${source.line ? `:${source.line}` : ''}` : '';
		const at = [file, source.url ?? ''].filter(Boolean).join(' ');
		lines.push(`${indent}source: ${at}${source.label ? ` (${source.label})` : ''}`);
	}
	for (const widget of node.widgets) {
		lines.push(
			`${indent}widget ${widget.key} (${widget.type}): ${JSON.stringify(widget.data ?? null)}`
		);
	}
	return lines;
}

export function formatOutline(
	snapshot: Snapshot,
	options: { path?: string; detail?: 'outline' | 'full' } = {}
): string {
	const { topic, nodes, notes } = snapshot;
	const full = options.detail === 'full';
	const lines = [`Topic "${topic.title}" (${topic.status})`];
	if (topic.destination) lines.push(`Destination: ${topic.destination}`);

	const paths = new Set(nodes.map((n) => n.path));
	const children = new Map<string | null, Node[]>();
	for (const node of nodes) {
		const parent = node.parentPath !== null && paths.has(node.parentPath) ? node.parentPath : null;
		children.set(parent, [...(children.get(parent) ?? []), node]);
	}
	for (const list of children.values()) {
		list.sort(
			(a, b) => a.position - b.position || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
		);
	}

	const visit = (node: Node, level: number) => {
		const indent = '  '.repeat(level);
		lines.push(indent + nodeLine(node, topic.current));
		if (full) lines.push(...detailLines(node, `${indent}    `));
		for (const child of children.get(node.path) ?? []) visit(child, level + 1);
	};

	if (options.path === undefined) {
		for (const root of children.get(null) ?? []) visit(root, 0);
	} else {
		const start = nodes.find((n) => n.path === options.path);
		if (start) visit(start, 0);
		else lines.push(`No node ${options.path}.`);
	}

	const queued = notes.filter((n) => n.status === 'queued').length;
	const delivered = notes.filter((n) => n.status === 'delivered').length;
	lines.push(`Notes: ${queued} queued, ${delivered} delivered and unresolved.`);
	return lines.join('\n');
}
