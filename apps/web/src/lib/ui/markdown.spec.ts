import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
	it('renders markdown', () => {
		expect(renderMarkdown('**bold** and `code`')).toBe(
			'<p><strong>bold</strong> and <code>code</code></p>\n'
		);
	});

	it('escapes raw html instead of passing it through', () => {
		const out = renderMarkdown('<script>alert(1)</script><b>x</b>');
		expect(out).not.toContain('<script>');
		expect(out).toContain('&lt;script&gt;');
	});

	it('opens links in a new tab without an opener', () => {
		expect(renderMarkdown('[docs](https://example.com)')).toContain(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>'
		);
	});

	it('linkifies bare urls with the same attributes', () => {
		expect(renderMarkdown('see https://example.com/x')).toContain(
			'target="_blank" rel="noopener noreferrer"'
		);
	});

	it('refuses javascript: links', () => {
		expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript:');
	});

	it('treats an empty string as empty output', () => {
		expect(renderMarkdown('')).toBe('');
	});
});
