// The checks of docs/widgets.md. Pure: the views run it in the browser, so never import server code.
import { WIDGET_TYPES, type Widget, type WidgetType } from '#lib/types.ts';
import type {
	ApiData,
	ClassesData,
	FilesData,
	MigrationData,
	OptionsData,
	SchemaData,
	SequenceData,
	StatesData,
	TableData
} from '#lib/widgets/types.ts';

export type WidgetResult = { ok: true; widget: Widget } | { ok: false; reason: string };

const WIDGET_KEY = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_TITLE = 120;
const MAX_DATA_BYTES = 65_536;
const LIST = 200;
const CHANGES = ['added', 'removed', 'changed', 'renamed'] as const;
const VISIBILITIES = ['+', '-', '#', '~'] as const;

class Invalid extends Error {}

type Check = (value: unknown, at: string) => void;
type Fields = Record<string, Check>;

function fail(at: string, problem: string): never {
	throw new Invalid(`${at || 'data'}: ${problem}`);
}

const field = (at: string, name: string) => (at ? `${at}.${name}` : name);

function isPlain(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(max: number, opts: { empty?: boolean; line?: boolean } = {}): Check {
	return (value, at) => {
		if (typeof value !== 'string') fail(at, 'must be a string');
		if (!opts.empty && value === '') fail(at, 'must not be empty');
		if (value.length > max) fail(at, `must be at most ${max} characters`);
		if (opts.line && /[\r\n]/.test(value)) fail(at, 'must be a single line');
	};
}

// Keys and names build Element keys, which never contain a newline.
const key = str(64, { line: true });
const name = str(200, { line: true });
const label = str(200, { empty: true });
const note = str(1000, { empty: true });
const blob = str(20_000, { empty: true });
const filePath = str(512, { line: true });

const bool: Check = (value, at) => {
	if (typeof value !== 'boolean') fail(at, 'must be a boolean');
};

function int(min: number): Check {
	return (value, at) => {
		if (!Number.isSafeInteger(value) || (value as number) < min) {
			fail(at, `must be an integer of at least ${min}`);
		}
	};
}

function oneOf(...values: readonly string[]): Check {
	return (value, at) => {
		if (typeof value !== 'string' || !values.includes(value)) {
			fail(at, `must be one of ${values.join(', ')}`);
		}
	};
}

const change = oneOf(...CHANGES);
const visibility = oneOf(...VISIBILITIES);

const cell: Check = (value, at) => {
	if (value === null || typeof value === 'boolean') return;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) fail(at, 'must be a finite number');
		return;
	}
	if (typeof value === 'string') return note(value, at);
	fail(at, 'must be a string, number, boolean or null');
};

function list(item: Check, max = LIST, min = 0): Check {
	return (value, at) => {
		if (!Array.isArray(value)) fail(at, 'must be an array');
		if (value.length < min) fail(at, `must have at least ${min} item${min === 1 ? '' : 's'}`);
		if (value.length > max) fail(at, `must have at most ${max} items`);
		value.forEach((entry, index) => item(entry, `${at}[${index}]`));
	};
}

function record(item: Check): Check {
	return (value, at) => {
		if (!isPlain(value)) fail(at, 'must be an object');
		for (const [name, entry] of Object.entries(value)) item(entry, field(at, name));
	};
}

function shape(required: Fields, optional: Fields = {}, opts: { renamable?: boolean } = {}): Check {
	return (value, at) => {
		if (!isPlain(value)) fail(at, 'must be an object');
		for (const name of Object.keys(value)) {
			if (!(name in required) && !(name in optional)) fail(at, `unknown field "${name}"`);
		}
		for (const [name, check] of Object.entries(required)) {
			if (value[name] === undefined) fail(field(at, name), 'required');
			check(value[name], field(at, name));
		}
		for (const [name, check] of Object.entries(optional)) {
			if (value[name] !== undefined) check(value[name], field(at, name));
		}
		if (opts.renamable && value.from !== undefined && value.change !== 'renamed') {
			fail(field(at, 'from'), 'only allowed with change "renamed"');
		}
	};
}

function unique<T>(items: readonly T[], name: keyof T & string, at: string): Set<string> {
	const seen = new Set<string>();
	items.forEach((item, index) => {
		const value = String(item[name]);
		if (seen.has(value)) fail(`${at}[${index}].${name}`, `duplicate "${value}"`);
		seen.add(value);
	});
	return seen;
}

const markdown = shape({ text: blob });

const code = shape(
	{ code: blob },
	{ language: str(64, { line: true }), filename: filePath, highlight: list(int(1)) }
);

const schemaShape = shape({
	tables: list(
		shape(
			{
				name,
				columns: list(
					shape(
						{ name, type: label },
						{
							nullable: bool,
							pk: bool,
							unique: bool,
							default: label,
							references: shape({ table: name, column: name }),
							note,
							change,
							from: name
						},
						{ renamable: true }
					)
				)
			},
			{
				note,
				change,
				from: name,
				indexes: list(shape({ name, columns: list(name) }, { unique: bool, change }))
			},
			{ renamable: true }
		),
		60
	)
});

