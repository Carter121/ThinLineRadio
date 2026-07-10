import type { TlrConfig, TlrConfigSystem, TlrConfigTalkgroup, TlrConfigUnit, TlrConfigUserFavorites } from './types.ts';
import { normalizeConfigSystems } from './types.ts';

/** True when a configured unit row matches a call source / radio ID. */
export function unitMatchesSrc(unit: TlrConfigUnit, src: number): boolean {
	if (typeof unit.unitFrom === 'number' && typeof unit.unitTo === 'number') {
		if (unit.unitFrom > 0 && unit.unitTo > 0 && unit.unitFrom <= src && unit.unitTo >= src) {
			return true;
		}
	}

	const unitRef = unit.unitRef;
	if (typeof unitRef === 'number' && unitRef > 0 && unitRef === src) {
		return true;
	}

	// v6 configs: JSON "id" was the radio unitRef (see server unit.MarshalJSON / issue #172).
	if (!(typeof unitRef === 'number' && unitRef > 0) && unit.id === src) {
		return true;
	}

	return false;
}

export function findUnitLabelForSrc(units: TlrConfigUnit[] | undefined, src: number): string | undefined {
	if (!Array.isArray(units)) return undefined;
	const label = units.find((unit) => unitMatchesSrc(unit, src))?.label?.trim();
	return label && label.length > 0 ? label : undefined;
}

export interface TalkgroupContext {
	systemId?: number;
	talkgroupId?: number;
	systemLabel?: string;
	talkgroupLabel?: string;
	talkgroupName?: string;
}

export function systemRef(system: TlrConfigSystem): number | undefined {
	return system.systemRef ?? system.id;
}

export function talkgroupRef(talkgroup: TlrConfigTalkgroup): number | undefined {
	return talkgroup.talkgroupRef ?? talkgroup.id;
}

/**
 * Indexed lookup over a TlrConfig's systems and talkgroups, keyed by their
 * radio references (systemRef/talkgroupRef, falling back to ids). Build one
 * per config — typically via `$derived(new TlrDirectory(this.config))`.
 */
export class TlrDirectory {
	readonly systems: TlrConfigSystem[];
	private systemIndex = new Map<number, TlrConfigSystem>();
	private talkgroupIndex = new Map<number, Map<number, TlrConfigTalkgroup>>();
	private favorites: TlrConfigUserFavorites[];

	constructor(config: TlrConfig | null | undefined) {
		this.systems = normalizeConfigSystems(config);
		for (const system of this.systems) {
			const sysRef = systemRef(system);
			if (sysRef == null) continue;
			this.systemIndex.set(sysRef, system);
			const talkgroups = new Map<number, TlrConfigTalkgroup>();
			for (const talkgroup of system.talkgroups ?? []) {
				const tgRef = talkgroupRef(talkgroup);
				if (tgRef != null) talkgroups.set(tgRef, talkgroup);
			}
			this.talkgroupIndex.set(sysRef, talkgroups);
		}

		if (config && config.userSettings && config.userSettings.favorites) this.favorites = config.userSettings.favorites;
		else this.favorites = [];
	}

	system(systemId: number | undefined): TlrConfigSystem | undefined {
		if (systemId == null) return undefined;
		return this.systemIndex.get(systemId);
	}

	favoriteTalkgroups(systemId: number | undefined): number[] | undefined {
		if (systemId == null) return undefined;
		const foundIds: number[] = [];

		this.favorites.forEach((fav) => {
			if (fav.systemId == systemId && fav.type == 'talkgroup' && fav.talkgroupId) foundIds.push(fav.talkgroupId);
		});

		return foundIds.length > 0 ? foundIds : undefined;
	}

	talkgroup(systemId: number | undefined, talkgroupId: number | undefined): TlrConfigTalkgroup | undefined {
		if (systemId == null || talkgroupId == null) return undefined;
		return this.talkgroupIndex.get(systemId)?.get(talkgroupId);
	}

	systemLabel(systemId: number): string {
		return this.system(systemId)?.label ?? String(systemId);
	}

	talkgroupLabel(systemId: number, talkgroupId: number): string {
		const talkgroup = this.talkgroup(systemId, talkgroupId);
		return talkgroup?.label ?? talkgroup?.name ?? String(talkgroupId);
	}

	callLabel(call: { system: number; talkgroup: number }): string {
		return `${this.systemLabel(call.system)} / ${this.talkgroupLabel(call.system, call.talkgroup)}`;
	}

	/** Resolve a call source / radio ID to its configured unit alias, if any. */
	unitLabel(systemId: number | undefined, src: number | undefined): string | undefined {
		if (systemId == null || src == null) return undefined;
		return findUnitLabelForSrc(this.system(systemId)?.units, src);
	}

	/** Find the first system/talkgroup pair matching the given refs; either may be omitted. */
	context(systemId?: number, talkgroupId?: number): TalkgroupContext | null {
		if (systemId == null && talkgroupId == null) return null;
		for (const system of this.systems) {
			const sysRef = systemRef(system);
			if (systemId != null && sysRef !== systemId) continue;
			for (const talkgroup of system.talkgroups ?? []) {
				const tgRef = talkgroupRef(talkgroup);
				if (talkgroupId != null && tgRef !== talkgroupId) continue;
				return {
					systemId: sysRef,
					talkgroupId: tgRef,
					systemLabel: system.label,
					talkgroupLabel: talkgroup.label,
					talkgroupName: talkgroup.name
				};
			}
		}
		return null;
	}
}
