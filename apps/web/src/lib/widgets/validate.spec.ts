import { describe, expect, it } from 'vitest';
import { validateWidget } from './validate.ts';

type Data = Record<string, any>;

const widget = (type: string, data: unknown, extra: Data = {}) => ({
	key: 'w',
	type,
	data,
	...extra
});

function reason(type: string, data: unknown): string | undefined {
	const result = validateWidget(widget(type, data));
	return result.ok ? undefined : result.reason;
}

function expectValid(type: string, data: unknown): void {
	const input = widget(type, data);
	expect(validateWidget(input)).toEqual({ ok: true, widget: input });
}

const VALID: Record<string, Data> = {
	markdown: { text: '## Hi\n\n- one' },
	code: { code: 'a\nb\nc', language: 'ts', filename: 'src/a.ts', highlight: [1, 3] },
	schema: {
		tables: [
			{
				name: 'users',
				note: 'people',
				columns: [
					{ name: 'id', type: 'bigint', pk: true },
					{ name: 'email', type: 'varchar(255)', nullable: true, unique: true, default: "''" },
					{ name: 'handle', type: 'text', change: 'renamed', from: 'username' }
				],
				indexes: [{ name: 'users_email', columns: ['email'], unique: true, change: 'added' }]
			},
			{
				name: 'memberships',
				change: 'added',
				columns: [
					{ name: 'user_id', type: 'bigint', references: { table: 'users', column: 'id' } },
					{ name: 'ws', type: 'bigint', references: { table: 'elsewhere', column: 'id' } }
				]
			},
			{ name: 'teams', change: 'renamed', from: 'groups', columns: [] }
		]
	},
	migration: {
		dialect: 'mysql',
		steps: [
			{
				key: 'create',
				op: 'create',
				table: 'workspaces',
				risk: 'low',
				reversible: true,
				columns: [
					{ name: 'id', change: 'added', after: 'bigint' },
					{ name: 'gone', change: 'removed', before: 'int' },
					{ name: 'kept', change: 'kept', before: 'int', after: 'int', note: 'same' }
				]
			},
			{
				key: 'fill',
				op: 'backfill',
				table: 'workspaces',
				title: 'Backfill',
				rows: {
					columns: ['id', 'slug'],
					items: [
						{ key: 'u1', change: 'added', values: [1, 'a'] },
						{ key: 'u2', change: 'changed', values: [2, 'b'], before: [2, 'old'] },
						{ key: 'u3', change: 'removed', values: [3, null] },
						{ key: 'u4', change: 'kept', values: [4, true] }
					]
				},
				sql: 'UPDATE x;'
			},
			{ key: 'rename', op: 'rename', table: 'realms', to: 'spaces' }
		]
	},
	files: {
		root: 'apps/web',
		files: [
			{ path: 'src/a.ts', change: 'added', summary: 'new', added: 10 },
			{ path: 'src/b.ts', change: 'renamed', from: 'src/old.ts', added: 0, removed: 2 },
			{ path: 'src/c.ts' }
		]
	},
	classes: {
		classes: [
			{
				key: 'Svc',
				name: 'Service',
				stereotype: 'service',
				fields: [{ name: 'ttl', type: 'Duration', visibility: '-', static: true }],
				methods: [
					{ name: 'find', params: 'id: Id', returns: 'T', visibility: '+' },
					{ name: 'find', params: 'name: string', returns: 'T', abstract: true, change: 'added' }
				]
			},
			{ key: 'Base', name: 'Base', change: 'renamed', from: 'Root' }
		],
		relations: [
			{ from: 'Svc', to: 'Base', kind: 'inherits', label: 'is', fromCard: '1', toCard: '0..*' }
		]
	},
	options: {
		question: 'Which?',
		criteria: [
			{ key: 'effort', label: 'Effort' },
			{ key: 'ops', label: 'Ops' }
		],
		options: [
			{
				key: 'a',
				title: 'A',
				summary: 's',
				pros: ['p'],
				cons: ['c'],
				scores: { effort: '+', ops: 'needs a DBA' },
				recommended: true
			},
			{ key: 'b', title: 'B', chosen: true },
			{ key: 'c', title: 'C', recommended: false, chosen: false }
		]
	},
	sequence: {
		actors: [
			{ key: 'user', label: 'User', kind: 'person' },
			{ key: 'app', label: 'App', kind: 'service' }
		],
		steps: [
			{ key: 's1', from: 'user', to: 'app', label: 'call', kind: 'call' },
			{ key: 's2', from: 'app', to: 'app', label: 'self', kind: 'note', change: 'added' }
		]
	},
	states: {
		states: [
			{ key: 'pending', label: 'Pending', kind: 'initial' },
			{ key: 'done', label: 'Done', kind: 'final', note: 'n', change: 'added' }
		],
		transitions: [
			{ from: 'pending', to: 'done', label: 'finish' },
			{ key: 'again', from: 'pending', to: 'done' },
			{ from: 'done', to: 'pending', change: 'added' }
		]
	},
	api: {
		endpoints: [
			{
				key: 'list',
				method: 'GET',
				path: '/api/things',
				summary: 's',
				auth: 'member',
				request: '{}',
				response: '{ things: Thing[] }',
				change: 'added'
			},
			{ key: 'tool', method: 'TOOL', path: 'do_thing' }
		]
	},
	table: {
		columns: ['', 'Owner', 'Guest'],
		rows: [
			{ key: 'read', cells: ['Read', true, true] },
			{ key: 'pay', cells: ['Pay', 1.5, null], change: 'added' }
		]
	}
};

