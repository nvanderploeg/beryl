import { describe, expect, it } from 'vitest';
import { elementsOf } from '../elements.ts';
import { renderMarkdown } from './render.ts';

describe('markdown', () => {
	it('has no Elements', () => {
		expect(elementsOf({ key: 'm', type: 'markdown', data: { text: '# Hi' } })).toEqual([]);
	});

	it('escapes raw html instead of rendering it', () => {
		const html = renderMarkdown('<script>alert(1)</script> <b>bold</b>');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('opens links, written or bare, in a new tab without an opener', () => {
		const html = renderMarkdown('[spec](https://example.com/a) and https://example.com/b');
		const links = html.match(/<a [^>]*>/g) ?? [];
		expect(links).toHaveLength(2);
		for (const link of links) {
			expect(link).toContain('target="_blank"');
			expect(link).toContain('rel="noopener noreferrer"');
		}
	});

	it('highlights fenced code in a known language and escapes the rest', () => {
		expect(renderMarkdown('```sql\nSELECT 1;\n```')).toContain('hljs-keyword');
		const unknown = renderMarkdown('```cobol\n<x>\n```');
		expect(unknown).toContain('&lt;x&gt;');
		expect(unknown).not.toContain('hljs-');
	});
});
