import { isUuid } from '#lib/ui/ids.ts';

export const SLUG_MAX = 48;

const FALLBACK = 'untitled';

export function slugify(text: string): string {
	const base = text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.slice(0, SLUG_MAX)
		.replace(/-+$/, '');
	const slug = base || FALLBACK;
	// A slug shaped like an id would shadow it in every resolver.
	return isUuid(slug) ? `x-${slug}` : slug;
}

// First free of `base`, `base-2`, `base-3`, …; `taken` holds the slugs already claimed.
export function claimSlug(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const suffix = `-${n}`;
		const candidate = base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '') + suffix;
		if (!taken.has(candidate)) return candidate;
	}
}