describe('validateWidget: the widget itself', () => {
	it.each(Object.entries(VALID))('accepts a full %s widget', (type, data) => {
		expectValid(type, data);
		const titled = { key: 'k.1-x_', type, title: 'Shown', data };
		expect(validateWidget(titled)).toEqual({ ok: true, widget: titled });
	});

	it.each([
		['a non-object', 'w', 'widget must be an object'],
		['an array', [], 'widget must be an object'],
		[
			'an unknown field',
			{ ...widget('markdown', { text: '' }), extra: 1 },
			'unknown field "extra"'
		],
		[
			'a missing key',
			{ type: 'markdown', data: { text: '' } },
			'key: must match /^[A-Za-z0-9._-]{1,64}$/'
		],
		[
			'a bad key',
			widget('markdown', { text: '' }, { key: 'has space' }),
			'key: must match /^[A-Za-z0-9._-]{1,64}$/'
		],
		[
			'a key over 64',
			widget('markdown', { text: '' }, { key: 'k'.repeat(65) }),
			'key: must match /^[A-Za-z0-9._-]{1,64}$/'
		],
		[
			'an unknown type',
			widget('chart', {}),
			'type: must be one of markdown, code, schema, migration, files, classes, options, sequence, states, api, table'
		],
		[
			'a title over 120',
			widget('markdown', { text: '' }, { title: 't'.repeat(121) }),
			'title: must be a string of at most 120 characters'
		],
		[
			'a non-string title',
			widget('markdown', { text: '' }, { title: 3 }),
			'title: must be a string of at most 120 characters'
		],
		['no data', { key: 'w', type: 'markdown' }, 'data: required'],
		['non-object data', widget('markdown', 'text'), 'data: must be an object']
	])('rejects %s', (_label, input, message) => {
		expect(validateWidget(input)).toEqual({ ok: false, reason: message });
	});

	it('caps serialised data at 64 KB', () => {
		const files = Array.from({ length: 200 }, (_, i) => ({
			path: `f${i}`,
			summary: 'y'.repeat(400)
		}));
		expect(reason('files', { files })).toBe('data: must be at most 65536 bytes serialised');
	});

	it('counts serialised bytes, not characters', () => {
		const files = Array.from({ length: 70 }, (_, i) => ({
			path: `f${i}`,
			summary: 'é'.repeat(500)
		}));
		expect(JSON.stringify({ files }).length).toBeLessThan(65_536);
		expect(reason('files', { files })).toBe('data: must be at most 65536 bytes serialised');
	});

	it('never throws on odd input', () => {
		for (const input of [null, undefined, 0, true, { key: 'w', type: 'table', data: null }]) {
			expect(validateWidget(input).ok).toBe(false);
		}
	});
});

