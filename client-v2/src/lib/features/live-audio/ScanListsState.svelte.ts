import type { TlrClient } from '$lib/core/tlr-client.ts';
import { normalizeConfigSystems, type LivefeedMap, type ScanList, type ScanListChannel, type TlrConfig } from '$lib/core/types.ts';

const SAVE_DEBOUNCE_MS = 800;

//* Server-synced named channel presets. Lists live inside the user's settings blob
//* (users.settings -> scanLists) so they are shared with the old client and across devices.
//* The server pushes them in the CFG socket message (userSettings.scanLists); saves go
//* through read-modify-write on /api/settings to preserve unrelated settings keys.
export class ScanListsState {
	lists = $state.raw<ScanList[]>([]);
	loading = $state(false);
	saveError = $state<string | null>(null);

	private client: TlrClient;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private loadedFromServer = false;

	constructor(client: TlrClient) {
		this.client = client;
	}

	//* Feed CFG payloads here (the session state already subscribes to config events)
	syncFromConfig(config: TlrConfig | null) {
		const serverLists = config?.userSettings?.scanLists;
		if (Array.isArray(serverLists)) {
			this.lists = serverLists.filter((l) => !l.isFavoritesSource);
			this.loadedFromServer = true;
		}
	}

	//* Fallback fetch for when the socket config has no userSettings yet
	async loadIfNeeded() {
		if (this.loadedFromServer || !this.client.isAuthenticated) return;
		this.loading = true;
		try {
			const settings = await this.client.getSettings();
			const serverLists = settings?.scanLists;
			if (Array.isArray(serverLists)) {
				this.lists = (serverLists as ScanList[]).filter((l) => !l.isFavoritesSource);
			}
			this.loadedFromServer = true;
		} catch {
			//* Not fatal: presets just start empty until the next CFG arrives
		} finally {
			this.loading = false;
		}
	}

	saveCurrentSelection(name: string, selection: LivefeedMap, config: TlrConfig | null): ScanList | null {
		const channels = selectionToChannels(selection, config);
		if (channels.length === 0) return null;
		const list: ScanList = {
			id: `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			name: name.trim(),
			channels
		};
		this.lists = [...this.lists, list];
		this.scheduleSave();
		return list;
	}

	updateChannels(id: string, selection: LivefeedMap, config: TlrConfig | null) {
		const channels = selectionToChannels(selection, config);
		this.lists = this.lists.map((l) => (l.id === id ? { ...l, channels } : l));
		this.scheduleSave();
	}

	rename(id: string, name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		this.lists = this.lists.map((l) => (l.id === id ? { ...l, name: trimmed } : l));
		this.scheduleSave();
	}

	remove(id: string) {
		this.lists = this.lists.filter((l) => l.id !== id);
		this.scheduleSave();
	}

	toLivefeedMap(list: ScanList): LivefeedMap {
		const map: LivefeedMap = {};
		for (const channel of list.channels) {
			const system = map[channel.systemId] ?? {};
			system[channel.talkgroupId] = true;
			map[channel.systemId] = system;
		}
		return map;
	}

	flush() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.persist();
		}
	}

	private scheduleSave() {
		this.saveError = null;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.persist();
		}, SAVE_DEBOUNCE_MS);
	}

	private async persist() {
		try {
			const settings = await this.client.getSettings();
			await this.client.saveSettings({ ...settings, scanLists: this.lists });
		} catch (error) {
			this.saveError = error instanceof Error ? error.message : 'Failed to save scan lists';
		}
	}
}

function selectionToChannels(selection: LivefeedMap, config: TlrConfig | null): ScanListChannel[] {
	const systems = normalizeConfigSystems(config);
	const channels: ScanListChannel[] = [];
	for (const [systemRef, talkgroups] of Object.entries(selection)) {
		const system = systems.find((s) => String(s.systemRef ?? s.id) === systemRef);
		for (const [tgRef, enabled] of Object.entries(talkgroups)) {
			if (!enabled) continue;
			const tg = system?.talkgroups?.find((t) => String(t.talkgroupRef ?? t.id) === tgRef);
			channels.push({
				systemId: systemRef,
				talkgroupId: tgRef,
				talkgroupLabel: tg?.label,
				talkgroupName: tg?.name,
				systemLabel: system?.label,
				tag: tg?.tag
			});
		}
	}
	return channels;
}
