import type { Widget } from '#lib/types.ts';
import { elements as markdownElements } from './markdown/elements.ts';
import { elements as codeElements } from './code/elements.ts';
import { elements as schemaElements } from './schema/elements.ts';
import { elements as migrationElements } from './migration/elements.ts';
import { elements as filesElements } from './files/elements.ts';
import { elements as classesElements } from './classes/elements.ts';
import { elements as optionsElements } from './options/elements.ts';
import { elements as sequenceElements } from './sequence/elements.ts';
import { elements as statesElements } from './states/elements.ts';
import { elements as apiElements } from './api/elements.ts';
import { elements as tableElements } from './table/elements.ts';

const byType: Record<string, (data: never) => { key: string; label: string }[]> = {
	markdown: markdownElements,
	code: codeElements,
	schema: schemaElements,
	migration: migrationElements,
	files: filesElements,
	classes: classesElements,
	options: optionsElements,
	sequence: sequenceElements,
	states: statesElements,
	api: apiElements,
	table: tableElements
};

export function elementsOf(widget: Widget): { key: string; label: string }[] {
	const list = byType[widget?.type];
	if (!list) return [];
	try {
		return list(widget.data as never);
	} catch {
		return [];
	}
}