describe('markdown and code', () => {
	it.each([
		['markdown', {}, 'text: required'],
		['markdown', { text: 'x'.repeat(20_001) }, 'text: must be at most 20000 characters'],
		['markdown', { text: '', html: '<b>' }, 'data: unknown field "html"'],
		['code', { language: 'ts' }, 'code: required'],
		['code', { code: 1 }, 'code: must be a string'],
		['code', { code: 'a', highlight: [0] }, 'highlight[0]: must be an integer of at least 1'],
		['code', { code: 'a', highlight: [1.5] }, 'highlight[0]: must be an integer of at least 1'],
		['code', { code: 'a', highlight: 1 }, 'highlight: must be an array'],
		['code', { code: 'a', language: 'x'.repeat(65) }, 'language: must be at most 64 characters']
	])('%s rejects %j', (type, data, message) => {
		expect(reason(type, data)).toBe(message);
	});

	it('accepts empty text and code', () => {
		expectValid('markdown', { text: '' });
		expectValid('code', { code: '' });
	});
});

describe('schema', () => {
	const table = (extra: Data = {}) => ({
		name: 't',
		columns: [{ name: 'id', type: 'int' }],
		...extra
	});

	it.each([
		['no tables', {}, 'tables: required'],
		[
			'an unknown column field',
			{ tables: [table(), { name: 'u', columns: [{ name: 'id', type: 'int', nulable: true }] }] },
			'tables[1].columns[0]: unknown field "nulable"'
		],
		[
			'a column without type',
			{ tables: [{ name: 't', columns: [{ name: 'id' }] }] },
			'tables[0].columns[0].type: required'
		],
		['a duplicate table name', { tables: [table(), table()] }, 'tables[1].name: duplicate "t"'],
		[
			'a duplicate column name',
			{
				tables: [
					{
						name: 't',
						columns: [
							{ name: 'a', type: 'int' },
							{ name: 'a', type: 'int' }
						]
					}
				]
			},
			'tables[0].columns[1].name: duplicate "a"'
		],
		['an empty table name', { tables: [table({ name: '' })] }, 'tables[0].name: must not be empty'],
		[
			'a table name with a newline',
			{ tables: [table({ name: 'a\nb' })] },
			'tables[0].name: must be a single line'
		],
		[
			'a name over 200',
			{ tables: [table({ name: 'n'.repeat(201) })] },
			'tables[0].name: must be at most 200 characters'
		],
		[
			'a note over 1000',
			{ tables: [table({ note: 'n'.repeat(1001) })] },
			'tables[0].note: must be at most 1000 characters'
		],
		[
			'an unknown change',
			{ tables: [table({ change: 'moved' })] },
			'tables[0].change: must be one of added, removed, changed, renamed'
		],
		[
			'from without renamed',
			{ tables: [table({ change: 'changed', from: 'old' })] },
			'tables[0].from: only allowed with change "renamed"'
		],
		[
			'column from without change',
			{ tables: [{ name: 't', columns: [{ name: 'a', type: 'int', from: 'b' }] }] },
			'tables[0].columns[0].from: only allowed with change "renamed"'
		],
		[
			'a non-boolean pk',
			{ tables: [{ name: 't', columns: [{ name: 'a', type: 'int', pk: 'yes' }] }] },
			'tables[0].columns[0].pk: must be a boolean'
		],
		[
			'a reference without column',
			{
				tables: [{ name: 't', columns: [{ name: 'a', type: 'int', references: { table: 'u' } }] }]
			},
			'tables[0].columns[0].references.column: required'
		],
		[
			'an index field typo',
			{ tables: [table({ indexes: [{ name: 'i', cols: ['id'] }] })] },
			'tables[0].indexes[0]: unknown field "cols"'
		],
		[
			'over 60 tables',
			{ tables: Array.from({ length: 61 }, (_, i) => table({ name: `t${i}` })) },
			'tables: must have at most 60 items'
		],
		[
			'over 200 columns',
			{
				tables: [
					{
						name: 't',
						columns: Array.from({ length: 201 }, (_, i) => ({ name: `c${i}`, type: 'int' }))
					}
				]
			},
			'tables[0].columns: must have at most 200 items'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('schema', data)).toBe(message);
	});
});

