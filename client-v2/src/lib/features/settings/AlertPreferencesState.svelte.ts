import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { TlrClient } from '$lib/core/tlr-client.ts';
import { TlrDirectory } from '$lib/core/directory.ts';
import {
	normalizeConfigSystems,
	sortTalkgroupsAlphabetically,
	type AlertPreference,
	type KeywordList,
	type TlrConfig,
	type TlrSocketEvent
} from '$lib/core/types.ts';

//* One editable row in the preferences UI: a talkgroup plus its (possibly default) pref
export interface PreferenceRow {
	key: string;
	systemRef: number;
	talkgroupRef: number;
	systemLabel: string;
	talkgroupLabel: string;
	talkgroupName?: string;
	tag: string;
	pref: AlertPreference;
}

function rowKey(systemRef: number, talkgroupRef: number): string {
	return `${systemRef}:${talkgroupRef}`;
}

function defaultPref(systemRef: number, talkgroupRef: number): AlertPreference {
	//* Server-side defaults for missing rows: alerts off, tone/keyword matching on
	return {
		systemRef,
		talkgroupRef,
		alertEnabled: false,
		toneAlerts: true,
		keywordAlerts: true,
		keywords: [],
		keywordListIds: []
	};
}

export class AlertPreferencesState {
	config = $state.raw<TlrConfig | null>(null);
	keywordLists = $state.raw<KeywordList[]>([]);
	loading = $state(false);
	loadError = $state<string | null>(null);
	saving = $state(false);
	saveError = $state<string | null>(null);
	lastSavedAt = $state<number | null>(null);

	//* Working copy of preferences, keyed by systemRef:talkgroupRef
	private prefs = new SvelteMap<string, AlertPreference>();
	private dirtyKeys = new SvelteSet<string>();

	private client: TlrClient;
	private unsubscribeSocket: (() => void) | null = null;
	private fetched = false;

	constructor(client: TlrClient) {
		this.client = client;
	}

	start() {
		this.unsubscribeSocket = this.client.subscribe((event) => this.handleSocketEvent(event));
		this.client.connectSocket();
		void this.load();
	}

	destroy() {
		this.unsubscribeSocket?.();
	}

	directory = $derived(new TlrDirectory(this.config));

	dirtyCount = $derived(this.dirtyKeys.size);

	//* All accessible talkgroups grouped as system -> tag -> rows
	rows = $derived.by((): Map<string, Map<string, PreferenceRow[]>> => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const result = new Map<string, Map<string, PreferenceRow[]>>();
		for (const system of normalizeConfigSystems(this.config)) {
			const sysRef = system.systemRef ?? system.id;
			if (sysRef == null) continue;
			const systemLabel = system.label ?? String(sysRef);
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const tagMap = new Map<string, PreferenceRow[]>();
			for (const tg of sortTalkgroupsAlphabetically(system.talkgroups ?? [])) {
				const tgRef = tg.talkgroupRef ?? tg.id;
				if (tgRef == null) continue;
				const key = rowKey(sysRef, tgRef);
				const tag = tg.tag || 'Other';
				const row: PreferenceRow = {
					key,
					systemRef: sysRef,
					talkgroupRef: tgRef,
					systemLabel,
					talkgroupLabel: tg.label ?? String(tgRef),
					talkgroupName: tg.name,
					tag,
					pref: this.prefs.get(key) ?? defaultPref(sysRef, tgRef)
				};
				const list = tagMap.get(tag) ?? [];
				list.push(row);
				tagMap.set(tag, list);
			}
			if (tagMap.size > 0) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				result.set(systemLabel, new Map([...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))));
			}
		}
		return result;
	});

	isDirty(key: string): boolean {
		return this.dirtyKeys.has(key);
	}

	updatePref(row: PreferenceRow, patch: Partial<AlertPreference>) {
		const current = this.prefs.get(row.key) ?? defaultPref(row.systemRef, row.talkgroupRef);
		this.prefs.set(row.key, { ...current, ...patch });
		this.dirtyKeys.add(row.key);
		this.saveError = null;
	}

	setAllForSystem(systemLabel: string, enabled: boolean) {
		const tagMap = this.rows.get(systemLabel);
		if (!tagMap) return;
		for (const rows of tagMap.values()) {
			for (const row of rows) {
				if (row.pref.alertEnabled !== enabled) {
					this.updatePref(row, { alertEnabled: enabled });
				}
			}
		}
	}

	async load() {
		if (!this.client.isAuthenticated) {
			this.loadError = 'Sign in to manage alert preferences';
			return;
		}
		this.loading = true;
		this.loadError = null;
		try {
			const [prefs, lists] = await Promise.all([this.client.getAlertPreferences(), this.client.getKeywordLists()]);
			this.prefs.clear();
			this.dirtyKeys.clear();
			for (const pref of prefs) {
				if (pref.systemRef == null || pref.talkgroupRef == null) continue;
				this.prefs.set(rowKey(pref.systemRef, pref.talkgroupRef), {
					...pref,
					keywords: pref.keywords ?? [],
					keywordListIds: pref.keywordListIds ?? []
				});
			}
			this.keywordLists = [...lists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
			this.fetched = true;
		} catch (error) {
			this.loadError = error instanceof Error ? error.message : 'Failed to load alert preferences';
		} finally {
			this.loading = false;
		}
	}

	async save() {
		if (this.dirtyKeys.size === 0 || this.saving) return;
		this.saving = true;
		this.saveError = null;
		const dirty = [...this.dirtyKeys];
		const payload: AlertPreference[] = [];
		for (const key of dirty) {
			const pref = this.prefs.get(key);
			//* Strip DB ids so the server resolves rows by systemRef/talkgroupRef
			if (pref) {
				const rest = { ...pref };
				delete rest.systemId;
				delete rest.talkgroupId;
				delete rest.userId;
				payload.push(rest);
			}
		}
		try {
			await this.client.saveAlertPreferences(payload);
			for (const key of dirty) this.dirtyKeys.delete(key);
			this.lastSavedAt = Date.now();
		} catch (error) {
			this.saveError = error instanceof Error ? error.message : 'Failed to save alert preferences';
		} finally {
			this.saving = false;
		}
	}

	private handleSocketEvent(event: TlrSocketEvent) {
		if (event.type === 'config') {
			this.config = event.payload;
			//* First config can arrive after an auth-gated load failed; retry once signed in
			if (!this.fetched && !this.loading && this.client.isAuthenticated) {
				void this.load();
			}
		}
	}
}
