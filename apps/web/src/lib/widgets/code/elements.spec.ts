import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import type { CodeData } from '../types.ts';
import { elements } from './elements.ts';
import { escapeHtml, highlightLines, languageOf, splitHtmlLines } from '../shared/highlight.ts';
import { splitLines } from '../shared/lines.ts';

function fixtureWidget(path: string, key: string): Widget {
	const found = (demo as DemoFixture).turns
		.flatMap((t) => t.nodes ?? [])
		.filter((n) => n.path === path)
		.flatMap((n) => n.widgets ?? [])
		.findLast((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key}`);
	return found;
}

describe('code elements', () => {
	it('names every line of the fixture guard L1..L6 with filename:line labels', () => {
		const widget = fixtureWidget('permissions/check', 'guard');
		expect(elementsOf(widget)).toEqual(
			[1, 2, 3, 4, 5, 6].map((n) => ({ key: `L${n}`, label: `src/lib/server/can.ts:${n}` }))
		);
	});

	it('labels lines by number when there is no filename', () => {
		expect(elements({ code: 'a\nb' })).toEqual([
			{ key: 'L1', label: 'line 1' },
			{ key: 'L2', label: 'line 2' }
		]);
	});

	it('does not count the empty line after a trailing newline', () => {
		const data: CodeData = { code: 'one\ntwo\n' };
		expect(elements(data).map((e) => e.key)).toEqual(['L1', 'L2']);
	});

	it('treats CRLF and CR as line breaks', () => {
		expect(splitLines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
	});

	it('gives empty code one line', () => {
		expect(elements({ code: '' })).toEqual([{ key: 'L1', label: 'line 1' }]);
	});

	it('renders exactly as many highlighted lines as it has Elements', () => {
		const code = '/* a\n b */\nconst s = `x\ny`;\n';
		expect(highlightLines(splitLines(code), 'ts')).toHaveLength(elements({ code }).length);
	});
});

describe('highlight', () => {
	it('closes and reopens spans that cross a line break, so each line is well formed', () => {
		const lines = splitHtmlLines('<span class="a">one\n<span class="b">two\nthree</span></span>x');
		expect(lines).toEqual([
			'<span class="a">one</span>',
			'<span class="a"><span class="b">two</span></span>',
			'<span class="a"><span class="b">three</span></span>x'
		]);
	});

	it('escapes code in a language it does not know', () => {
		expect(highlightLines(['<b>&</b>'], 'cobol')).toEqual(['&lt;b&gt;&amp;&lt;/b&gt;']);
		expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
	});

	it('escapes markup inside highlighted code', () => {
		const [line] = highlightLines(['const a = "<img onerror=x>";'], 'ts');
		expect(line).not.toContain('<img');
		expect(line).toContain('&lt;img');
	});

	it('resolves a declared language, its aliases, then the filename extension', () => {
		expect(languageOf('ts')).toBe('ts');
		expect(languageOf('TypeScript')).toBe('typescript');
		expect(languageOf('svelte')).toBe('svelte');
		expect(languageOf(undefined, 'src/App.svelte')).toBe('svelte');
		expect(languageOf('mysql')).toBe('mysql');
		expect(languageOf('nope', 'x.py')).toBe('py');
		expect(languageOf('nope', 'Makefile')).toBeUndefined();
	});
});
