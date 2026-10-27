export type PanelId = 'questions' | 'details' | 'notes' | 'history';
export type Dock = 'left' | 'right' | 'bottom';

export const PANELS: { id: PanelId; label: string }[] = [
	{ id: 'questions', label: 'Questions' },
	{ id: 'details', label: 'Details' },
	{ id: 'notes', label: 'Notes' },
	{ id: 'history', label: 'History' }
];

export const DOCKS: Dock[] = ['left', 'right', 'bottom'];

export interface Group {
	id: string;
	panels: PanelId[];
	active: PanelId;
	/** Share of the zone's cross-axis; only ratios between sibling groups matter. */
	weight: number;
}

export interface Zone {
	/** Pixels along the axis facing the stage: width for left and right, height for bottom. */
	size: number;
	collapsed: boolean;
	groups: Group[];
}

export type Layout = Record<Dock, Zone>;

export const ZONE_MIN: Record<Dock, number> = { left: 200, right: 260, bottom: 120 };
export const GROUP_MIN_WEIGHT = 0.1;
export const STAGE_MIN = 320;

const DEFAULT_SIZE: Record<Dock, number> = { left: 300, right: 420, bottom: 260 };

function group(id: string, panels: PanelId[], weight = 1): Group {
	return { id, panels, active: panels[0], weight };
}

export function defaultLayout(): Layout {
	return {
		left: { size: DEFAULT_SIZE.left, collapsed: false, groups: [group('g1', ['questions'])] },
		right: {
			size: DEFAULT_SIZE.right,
			collapsed: false,
			groups: [group('g2', ['details', 'history'], 3), group('g3', ['notes'], 2)]
		},
		bottom: { size: DEFAULT_SIZE.bottom, collapsed: false, groups: [] }
	};
}

export function defaultSize(dock: Dock): number {
	return DEFAULT_SIZE[dock];
}

/** Small screens get fixed chrome: a questions drawer and one tabbed sheet. */
export function narrowLayout(): Layout {
	return {
		left: { size: 340, collapsed: false, groups: [group('g1', ['questions'])] },
		right: {
			size: 0,
			collapsed: false,
			groups: [group('g2', ['details', 'notes', 'history'])]
		},
		bottom: { size: 0, collapsed: false, groups: [] }
	};
}

export function locate(layout: Layout, panel: PanelId): { dock: Dock; group: Group } | null {
	for (const dock of DOCKS) {
		for (const g of layout[dock].groups) if (g.panels.includes(panel)) return { dock, group: g };
	}
	return null;
}

function clone(layout: Layout): Layout {
	return JSON.parse(JSON.stringify(layout)) as Layout;
}

function nextGroupId(layout: Layout): string {
	let max = 0;
	for (const dock of DOCKS) {
		for (const g of layout[dock].groups) max = Math.max(max, Number(g.id.slice(1)) || 0);
	}
	return `g${max + 1}`;
}

/** Takes the panel out of its group, dropping the group if it empties. */
function detach(layout: Layout, panel: PanelId): void {
	for (const dock of DOCKS) {
		const zone = layout[dock];
		for (const g of zone.groups) {
			const at = g.panels.indexOf(panel);
			if (at === -1) continue;
			g.panels.splice(at, 1);
			if (g.active === panel) g.active = g.panels[Math.min(at, g.panels.length - 1)];
			if (g.panels.length === 0) zone.groups = zone.groups.filter((x) => x !== g);
			return;
		}
	}
}

/** Adds the panel to an existing group's tabs, before `beforePanel` or at the end. */
export function moveToTabs(
	layout: Layout,
	panel: PanelId,
	groupId: string,
	beforePanel?: PanelId
): Layout {
	const next = clone(layout);
	const target = DOCKS.flatMap((d) => next[d].groups).find((g) => g.id === groupId);
	if (!target) return layout;
	if (target.panels.length === 1 && target.panels[0] === panel) return layout;
	detach(next, panel);
	const live = DOCKS.flatMap((d) => next[d].groups).find((g) => g.id === groupId);
	if (!live) return layout;
	const at = beforePanel ? live.panels.indexOf(beforePanel) : -1;
	if (at === -1) live.panels.push(panel);
	else live.panels.splice(at, 0, panel);
	live.active = panel;
	const home = locate(next, panel);
	if (home) next[home.dock].collapsed = false;
	return next;
}