describe('migration', () => {
	const step = (extra: Data = {}) => ({ key: 's', op: 'alter', table: 't', ...extra });
	const rows = (items: unknown[], columns = ['a', 'b']) => ({ columns, items });

	it.each([
		[
			'an unknown op',
			{ steps: [step({ op: 'truncate' })] },
			'steps[0].op: must be one of create, alter, drop, rename, backfill, data'
		],
		['a duplicate step key', { steps: [step(), step()] }, 'steps[1].key: duplicate "s"'],
		[
			'to on a non-rename step',
			{ steps: [step({ to: 'u' })] },
			'steps[0].to: only allowed with op "rename"'
		],
		[
			'an unknown risk',
			{ steps: [step({ risk: 'extreme' })] },
			'steps[0].risk: must be one of low, medium, high'
		],
		[
			'a column change outside the set',
			{ steps: [step({ columns: [{ name: 'a', change: 'moved' }] })] },
			'steps[0].columns[0].change: must be one of added, removed, changed, renamed, kept'
		],
		[
			'a column without change',
			{ steps: [step({ columns: [{ name: 'a' }] })] },
			'steps[0].columns[0].change: required'
		],
		[
			'before on an added column',
			{ steps: [step({ columns: [{ name: 'a', change: 'added', before: 'int' }] })] },
			'steps[0].columns[0].before: not allowed on an added column'
		],
		[
			'after on a removed column',
			{ steps: [step({ columns: [{ name: 'a', change: 'removed', after: 'int' }] })] },
			'steps[0].columns[0].after: not allowed on a removed column'
		],
		[
			'a column from field',
			{ steps: [step({ columns: [{ name: 'a', change: 'renamed', from: 'b' }] })] },
			'steps[0].columns[0]: unknown field "from"'
		],
		[
			'values shorter than columns',
			{ steps: [step({ rows: rows([{ key: 'r', change: 'added', values: [1] }]) })] },
			'steps[0].rows.items[0].values: must have 2 cells, one per column'
		],
		[
			'before on a non-changed row',
			{
				steps: [
					step({ rows: rows([{ key: 'r', change: 'added', values: [1, 2], before: [1, 2] }]) })
				]
			},
			'steps[0].rows.items[0].before: only allowed on changed rows'
		],
		[
			'before of the wrong length',
			{
				steps: [
					step({ rows: rows([{ key: 'r', change: 'changed', values: [1, 2], before: [1] }]) })
				]
			},
			'steps[0].rows.items[0].before: must have 2 cells, one per column'
		],
		[
			'a duplicate row key',
			{
				steps: [
					step({
						rows: rows([
							{ key: 'r', change: 'kept', values: [1, 2] },
							{ key: 'r', change: 'kept', values: [1, 2] }
						])
					})
				]
			},
			'steps[0].rows.items[1].key: duplicate "r"'
		],
		[
			'a row change of renamed',
			{ steps: [step({ rows: rows([{ key: 'r', change: 'renamed', values: [1, 2] }]) })] },
			'steps[0].rows.items[0].change: must be one of added, removed, changed, kept'
		],
		[
			'an object cell',
			{ steps: [step({ rows: rows([{ key: 'r', change: 'kept', values: [{}, 2] }]) })] },
			'steps[0].rows.items[0].values[0]: must be a string, number, boolean or null'
		],
		[
			'over 30 row columns',
			{
				steps: [
					step({
						rows: rows(
							[],
							Array.from({ length: 31 }, (_, i) => `c${i}`)
						)
					})
				]
			},
			'steps[0].rows.columns: must have at most 30 items'
		],
		[
			'over 100 steps',
			{ steps: Array.from({ length: 101 }, (_, i) => step({ key: `s${i}` })) },
			'steps: must have at most 100 items'
		],
		[
			'sql over 20000',
			{ steps: [step({ sql: 'x'.repeat(20_001) })] },
			'steps[0].sql: must be at most 20000 characters'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('migration', data)).toBe(message);
	});
});