function schema(value: unknown, at: string): void {
	schemaShape(value, at);
	const data = value as SchemaData;
	unique(data.tables, 'name', 'tables');
	data.tables.forEach((table, index) => {
		unique(table.columns, 'name', `tables[${index}].columns`);
	});
}

const migrationShape = shape(
	{
		steps: list(
			shape(
				{
					key,
					op: oneOf('create', 'alter', 'drop', 'rename', 'backfill', 'data'),
					table: name
				},
				{
					to: name,
					title: label,
					note,
					risk: oneOf('low', 'medium', 'high'),
					reversible: bool,
					columns: list(
						shape(
							{ name, change: oneOf(...CHANGES, 'kept') },
							{ before: label, after: label, note }
						)
					),
					rows: shape({
						columns: list(name, 30),
						items: list(
							shape(
								{
									key,
									change: oneOf('added', 'removed', 'changed', 'kept'),
									values: list(cell, 30)
								},
								{ before: list(cell, 30) }
							)
						)
					}),
					sql: blob
				}
			),
			100
		)
	},
	{ dialect: str(64, { line: true }) }
);

function migration(value: unknown, at: string): void {
	migrationShape(value, at);
	const data = value as MigrationData;
	unique(data.steps, 'key', 'steps');
	data.steps.forEach((step, index) => {
		const where = `steps[${index}]`;
		if (step.to !== undefined && step.op !== 'rename') {
			fail(`${where}.to`, 'only allowed with op "rename"');
		}
		step.columns?.forEach((column, c) => {
			if (column.change === 'added' && column.before !== undefined) {
				fail(`${where}.columns[${c}].before`, 'not allowed on an added column');
			}
			if (column.change === 'removed' && column.after !== undefined) {
				fail(`${where}.columns[${c}].after`, 'not allowed on a removed column');
			}
		});
		if (!step.rows) return;
		const width = step.rows.columns.length;
		unique(step.rows.items, 'key', `${where}.rows.items`);
		step.rows.items.forEach((row, r) => {
			const item = `${where}.rows.items[${r}]`;
			if (row.values.length !== width) {
				fail(`${item}.values`, `must have ${width} cells, one per column`);
			}
			if (row.before === undefined) return;
			if (row.change !== 'changed') fail(`${item}.before`, 'only allowed on changed rows');
			if (row.before.length !== width) {
				fail(`${item}.before`, `must have ${width} cells, one per column`);
			}
		});
	});
}

const filesShape = shape(
	{
		files: list(
			shape(
				{ path: filePath },
				{ change, from: filePath, summary: note, added: int(0), removed: int(0) },
				{ renamable: true }
			),
			500
		)
	},
	{ root: str(512, { empty: true, line: true }) }
);

function files(value: unknown, at: string): void {
	filesShape(value, at);
	unique((value as FilesData).files, 'path', 'files');
}

const classesShape = shape(
	{
		classes: list(
			shape(
				{ key, name },
				{
					stereotype: str(64, { line: true }),
					note,
					change,
					from: name,
					fields: list(shape({ name }, { type: label, visibility, static: bool, change })),
					methods: list(
						shape(
							{ name },
							{
								params: label,
								returns: label,
								visibility,
								static: bool,
								abstract: bool,
								change
							}
						)
					)
				},
				{ renamable: true }
			),
			60
		)
	},
	{
		relations: list(
			shape(
				{
					from: key,
					to: key,
					kind: oneOf('inherits', 'implements', 'composes', 'aggregates', 'uses', 'associates')
				},
				{ label, fromCard: str(64), toCard: str(64), change }
			)
		)
	}
);

function classes(value: unknown, at: string): void {
	classesShape(value, at);
	const data = value as ClassesData;
	const keys = unique(data.classes, 'key', 'classes');
	data.relations?.forEach((relation, index) => {
		for (const end of ['from', 'to'] as const) {
			if (!keys.has(relation[end])) {
				fail(`relations[${index}].${end}`, `unknown class "${relation[end]}"`);
			}
		}
	});
}

const optionsShape = shape(
	{
		options: list(
			shape(
				{ key, title: name },
				{
					summary: note,
					pros: list(note),
					cons: list(note),
					scores: record(label),
					recommended: bool,
					chosen: bool
				}
			),
			12,
			1
		)
	},
	{ question: note, criteria: list(shape({ key, label: name }), 12) }
);

function options(value: unknown, at: string): void {
	optionsShape(value, at);
	const data = value as OptionsData;
	const criteria = unique(data.criteria ?? [], 'key', 'criteria');
	unique(data.options, 'key', 'options');
	for (const flag of ['recommended', 'chosen'] as const) {
		const marked = data.options.flatMap((option, index) => (option[flag] ? [index] : []));
		if (marked.length > 1) fail(`options[${marked[1]}].${flag}`, `only one option may be ${flag}`);
	}
	data.options.forEach((option, index) => {
		for (const criterion of Object.keys(option.scores ?? {})) {
			if (!criteria.has(criterion)) {
				fail(`options[${index}].scores`, `"${criterion}" is not a criterion key`);
			}
		}
	});
}