/** Puts the panel in a new group of the zone, before `beforeGroupId` or at the end. */
export function moveToZone(
	layout: Layout,
	panel: PanelId,
	dock: Dock,
	beforeGroupId?: string
): Layout {
	const next = clone(layout);
	const current = locate(next, panel);
	if (current && current.group.panels.length === 1) {
		const zone = next[current.dock];
		const at = zone.groups.indexOf(current.group);
		const beforeIdx = beforeGroupId ? zone.groups.findIndex((g) => g.id === beforeGroupId) : -1;
		const staysPut =
			current.dock === dock &&
			(beforeGroupId === current.group.id ||
				(beforeIdx === -1 ? at === zone.groups.length - 1 : beforeIdx === at + 1));
		if (staysPut) return layout;
	}
	const survivor = next[dock].groups.find((g) => g.id === beforeGroupId)?.id;
	detach(next, panel);
	const zone = next[dock];
	const fresh = group(nextGroupId(next), [panel]);
	const peers = zone.groups.length;
	if (peers) fresh.weight = zone.groups.reduce((sum, g) => sum + g.weight, 0) / peers;
	const at = survivor ? zone.groups.findIndex((g) => g.id === survivor) : -1;
	if (at === -1) zone.groups.push(fresh);
	else zone.groups.splice(at, 0, fresh);
	zone.collapsed = false;
	return next;
}

/** Makes the panel the visible tab of its group and opens its zone. */
export function reveal(layout: Layout, panel: PanelId): Layout {
	const home = locate(layout, panel);
	if (!home) return layout;
	if (home.group.active === panel && !layout[home.dock].collapsed) return layout;
	const next = clone(layout);
	const g = next[home.dock].groups.find((x) => x.id === home.group.id)!;
	g.active = panel;
	next[home.dock].collapsed = false;
	return next;
}

export function setCollapsed(layout: Layout, dock: Dock, collapsed: boolean): Layout {
	if (layout[dock].collapsed === collapsed) return layout;
	const next = clone(layout);
	next[dock].collapsed = collapsed;
	return next;
}

export function setZoneSize(layout: Layout, dock: Dock, size: number): Layout {
	const next = clone(layout);
	next[dock].size = Math.max(ZONE_MIN[dock], Math.round(size));
	return next;
}

/** Moves the divider between groups `index` and `index + 1` by `delta`, in weight units. */
export function shiftDivider(layout: Layout, dock: Dock, index: number, delta: number): Layout {
	const groups = layout[dock].groups;
	if (index < 0 || index >= groups.length - 1) return layout;
	const pair = groups[index].weight + groups[index + 1].weight;
	const first = Math.min(
		pair - GROUP_MIN_WEIGHT,
		Math.max(GROUP_MIN_WEIGHT, groups[index].weight + delta)
	);
	if (first === groups[index].weight) return layout;
	const next = clone(layout);
	next[dock].groups[index].weight = first;
	next[dock].groups[index + 1].weight = pair - first;
	return next;
}

const PANEL_IDS = new Set<string>(PANELS.map((p) => p.id));

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Layout from storage; anything malformed, or missing or repeating a panel, yields the default. */
export function parseLayout(raw: string | null): Layout {
	if (!raw) return defaultLayout();
	try {
		const data = JSON.parse(raw) as Partial<Record<Dock, Partial<Zone>>>;
		const seen = new Set<string>();
		const ids = new Set<string>();
		const out = defaultLayout();
		for (const dock of DOCKS) {
			const zone = data[dock];
			if (!zone || !Array.isArray(zone.groups) || !isFiniteNumber(zone.size)) {
				return defaultLayout();
			}
			out[dock] = {
				size: Math.max(ZONE_MIN[dock], zone.size),
				collapsed: zone.collapsed === true,
				groups: []
			};
			for (const g of zone.groups) {
				if (
					typeof g?.id !== 'string' ||
					!/^g\d+$/.test(g.id) ||
					ids.has(g.id) ||
					!Array.isArray(g.panels) ||
					g.panels.length === 0 ||
					!isFiniteNumber(g.weight) ||
					g.weight <= 0
				) {
					return defaultLayout();
				}
				ids.add(g.id);
				for (const p of g.panels) {
					if (!PANEL_IDS.has(p) || seen.has(p)) return defaultLayout();
					seen.add(p);
				}
				out[dock].groups.push({
					id: g.id,
					panels: [...g.panels],
					active: g.panels.includes(g.active) ? g.active : g.panels[0],
					weight: g.weight
				});
			}
		}
		return seen.size === PANELS.length ? out : defaultLayout();
	} catch {
		return defaultLayout();
	}
}