describe('files', () => {
	it.each([
		['a duplicate path', { files: [{ path: 'a' }, { path: 'a' }] }, 'files[1].path: duplicate "a"'],
		[
			'from without renamed',
			{ files: [{ path: 'a', from: 'b' }] },
			'files[0].from: only allowed with change "renamed"'
		],
		[
			'negative added lines',
			{ files: [{ path: 'a', added: -1 }] },
			'files[0].added: must be an integer of at least 0'
		],
		[
			'fractional removed lines',
			{ files: [{ path: 'a', removed: 0.5 }] },
			'files[0].removed: must be an integer of at least 0'
		],
		[
			'a path with a newline',
			{ files: [{ path: 'a\nb' }] },
			'files[0].path: must be a single line'
		],
		[
			'over 500 files',
			{ files: Array.from({ length: 501 }, (_, i) => ({ path: `f${i}` })) },
			'files: must have at most 500 items'
		],
		[
			'an unknown file field',
			{ files: [{ path: 'a', lines: 3 }] },
			'files[0]: unknown field "lines"'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('files', data)).toBe(message);
	});

	it('accepts 500 files', () => {
		expectValid('files', { files: Array.from({ length: 500 }, (_, i) => ({ path: `f${i}` })) });
	});
});

describe('classes', () => {
	const cls = (key: string, extra: Data = {}) => ({ key, name: key, ...extra });

	it.each([
		['a duplicate class key', { classes: [cls('A'), cls('A')] }, 'classes[1].key: duplicate "A"'],
		[
			'a relation to an unknown class',
			{ classes: [cls('A')], relations: [{ from: 'A', to: 'B', kind: 'uses' }] },
			'relations[0].to: unknown class "B"'
		],
		[
			'a relation from an unknown class',
			{ classes: [cls('A')], relations: [{ from: 'Z', to: 'A', kind: 'uses' }] },
			'relations[0].from: unknown class "Z"'
		],
		[
			'an unknown relation kind',
			{ classes: [cls('A')], relations: [{ from: 'A', to: 'A', kind: 'owns' }] },
			'relations[0].kind: must be one of inherits, implements, composes, aggregates, uses, associates'
		],
		[
			'a bad visibility',
			{ classes: [cls('A', { fields: [{ name: 'f', visibility: 'public' }] })] },
			'classes[0].fields[0].visibility: must be one of +, -, #, ~'
		],
		[
			'a method typo',
			{ classes: [cls('A', { methods: [{ name: 'm', return: 'T' }] })] },
			'classes[0].methods[0]: unknown field "return"'
		],
		[
			'class from without renamed',
			{ classes: [cls('A', { from: 'B' })] },
			'classes[0].from: only allowed with change "renamed"'
		],
		['a class without name', { classes: [{ key: 'A' }] }, 'classes[0].name: required'],
		[
			'over 60 classes',
			{ classes: Array.from({ length: 61 }, (_, i) => cls(`C${i}`)) },
			'classes: must have at most 60 items'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('classes', data)).toBe(message);
	});
});

