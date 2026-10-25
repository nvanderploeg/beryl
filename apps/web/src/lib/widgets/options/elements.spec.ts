import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import { scoreText, scoreTone } from './score.ts';

function demoWidgets(type: string): Widget[] {
	return (demo as DemoFixture).turns.flatMap((t) =>
		(t.nodes ?? []).flatMap((n) => (n.widgets ?? []).filter((w) => w.type === type))
	);
}

describe('options elements', () => {
	it('lists the matrix cells row by row, then the option cards, for the isolation options', () => {
		const [isolation] = demoWidgets('options');
		expect(elementsOf(isolation).map((e) => e.key)).toEqual([
			'row.effort',
			'schema.effort',
			'database.effort',
			'row.isolation',
			'schema.isolation',
			'database.isolation',
			'row.ops',
			'schema.ops',
			'database.ops',
			'row',
			'schema',
			'database'
		]);
	});

	it('labels cells by option title and criterion label', () => {
		const [isolation] = demoWidgets('options');
		const labels = elementsOf(isolation).map((e) => e.label);
		expect(labels[0]).toBe('Row-level workspace_id · Effort');
		expect(labels.at(-1)).toBe('Database per tenant');
	});

	it('lists only the options when there are no criteria', () => {
		const deploys = demoWidgets('options').find(
			(w) => !(w.data as { criteria?: unknown }).criteria
		)!;
		expect(elementsOf(deploys)).toEqual([
			{ key: 'one', label: 'One deploy' },
			{ key: 'two', label: 'Two deploys' }
		]);
	});
});

describe('option scores', () => {
	it('maps the five symbols to tones and anything else to text', () => {
		expect(['++', '+', '0', '-', '--', 'slow', undefined, ' '].map(scoreTone)).toEqual([
			'pp',
			'p',
			'z',
			'm',
			'mm',
			'text',
			'none',
			'none'
		]);
	});

	it('shows minus signs and a dot for a missing score', () => {
		expect([scoreText('-'), scoreText('--'), scoreText(undefined), scoreText('slow')]).toEqual([
			'−',
			'−−',
			'·',
			'slow'
		]);
	});
});
