#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const { values } = parseArgs({
	options: {
		server: { type: 'string', default: process.env.BERYL_URL || 'http://localhost:3270' },
		fixture: {
			type: 'string',
			default: new URL('../apps/web/src/lib/fixtures/demo-grill.json', import.meta.url).pathname
		},
		delay: { type: 'string', default: '4000' },
		turns: { type: 'string' },
		help: { type: 'boolean', short: 'h' }
	}
});

if (values.help) {
	console.log(`Usage: node scripts/simulate.mjs [--server url] [--delay ms] [--turns n] [--fixture file]

Creates a project and a topic on the server, prints the private board link,
then plays the fixture's turns with --delay between them (default 4000 ms).`);
	process.exit(0);
}

const server = values.server.trim().replace(/\/+$/, '');
const delay = Number(values.delay);
const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
const turns = fixture.turns.slice(0, values.turns ? Number(values.turns) : undefined);

async function call(method, path, key, body) {
	const res = await fetch(server + path, {
		method,
		headers: {
			accept: 'application/json',
			...(key ? { authorization: `Bearer ${key}` } : {}),
			...(body === undefined ? {} : { 'content-type': 'application/json' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
	return JSON.parse(text);
}

const project = await call('POST', '/api/projects', undefined, { name: fixture.project.name });
const created = await call('POST', `/api/projects/${project.id}/topics`, project.writeKey, {
	title: fixture.topic.title,
	destination: fixture.topic.destination,
	summary: fixture.topic.summary,
	agent: { tool: 'simulator' }
});
const topicId = created.topicId;
const w = project.writeKey;
const n = w;
const pairing = await call('POST', `/api/projects/${project.id}/pairings`, w);

console.log(`board (private): ${created.url}#pc=${pairing.code}`);
console.log(`board (share):   ${created.url}`);

const noteIds = [];

for (const [index, turn] of turns.entries()) {
	await sleep(index === 0 ? Math.min(delay, 2000) : delay);
	console.log(`\nturn ${index + 1}/${turns.length}`);
	if (turn.pull) {
		const pulled = await call('POST', `/api/topics/${topicId}/pull`, w);
		console.log(`  agent pulled ${pulled.notes.length} notes`);
	}
	if (turn.resolve?.length) {
		await call('POST', `/api/topics/${topicId}/resolve`, w, {
			notes: turn.resolve.map((r) => ({ id: noteIds[r.note], reply: r.reply, changed: r.changed }))
		});
		console.log(`  agent resolved ${turn.resolve.length} notes`);
	}
	if (turn.remove?.length) {
		await call('DELETE', `/api/topics/${topicId}/nodes`, w, { paths: turn.remove });
	}
	for (const move of turn.move ?? []) {
		await call('POST', `/api/topics/${topicId}/move`, w, move);
	}
	if (turn.nodes?.length) {
		await call('PUT', `/api/topics/${topicId}/nodes`, w, { nodes: turn.nodes });
		console.log(`  agent wrote ${turn.nodes.length} nodes`);
	}
	if (turn.topic) await call('PATCH', `/api/topics/${topicId}`, w, turn.topic);
	if (turn.say) console.log(`  agent asks: ${turn.say}`);
	for (const note of turn.notes ?? []) {
		await sleep(Math.min(delay / 2, 1500));
		const { note: saved } = await call('POST', `/api/topics/${topicId}/notes`, n, note);
		noteIds.push(saved.id);
		console.log(`  person: [${note.intent}] ${note.anchor.path ?? 'topic'}`);
	}
	if (turn.send) {
		const { sent } = await call('POST', `/api/topics/${topicId}/send`, n);
		console.log(`  person pressed Send (${sent})`);
	}
}

console.log('\ndone');