describe('options', () => {
	const opt = (key: string, extra: Data = {}) => ({ key, title: key.toUpperCase(), ...extra });

	it.each([
		['no options', { options: [] }, 'options: must have at least 1 item'],
		[
			'over 12 options',
			{ options: Array.from({ length: 13 }, (_, i) => opt(`o${i}`)) },
			'options: must have at most 12 items'
		],
		[
			'over 12 criteria',
			{
				criteria: Array.from({ length: 13 }, (_, i) => ({ key: `c${i}`, label: 'c' })),
				options: [opt('a')]
			},
			'criteria: must have at most 12 items'
		],
		['a duplicate option key', { options: [opt('a'), opt('a')] }, 'options[1].key: duplicate "a"'],
		[
			'a duplicate criterion key',
			{
				criteria: [
					{ key: 'c', label: 'C' },
					{ key: 'c', label: 'D' }
				],
				options: [opt('a')]
			},
			'criteria[1].key: duplicate "c"'
		],
		[
			'a score for an unknown criterion',
			{ criteria: [{ key: 'c', label: 'C' }], options: [opt('a', { scores: { c: '+', d: '-' } })] },
			'options[0].scores: "d" is not a criterion key'
		],
		[
			'scores without criteria',
			{ options: [opt('a', { scores: { c: '+' } })] },
			'options[0].scores: "c" is not a criterion key'
		],
		[
			'a non-string score',
			{ criteria: [{ key: 'c', label: 'C' }], options: [opt('a', { scores: { c: 2 } })] },
			'options[0].scores.c: must be a string'
		],
		[
			'two recommended',
			{ options: [opt('a', { recommended: true }), opt('b'), opt('c', { recommended: true })] },
			'options[2].recommended: only one option may be recommended'
		],
		[
			'two chosen',
			{ options: [opt('a', { chosen: true }), opt('b', { chosen: true })] },
			'options[1].chosen: only one option may be chosen'
		],
		[
			'a pros entry that is not a string',
			{ options: [opt('a', { pros: [1] })] },
			'options[0].pros[0]: must be a string'
		],
		['an option without a title', { options: [{ key: 'a' }] }, 'options[0].title: required']
	])('rejects %s', (_label, data, message) => {
		expect(reason('options', data)).toBe(message);
	});
});

describe('sequence', () => {
	const actors = [
		{ key: 'a', label: 'A' },
		{ key: 'b', label: 'B' }
	];

	it.each([
		['no actors', { actors: [], steps: [] }, 'actors: must have at least 1 item'],
		[
			'over 20 actors',
			{ actors: Array.from({ length: 21 }, (_, i) => ({ key: `a${i}`, label: 'x' })), steps: [] },
			'actors: must have at most 20 items'
		],
		[
			'a step to an unknown actor',
			{ actors, steps: [{ key: 's', from: 'a', to: 'c', label: 'x' }] },
			'steps[0].to: unknown actor "c"'
		],
		[
			'a step key that collides with an actor',
			{ actors, steps: [{ key: 'b', from: 'a', to: 'b', label: 'x' }] },
			'steps[0].key: "b" is already an actor key'
		],
		[
			'a duplicate step key',
			{
				actors,
				steps: [
					{ key: 's', from: 'a', to: 'b', label: 'x' },
					{ key: 's', from: 'b', to: 'a', label: 'y' }
				]
			},
			'steps[1].key: duplicate "s"'
		],
		[
			'a duplicate actor key',
			{ actors: [...actors, { key: 'a', label: 'again' }], steps: [] },
			'actors[2].key: duplicate "a"'
		],
		[
			'an unknown step kind',
			{ actors, steps: [{ key: 's', from: 'a', to: 'b', label: 'x', kind: 'ping' }] },
			'steps[0].kind: must be one of call, reply, async, note'
		],
		['missing steps', { actors }, 'steps: required']
	])('rejects %s', (_label, data, message) => {
		expect(reason('sequence', data)).toBe(message);
	});
});

