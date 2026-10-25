import { describe, expect, it } from 'vitest';
import demo from '#lib/fixtures/demo-grill.json' with { type: 'json' };
import type { DemoFixture } from '#lib/fixtures/types.ts';
import type { Widget } from '#lib/types.ts';
import type { ClassesData } from '../types.ts';
import { elementsOf } from '../elements.ts';
import { elements } from './elements.ts';

function demoWidgets(type: string): Widget[] {
	return (demo as DemoFixture).turns.flatMap((t) =>
		(t.nodes ?? []).flatMap((n) => (n.widgets ?? []).filter((w) => w.type === type))
	);
}

describe('classes elements', () => {
	it('lists each class, its fields, then its methods, then relations, for the demo services', () => {
		const [services] = demoWidgets('classes');
		expect(elementsOf(services).map((e) => e.key)).toEqual([
			'WorkspaceService',
			'WorkspaceService.create()',
			'WorkspaceService.forUser()',
			'MembershipService',
			'MembershipService.roleOf()',
			'MembershipService.setRole()',
			'InviteService',
			'InviteService.ttl',
			'InviteService.invite()',
			'InviteService.accept()',
			'Role',
			'Role.owner',
			'Role.admin',
			'Role.member',
			'Role.guest',
			'RealmService',
			'RealmService.forOwner()',
			'RealmService.forWorkspace()',
			'InviteService->MembershipService',
			'MembershipService->Role',
			'WorkspaceService->MembershipService',
			'RealmService->WorkspaceService'
		]);
	});

	it('labels members by class name and relations by their kind', () => {
		const [services] = demoWidgets('classes');
		const labels = Object.fromEntries(elementsOf(services).map((e) => [e.key, e.label]));
		expect(labels['InviteService.ttl']).toBe('InviteService.ttl');
		expect(labels['RealmService.forWorkspace()']).toBe('RealmService.forWorkspace()');
		expect(labels['InviteService->MembershipService']).toBe('InviteService uses MembershipService');
	});

	it('appends :kind only to relations that share both ends', () => {
		const data: ClassesData = {
			classes: [
				{ key: 'A', name: 'Alpha' },
				{ key: 'B', name: 'Beta' }
			],
			relations: [
				{ from: 'A', to: 'B', kind: 'inherits' },
				{ from: 'A', to: 'B', kind: 'uses' },
				{ from: 'B', to: 'A', kind: 'uses' }
			]
		};
		expect(elements(data).map((e) => e.key)).toEqual([
			'A',
			'B',
			'A->B:inherits',
			'A->B:uses',
			'B->A'
		]);
	});

	it('keys members by class key, not by display name', () => {
		const data: ClassesData = {
			classes: [
				{ key: 'svc', name: 'Service', fields: [{ name: 'x' }], methods: [{ name: 'run' }] }
			]
		};
		expect(elements(data)).toEqual([
			{ key: 'svc', label: 'Service' },
			{ key: 'svc.x', label: 'Service.x' },
			{ key: 'svc.run()', label: 'Service.run()' }
		]);
	});
});
