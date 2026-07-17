import { PersistedState } from 'runed';

export class UnitInfoCardState {
	countyOpen: PersistedState<Record<string, boolean>>;
	sectionOpen: PersistedState<Record<string, boolean>>;

	constructor(options: { counties: readonly string[] }) {
		this.countyOpen = new PersistedState('tlr-info-countyOpen', Object.fromEntries(options.counties.map((county) => [county, false])));
		this.sectionOpen = new PersistedState('tlr-info-sectionOpen', {});
	}

	isSectionOpen(county: string, section: string): boolean {
		const key = `${county}:${section}`;
		return this.sectionOpen.current[key] ?? true;
	}

	setSectionOpen(county: string, section: string, open: boolean) {
		this.sectionOpen.current[`${county}:${section}`] = open;
	}
}