describe('states', () => {
	const states = [
		{ key: 'a', label: 'A' },
		{ key: 'b', label: 'B' }
	];

	it.each([
		['no states', { states: [], transitions: [] }, 'states: must have at least 1 item'],
		[
			'over 60 states',
			{
				states: Array.from({ length: 61 }, (_, i) => ({ key: `s${i}`, label: 'x' })),
				transitions: []
			},
			'states: must have at most 60 items'
		],
		[
			'a transition to an unknown state',
			{ states, transitions: [{ from: 'a', to: 'c' }] },
			'transitions[0].to: unknown state "c"'
		],
		[
			'two unkeyed transitions with the same ends',
			{
				states,
				transitions: [
					{ from: 'a', to: 'b' },
					{ from: 'a', to: 'b', label: 'again' }
				]
			},
			'transitions[1]: duplicate "a->b"; give it a key'
		],
		[
			'an explicit key equal to a default key',
			{
				states,
				transitions: [
					{ from: 'a', to: 'b' },
					{ key: 'a->b', from: 'b', to: 'a' }
				]
			},
			'transitions[1].key: duplicate "a->b"'
		],
		[
			'a transition key that collides with a state',
			{ states, transitions: [{ key: 'b', from: 'a', to: 'b' }] },
			'transitions[0].key: "b" is already a state key'
		],
		[
			'a duplicate state key',
			{ states: [...states, { key: 'b', label: 'again' }], transitions: [] },
			'states[2].key: duplicate "b"'
		],
		[
			'an unknown state kind',
			{ states: [{ key: 'a', label: 'A', kind: 'start' }], transitions: [] },
			'states[0].kind: must be one of initial, final, normal'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('states', data)).toBe(message);
	});
});

describe('api', () => {
	const ep = (key: string, extra: Data = {}) => ({ key, method: 'GET', path: '/x', ...extra });

	it.each([
		[
			'a duplicate endpoint key',
			{ endpoints: [ep('a'), ep('a')] },
			'endpoints[1].key: duplicate "a"'
		],
		[
			'an endpoint without a path',
			{ endpoints: [{ key: 'a', method: 'GET' }] },
			'endpoints[0].path: required'
		],
		[
			'an empty method',
			{ endpoints: [ep('a', { method: '' })] },
			'endpoints[0].method: must not be empty'
		],
		[
			'an unknown endpoint field',
			{ endpoints: [ep('a', { verb: 'GET' })] },
			'endpoints[0]: unknown field "verb"'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('api', data)).toBe(message);
	});
});

describe('table', () => {
	it.each([
		['no columns', { columns: [], rows: [] }, 'columns: must have at least 1 item'],
		[
			'over 30 columns',
			{ columns: Array.from({ length: 31 }, (_, i) => `c${i}`), rows: [] },
			'columns: must have at most 30 items'
		],
		[
			'a row with too few cells',
			{ columns: ['a', 'b'], rows: [{ key: 'r', cells: ['x'] }] },
			'rows[0].cells: must have 2 cells, one per column'
		],
		[
			'a duplicate row key',
			{
				columns: ['a'],
				rows: [
					{ key: 'r', cells: [1] },
					{ key: 'r', cells: [2] }
				]
			},
			'rows[1].key: duplicate "r"'
		],
		[
			'an array cell',
			{ columns: ['a'], rows: [{ key: 'r', cells: [[1]] }] },
			'rows[0].cells[0]: must be a string, number, boolean or null'
		],
		[
			'a row typo',
			{ columns: ['a'], rows: [{ key: 'r', cell: [1] }] },
			'rows[0]: unknown field "cell"'
		],
		[
			'over 200 rows',
			{
				columns: ['a'],
				rows: Array.from({ length: 201 }, (_, i) => ({ key: `r${i}`, cells: [i] }))
			},
			'rows: must have at most 200 items'
		]
	])('rejects %s', (_label, data, message) => {
		expect(reason('table', data)).toBe(message);
	});
});
