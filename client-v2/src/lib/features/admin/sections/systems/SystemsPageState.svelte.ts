//* Page state for the Systems section: selection, API access, and optimistic local
//* patches of the session config so edits show instantly. The server pushes the
//* full config over the admin websocket after every write and overwrites these
//* patches with the authoritative document.

import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
import type { AdminConfigPayload } from '$lib/core/admin-types.ts';
import { SystemsApi } from './systems-api.ts';
import type { AdminGroup, AdminSystemFull, AdminSystemSummary, AdminTag, AdminTalkgroup, AdminUnit } from './systems-types.ts';

export class SystemsPageState {
	readonly session: AdminSessionState;
	readonly api: SystemsApi;

	selectedSystemId = $state<number | null>(null);

	readonly systems = $derived.by(() => (this.session.config?.systems ?? []) as unknown as AdminSystemFull[]);
	readonly tags = $derived.by(() => (this.session.config?.tags ?? []) as AdminTag[]);
	readonly groups = $derived.by(() => (this.session.config?.groups ?? []) as AdminGroup[]);
	readonly selectedSystem = $derived.by(() => this.systems.find((system) => system.id === this.selectedSystemId) ?? null);

	readonly tagLabels = $derived.by(() => new Map(this.tags.map((tag) => [tag.id, tag.label])));
	readonly groupLabels = $derived.by(() => new Map(this.groups.map((group) => [group.id, group.label])));

	constructor(session: AdminSessionState) {
		this.session = session;
		this.api = new SystemsApi(session.client);
	}

	select(systemId: number | null) {
		this.selectedSystemId = systemId;
	}

	//* Replaces the systems array in the raw config so derived state recomputes.
	private replaceSystems(systems: AdminSystemFull[]) {
		if (!this.session.config) return;
		this.session.config = { ...this.session.config, systems: systems as unknown as AdminConfigPayload['systems'] };
	}

	private updateSystem(systemId: number, update: (system: AdminSystemFull) => AdminSystemFull) {
		this.replaceSystems(this.systems.map((system) => (system.id === systemId ? update(system) : system)));
	}

	applySystemSummary(summary: AdminSystemSummary) {
		this.updateSystem(summary.id, (system) => ({ ...system, ...summary, talkgroups: system.talkgroups, units: system.units }));
	}

	applyTalkgroup(systemId: number, talkgroup: AdminTalkgroup) {
		this.updateSystem(systemId, (system) => {
			const exists = system.talkgroups.some((tg) => tg.id === talkgroup.id);
			return {
				...system,
				talkgroups: exists ? system.talkgroups.map((tg) => (tg.id === talkgroup.id ? talkgroup : tg)) : [...system.talkgroups, talkgroup]
			};
		});
	}

	applyTalkgroupPatches(systemId: number, ids: number[], patch: (talkgroup: AdminTalkgroup) => AdminTalkgroup) {
		const idSet = new Set(ids);
		this.updateSystem(systemId, (system) => ({
			...system,
			talkgroups: system.talkgroups.map((tg) => (idSet.has(tg.id) ? patch(tg) : tg))
		}));
	}

	removeTalkgroups(systemId: number, ids: number[]) {
		const idSet = new Set(ids);
		this.updateSystem(systemId, (system) => ({ ...system, talkgroups: system.talkgroups.filter((tg) => !idSet.has(tg.id)) }));
	}

	applyUnit(systemId: number, unit: AdminUnit) {
		this.updateSystem(systemId, (system) => {
			const exists = system.units.some((u) => u.id === unit.id);
			return { ...system, units: exists ? system.units.map((u) => (u.id === unit.id ? unit : u)) : [...system.units, unit] };
		});
	}

	removeUnits(systemId: number, ids: number[]) {
		const idSet = new Set(ids);
		this.updateSystem(systemId, (system) => ({ ...system, units: system.units.filter((u) => !idSet.has(u.id)) }));
	}
}
