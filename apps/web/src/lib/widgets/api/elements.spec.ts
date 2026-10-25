import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import { elementsOf } from '../elements.ts';
import { isTool, methodColor, pathParts } from './methods.ts';

function fixtureWidget(path: string, key: string): Widget {
	const found = (demo as DemoFixture).turns
		.flatMap((t) => t.nodes ?? [])
		.filter((n) => n.path === path)
		.flatMap((n) => n.widgets ?? [])
		.findLast((w) => w.key === key);
	if (!found) throw new Error(`no widget ${path} ${key}`);
	return found;
}

describe('api elements', () => {
	it('lists endpoint keys in order, labelled by method and path', () => {
		expect(elementsOf(fixtureWidget('invites/api', 'routes'))).toEqual([
			{ key: 'list-members', label: 'GET /api/workspaces/:slug/members' },
			{ key: 'invite', label: 'POST /api/workspaces/:slug/invites' },
			{ key: 'accept', label: 'POST /api/invites/:token/accept' },
			{ key: 'revoke', label: 'DELETE /api/workspaces/:slug/invites/:id' },
			{ key: 'tool-invite', label: 'TOOL invite_member' }
		]);
	});
});

describe('api methods', () => {
	it('splits out :param and {param} segments', () => {
		expect(pathParts('/api/:slug/x/{id}')).toEqual([
			{ text: '/api/', param: false },
			{ text: ':slug', param: true },
			{ text: '/x/', param: false },
			{ text: '{id}', param: true }
		]);
		expect(pathParts('invite_member')).toEqual([{ text: 'invite_member', param: false }]);
	});

	it('colors methods case-insensitively, with a neutral color for the rest', () => {
		expect(methodColor('get')).toBe(methodColor('GET'));
		expect(methodColor('DELETE')).toBe('var(--removed)');
		expect(methodColor('OPTIONS')).toBe('var(--parked)');
		expect(isTool('tool')).toBe(true);
		expect(isTool('POST')).toBe(false);
	});
});