const sequenceShape = shape({
	actors: list(
		shape({ key, label }, { kind: oneOf('person', 'service', 'store', 'external') }),
		20,
		1
	),
	steps: list(
		shape(
			{ key, from: key, to: key, label },
			{ kind: oneOf('call', 'reply', 'async', 'note'), change }
		)
	)
});

function sequence(value: unknown, at: string): void {
	sequenceShape(value, at);
	const data = value as SequenceData;
	const actors = unique(data.actors, 'key', 'actors');
	unique(data.steps, 'key', 'steps');
	data.steps.forEach((step, index) => {
		if (actors.has(step.key)) fail(`steps[${index}].key`, `"${step.key}" is already an actor key`);
		for (const end of ['from', 'to'] as const) {
			if (!actors.has(step[end])) fail(`steps[${index}].${end}`, `unknown actor "${step[end]}"`);
		}
	});
}

const statesShape = shape({
	states: list(
		shape({ key, label }, { kind: oneOf('initial', 'final', 'normal'), note, change }),
		60,
		1
	),
	transitions: list(shape({ from: key, to: key }, { key, label, change }))
});

function states(value: unknown, at: string): void {
	statesShape(value, at);
	const data = value as StatesData;
	const stateKeys = unique(data.states, 'key', 'states');
	const seen = new Set<string>();
	data.transitions.forEach((transition, index) => {
		const where = `transitions[${index}]`;
		for (const end of ['from', 'to'] as const) {
			if (!stateKeys.has(transition[end])) {
				fail(`${where}.${end}`, `unknown state "${transition[end]}"`);
			}
		}
		const own = transition.key ?? `${transition.from}->${transition.to}`;
		const keyAt = transition.key === undefined ? where : `${where}.key`;
		if (stateKeys.has(own)) fail(keyAt, `"${own}" is already a state key`);
		if (seen.has(own)) {
			fail(keyAt, `duplicate "${own}"${transition.key === undefined ? '; give it a key' : ''}`);
		}
		seen.add(own);
	});
}

const apiShape = shape({
	endpoints: list(
		shape(
			{ key, method: str(32, { line: true }), path: str(512, { line: true }) },
			{ summary: note, auth: label, request: blob, response: blob, change }
		)
	)
});

function api(value: unknown, at: string): void {
	apiShape(value, at);
	unique((value as ApiData).endpoints, 'key', 'endpoints');
}

const tableShape = shape({
	columns: list(str(200, { empty: true, line: true }), 30, 1),
	rows: list(shape({ key, cells: list(cell, 30) }, { change }))
});

function table(value: unknown, at: string): void {
	tableShape(value, at);
	const data = value as TableData;
	unique(data.rows, 'key', 'rows');
	data.rows.forEach((row, index) => {
		if (row.cells.length !== data.columns.length) {
			fail(`rows[${index}].cells`, `must have ${data.columns.length} cells, one per column`);
		}
	});
}

const DATA: Record<WidgetType, Check> = {
	markdown,
	code,
	schema,
	migration,
	files,
	classes,
	options,
	sequence,
	states,
	api,
	table
};

function serialisedBytes(data: unknown): number {
	try {
		return new TextEncoder().encode(JSON.stringify(data)).length;
	} catch {
		throw new Invalid('data: must be plain JSON');
	}
}

export function validateWidget(widget: unknown): WidgetResult {
	try {
		if (!isPlain(widget)) throw new Invalid('widget must be an object');
		for (const name of Object.keys(widget)) {
			if (!['key', 'type', 'title', 'data'].includes(name)) {
				throw new Invalid(`unknown field "${name}"`);
			}
		}
		if (typeof widget.key !== 'string' || !WIDGET_KEY.test(widget.key)) {
			throw new Invalid(`key: must match ${WIDGET_KEY}`);
		}
		if (!WIDGET_TYPES.includes(widget.type as WidgetType)) {
			throw new Invalid(`type: must be one of ${WIDGET_TYPES.join(', ')}`);
		}
		if (
			widget.title !== undefined &&
			(typeof widget.title !== 'string' || widget.title.length > MAX_TITLE)
		) {
			throw new Invalid(`title: must be a string of at most ${MAX_TITLE} characters`);
		}
		if (widget.data === undefined) throw new Invalid('data: required');
		if (serialisedBytes(widget.data) > MAX_DATA_BYTES) {
			throw new Invalid(`data: must be at most ${MAX_DATA_BYTES} bytes serialised`);
		}
		DATA[widget.type as WidgetType](widget.data, '');
		return { ok: true, widget: widget as unknown as Widget };
	} catch (error) {
		if (error instanceof Invalid) return { ok: false, reason: error.message };
		throw error;
	}
}
