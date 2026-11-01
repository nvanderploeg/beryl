import { describe, expect, it } from 'vitest';
import { claimSlug, SLUG_MAX, slugify } from './slug.ts';

describe('slugify', () => {
	it('lowercases and hyphenates', () => {
		expect(slugify('Attachment upload lifecycle')).toBe('attachment-upload-lifecycle');
	});

	it('strips accents and punctuation', () => {
		expect(slugify('  Café: what\'s "next"?  ')).toBe('cafe-what-s-next');
	});

	it('falls back when nothing survives', () => {
		expect(slugify('日本語 !!!')).toBe('untitled');
	});

	it('caps the length without a trailing hyphen', () => {
		const slug = slugify('word '.repeat(40));
		expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
		expect(slug.endsWith('-')).toBe(false);
	});

	it('never yields an id-shaped slug', () => {
		const slug = slugify('3a3364d6-f920-4ba9-a918-fdbab998509d');
		expect(slug).toBe('x-3a3364d6-f920-4ba9-a918-fdbab998509d'.slice(0, SLUG_MAX));
	});
});

describe('claimSlug', () => {
	it('takes the base when free', () => {
		expect(claimSlug('runestone', new Set())).toBe('runestone');
	});

	it('appends the first free number', () => {
		expect(claimSlug('runestone', new Set(['runestone']))).toBe('runestone-2');
		expect(claimSlug('runestone', new Set(['runestone', 'runestone-2']))).toBe('runestone-3');
	});

	it('keeps the suffix inside the cap', () => {
		const base = 'a'.repeat(SLUG_MAX);
		const claimed = claimSlug(base, new Set([base]));
		expect(claimed.length).toBeLessThanOrEqual(SLUG_MAX);
		expect(claimed.endsWith('-2')).toBe(true);
	});
});
