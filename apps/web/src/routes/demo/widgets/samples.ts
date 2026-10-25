import type { Widget } from '#lib/types.ts';

// Add edge cases the fixture does not reach here; gallery.spec.ts validates each one.
export const samples: { path: string; widget: Widget }[] = [
	{
		path: 'samples/schema',
		widget: {
			key: 'erd',
			type: 'schema',
			title: 'Billing tables',
			data: {
				tables: [
					{
						name: 'invoices',
						from: 'bills',
						change: 'renamed',
						note: 'One per workspace per month',
						columns: [
							{ name: 'id', type: 'bigint', pk: true },
							{
								name: 'workspace_id',
								type: 'bigint',
								references: { table: 'workspaces', column: 'id' }
							},
							{
								name: 'total_cents',
								type: 'integer',
								default: '0',
								change: 'changed',
								note: 'was a decimal'
							},
							{
								name: 'paid_at',
								type: 'datetime',
								nullable: true,
								change: 'added'
							},
							{ name: 'legacy_ref', type: 'varchar(40)', unique: true, change: 'removed' }
						],
						indexes: [
							{ name: 'invoices_ws_month', columns: ['workspace_id', 'id'], unique: true },
							{ name: 'bills_legacy_idx', columns: ['legacy_ref'], change: 'removed' }
						]
					},
					{
						name: 'invoice_lines',
						change: 'added',
						columns: [
							{ name: 'id', type: 'bigint', pk: true, change: 'added' },
							{
								name: 'invoice_id',
								type: 'bigint',
								references: { table: 'invoices', column: 'id' },
								change: 'added'
							},
							{
								name: 'sku',
								type: 'varchar(32)',
								references: { table: 'products', column: 'sku' },
								change: 'added'
							},
							{ name: 'cents', type: 'integer', change: 'added' }
						]
					},
					{
						name: 'coupons',
						change: 'removed',
						columns: [
							{ name: 'code', type: 'varchar(16)', pk: true, change: 'removed' },
							{ name: 'percent', type: 'tinyint', change: 'removed' }
						]
					}
				]
			}
		}
	},
	{
		path: 'samples/migration',
		widget: {
			key: 'risky',
			type: 'migration',
			title: 'Billing migration',
			data: {
				dialect: 'postgres',
				steps: [
					{
						key: 'rename-bills',
						op: 'rename',
						table: 'bills',
						to: 'invoices',
						risk: 'low',
						reversible: true
					},
					{
						key: 'retype-total',
						op: 'alter',
						table: 'invoices',
						title: 'Store totals in cents',
						risk: 'high',
						reversible: false,
						note: 'Rounds half-cents up; the old decimal column is dropped in the same transaction.',
						columns: [
							{
								name: 'total_cents',
								change: 'changed',
								before: 'total decimal(10,2) not null',
								after: 'total_cents integer not null default 0',
								note: 'multiplied by 100'
							},
							{ name: 'paid_at', change: 'added', after: 'timestamptz null' },
							{ name: 'legacy_ref', change: 'removed', before: 'varchar(40) unique' },
							{ name: 'id', change: 'kept', before: 'bigint', after: 'bigint' }
						],
						rows: {
							columns: ['id', 'workspace', 'total', 'currency', 'paid_at', 'status', 'memo'],
							items: [
								{
									key: 'inv-1',
									change: 'changed',
									values: [1, 'acme', 1999, 'USD', null, 'open', 'first invoice'],
									before: [1, 'acme', 19.99, 'USD', null, 'open', 'first invoice']
								},
								{
									key: 'inv-2',
									change: 'kept',
									values: [2, 'globex', 0, 'EUR', '2026-09-30', 'paid', '']
								},
								{
									key: 'inv-3',
									change: 'removed',
									values: [3, 'initech', 500, 'USD', null, 'void', 'duplicate of inv-1']
								},
								{
									key: 'inv-4',
									change: 'added',
									values: [4, 'acme', 2500, 'USD', null, 'open', 'seat upgrade']
								}
							]
						},
						sql: 'ALTER TABLE invoices ADD COLUMN total_cents integer NOT NULL DEFAULT 0;\nUPDATE invoices SET total_cents = ceil(total * 100);\nALTER TABLE invoices DROP COLUMN total;'
					},
					{
						key: 'drop-coupons',
						op: 'drop',
						table: 'coupons',
						risk: 'medium',
						reversible: false,
						sql: 'DROP TABLE coupons;'
					}
				]
			}
		}
	},
	{
		path: 'samples/files',
		widget: {
			key: 'tree',
			type: 'files',
			data: {
				files: [
					{ path: 'README.md', change: 'changed', added: 3, removed: 1 },
					{
						path: 'packages/billing/src/invoice.ts',
						change: 'added',
						summary: 'Invoice totals in integer cents, with rounding rules spelled out',
						added: 212
					},
					{
						path: 'packages/billing/src/invoice.spec.ts',
						change: 'added',
						added: 148
					},
					{
						path: 'packages/billing/src/money.ts',
						change: 'renamed',
						from: 'packages/billing/src/decimal.ts',
						added: 12,
						removed: 30
					},
					{ path: 'packages/billing/src/coupons.ts', change: 'removed', removed: 96 },
					{ path: 'packages/billing/package.json', summary: 'Unchanged; read for exports' }
				]
			}
		}
	},
	{
		path: 'samples/api',
		widget: {
			key: 'methods',
			type: 'api',
			title: 'Billing API',
			data: {
				endpoints: [
					{
						key: 'get',
						method: 'GET',
						path: '/api/invoices/{id}',
						auth: 'member',
						summary: 'One invoice with its lines',
						response: '{"id": 1, "total_cents": 1999, "lines": []}'
					},
					{
						key: 'put',
						method: 'PUT',
						path: '/api/invoices/{id}/memo',
						summary: 'Replace the memo',
						change: 'changed',
						request: '{ memo: string }'
					},
					{
						key: 'patch',
						method: 'PATCH',
						path: '/api/invoices/{id}',
						change: 'added'
					},
					{
						key: 'delete',
						method: 'DELETE',
						path: '/api/coupons/:code',
						auth: 'owner',
						change: 'removed'
					},
					{ key: 'head', method: 'HEAD', path: '/api/health' },
					{
						key: 'tool',
						method: 'TOOL',
						path: 'refund_invoice',
						summary: 'MCP: refund an invoice in full',
						request: '{ invoice: number; reason?: string }',
						change: 'renamed'
					}
				]
			}
		}
	},
	{
		path: 'samples/table',
		widget: {
			key: 'cells',
			type: 'table',
			title: 'Cell kinds',
			data: {
				columns: ['Name', 'Seats', 'Active', 'Trial', 'Ends', 'Notes', 'Region', 'Plan'],
				rows: [
					{ key: 'acme', cells: ['Acme', 12, true, false, null, 'annual', 'us', 'team'] },
					{
						key: 'globex',
						cells: ['Globex', 3, true, true, '2026-11-01', 'renews monthly', 'eu', 'starter'],
						change: 'changed'
					},
					{
						key: 'initech',
						cells: ['Initech', 0, false, false, null, '', 'us', 'free'],
						change: 'removed'
					},
					{ key: 'hooli', cells: ['Hooli', 140, true, false, null, null, 'ap', 'enterprise'] },
					{ key: 'umbrella', cells: ['Umbrella', 8, true, false, null, null, 'eu', 'team'] },
					{ key: 'soylent', cells: ['Soylent', 25, true, false, null, null, 'us', 'team'] },
					{
						key: 'tyrell',
						cells: ['Tyrell', 2, true, true, '2026-12-01', null, 'us', 'starter'],
						change: 'added'
					}
				]
			}
		}
	},
	{
		path: 'samples/code',
		widget: {
			key: 'long',
			type: 'code',
			title: 'Rounding',
			data: {
				language: 'python',
				filename: 'billing/rounding.py',
				highlight: [12, 13],
				code: [
					'from decimal import Decimal, ROUND_HALF_UP',
					'',
					'',
					'def to_cents(amount: Decimal) -> int:',
					'    """Convert a decimal amount to integer cents, rounding half-cents up so totals never under-bill a customer."""',
					'    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))',
					'',
					'',
					'def total(lines: list[dict]) -> int:',
					'    cents = 0',
					'    for line in lines:',
					"        cents += to_cents(Decimal(line['amount']))",
					"        cents -= line.get('discount', 0)",
					'    return max(cents, 0)',
					''
				].join('\n')
			}
		}
	},
	{
		path: 'samples/markdown',
		widget: {
			key: 'notes',
			type: 'markdown',
			title: 'Open points',
			data: {
				text: [
					'# Billing rewrite',
					'',
					'See https://example.com/spec and [the RFC](https://example.com/rfc).',
					'',
					'1. Cents everywhere',
					'2. Coupons go away',
					'   - existing ones are honoured until **2027**',
					'',
					'> Raw <b>html</b> stays text.',
					'',
					'| plan | seats |',
					'| --- | --- |',
					'| team | 10 |',
					'',
					'```sql',
					'SELECT id, total_cents FROM invoices WHERE paid_at IS NULL;',
					'```'
				].join('\n')
			}
		}
	}
];
