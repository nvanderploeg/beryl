// Widget data shapes of docs/widgets.md, exactly. Change that file first.

export type Change = 'added' | 'removed' | 'changed' | 'renamed';
export type Cell = string | number | boolean | null;
export type Visibility = '+' | '-' | '#' | '~';

export interface MarkdownData {
	text: string;
}

export interface CodeData {
	code: string;
	language?: string;
	filename?: string;
	highlight?: number[];
}

export interface SchemaColumn {
	name: string;
	type: string;
	nullable?: boolean;
	pk?: boolean;
	unique?: boolean;
	default?: string;
	references?: { table: string; column: string };
	note?: string;
	change?: Change;
	from?: string;
}

export interface SchemaIndex {
	name: string;
	columns: string[];
	unique?: boolean;
	change?: Change;
}

export interface SchemaTable {
	name: string;
	note?: string;
	change?: Change;
	from?: string;
	columns: SchemaColumn[];
	indexes?: SchemaIndex[];
}

export interface SchemaData {
	tables: SchemaTable[];
}

export interface MigrationColumn {
	name: string;
	change: Change | 'kept';
	before?: string;
	after?: string;
	note?: string;
}

export interface MigrationRow {
	key: string;
	change: 'added' | 'removed' | 'changed' | 'kept';
	values: Cell[];
	before?: Cell[];
}

export interface MigrationStep {
	key: string;
	op: 'create' | 'alter' | 'drop' | 'rename' | 'backfill' | 'data';
	table: string;
	to?: string;
	title?: string;
	note?: string;
	risk?: 'low' | 'medium' | 'high';
	reversible?: boolean;
	columns?: MigrationColumn[];
	rows?: { columns: string[]; items: MigrationRow[] };
	sql?: string;
}

export interface MigrationData {
	dialect?: string;
	steps: MigrationStep[];
}

export interface FileEntry {
	path: string;
	change?: Change;
	from?: string;
	summary?: string;
	added?: number;
	removed?: number;
}

export interface FilesData {
	root?: string;
	files: FileEntry[];
}

export interface ClassField {
	name: string;
	type?: string;
	visibility?: Visibility;
	static?: boolean;
	change?: Change;
}

export interface ClassMethod {
	name: string;
	params?: string;
	returns?: string;
	visibility?: Visibility;
	static?: boolean;
	abstract?: boolean;
	change?: Change;
}

export interface ClassDef {
	key: string;
	name: string;
	stereotype?: string;
	note?: string;
	change?: Change;
	from?: string;
	fields?: ClassField[];
	methods?: ClassMethod[];
}

export type ClassRelationKind =
	| 'inherits'
	| 'implements'
	| 'composes'
	| 'aggregates'
	| 'uses'
	| 'associates';

export interface ClassRelation {
	from: string;
	to: string;
	kind: ClassRelationKind;
	label?: string;
	fromCard?: string;
	toCard?: string;
	change?: Change;
}

export interface ClassesData {
	classes: ClassDef[];
	relations?: ClassRelation[];
}

export interface OptionDef {
	key: string;
	title: string;
	summary?: string;
	pros?: string[];
	cons?: string[];
	scores?: Record<string, string>;
	recommended?: boolean;
	chosen?: boolean;
}

export interface OptionsData {
	question?: string;
	criteria?: { key: string; label: string }[];
	options: OptionDef[];
}

export interface SequenceData {
	actors: { key: string; label: string; kind?: 'person' | 'service' | 'store' | 'external' }[];
	steps: {
		key: string;
		from: string;
		to: string;
		label: string;
		kind?: 'call' | 'reply' | 'async' | 'note';
		change?: Change;
	}[];
}

export interface StatesData {
	states: {
		key: string;
		label: string;
		kind?: 'initial' | 'final' | 'normal';
		note?: string;
		change?: Change;
	}[];
	transitions: { key?: string; from: string; to: string; label?: string; change?: Change }[];
}

export interface ApiData {
	endpoints: {
		key: string;
		method: string;
		path: string;
		summary?: string;
		auth?: string;
		request?: string;
		response?: string;
		change?: Change;
	}[];
}

export interface TableData {
	columns: string[];
	rows: { key: string; cells: Cell[]; change?: Change }[];
}

export interface WidgetDataMap {
	markdown: MarkdownData;
	code: CodeData;
	schema: SchemaData;
	migration: MigrationData;
	files: FilesData;
	classes: ClassesData;
	options: OptionsData;
	sequence: SequenceData;
	states: StatesData;
	api: ApiData;
	table: TableData;
}

export interface WidgetViewProps {
	widget: import('#lib/types.ts').Widget;
	lod: 'preview' | 'full';
	marks?: Record<string, number>;
	selected?: string | null;
	onselect?: (element: string) => void;
}
