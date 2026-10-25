import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('go', go);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerAliases(['svelte', 'vue', 'html', 'htm'], { languageName: 'xml' });
hljs.registerAliases(['mysql', 'postgres', 'postgresql', 'sqlite', 'pgsql'], {
	languageName: 'sql'
});

const escapes: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (c) => escapes[c]);
}

export function languageOf(language?: string, filename?: string): string | undefined {
	const declared = language?.trim().toLowerCase();
	if (declared && hljs.getLanguage(declared)) return declared;
	const ext = filename?.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase();
	if (ext && hljs.getLanguage(ext)) return ext;
	return undefined;
}

export function highlightHtml(code: string, language?: string): string {
	if (!language || !hljs.getLanguage(language)) return escapeHtml(code);
	return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

export function splitHtmlLines(html: string): string[] {
	const lines: string[] = [];
	const open: string[] = [];
	const tokens = /<span[^>]*>|<\/span>|\n/g;
	let line = '';
	let last = 0;
	for (const match of html.matchAll(tokens)) {
		line += html.slice(last, match.index);
		last = match.index + match[0].length;
		if (match[0] === '\n') {
			lines.push(line + '</span>'.repeat(open.length));
			line = open.join('');
		} else if (match[0] === '</span>') {
			open.pop();
			line += match[0];
		} else {
			open.push(match[0]);
			line += match[0];
		}
	}
	lines.push(line + html.slice(last));
	return lines;
}

export function highlightLines(lines: string[], language?: string): string[] {
	return splitHtmlLines(highlightHtml(lines.join('\n'), language));
}

export function guessLanguage(text: string): string {
	try {
		JSON.parse(text);
		return 'json';
	} catch {
		return 'typescript';
	}
}
