import MarkdownIt from 'markdown-it';
import { highlightHtml, languageOf } from '../shared/highlight.ts';

const md = new MarkdownIt({
	html: false,
	linkify: true,
	highlight: (code, lang) => {
		const language = languageOf(lang);
		return language ? highlightHtml(code, language) : '';
	}
});

const renderLinkOpen = md.renderer.rules.link_open;

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	tokens[idx].attrSet('target', '_blank');
	tokens[idx].attrSet('rel', 'noopener noreferrer');
	return renderLinkOpen
		? renderLinkOpen(tokens, idx, options, env, self)
		: self.renderToken(tokens, idx, options);
};

export function renderMarkdown(text: string): string {
	return md.render(text);
}
