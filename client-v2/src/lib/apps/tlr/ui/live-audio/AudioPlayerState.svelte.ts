import type { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
import type { LivefeedMap, SocketCall } from '$lib/apps/tlr/types.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';

const STORAGE_KEY = 'tlr-selected-channels';
const MAX_HISTORY = 5;

export interface AudioQueueItem {
	callId: number;
	objectUrl: string;
	systemLabel?: string;
	talkgroupLabel?: string;
	talkgroupName?: string;
	talkgroupId?: number;
	systemId?: number;
	source?: number;
	sources?: Array<{ src?: number; tag?: string }>;
	frequency?: number;
	site?: number | string;
	hasTones?: boolean;
	transcript?: string;
	delayed?: boolean;
	timestamp: number;
}

export class AudioPlayerState {
	queue = $state.raw<AudioQueueItem[]>([]);
	current = $state.raw<AudioQueueItem | null>(null);
	history = $state.raw<AudioQueueItem[]>([]);
	isPlaying = $state(false);
	isLive = $state(false);
	volume = $state(1);
	duration = $state(0);
	currentTime = $state(0);
	autoplayBlocked = $state(false);
	selectedTalkgroups = $state.raw<LivefeedMap>({});

	private audio: HTMLAudioElement;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private objectUrls = new Set<string>();
	private replayingFromHistory = false;
	private client: TlrClient;
	private coordinator: AudioCoordinator;

	constructor(client: TlrClient, coordinator: AudioCoordinator) {
		this.client = client;
		this.coordinator = coordinator;
		this.selectedTalkgroups = this.loadSelections();
		this.audio = coordinator.callAudio;
		this.audio.volume = this.volume;

		coordinator.register('live', {
			onEnded: () => {
				if (!this.current) return;
				this.isPlaying = false;
				this.currentTime = 0;
				this.duration = 0;
				if (!this.replayingFromHistory) {
					this.pushToHistory(this.current);
				}
				this.current = null;
				if (this.queue.length > 0) {
					this.playNext();
				} else {
					this.replayingFromHistory = false;
				}
			},
			onTimeUpdate: (time) => {
				if (!this.current) return;
				this.currentTime = time;
			},
			onLoadedMetadata: (duration) => {
				if (!this.current) return;
				this.duration = duration;
			},
			onYield: () => {
				this.isPlaying = false;
			},
			onReclaim: () => {
				if (this.current) {
					this.startPlayback(this.current.objectUrl);
				} else if (this.queue.length > 0) {
					this.playNext();
				}
			}
		});
	}

	enqueue(call: SocketCall, context: { systemLabel?: string; talkgroupLabel?: string; talkgroupName?: string; text?: string } | null) {
		if (!call.audio?.data?.length) return;

		const bytes = new Uint8Array(call.audio.data);
		const mimeType = call.audioType || 'audio/wav';
		const blob = new Blob([bytes], { type: mimeType });
		const objectUrl = URL.createObjectURL(blob);
		this.objectUrls.add(objectUrl);

		const item: AudioQueueItem = {
			callId: call.id,
			objectUrl,
			systemLabel: context?.systemLabel,
			talkgroupLabel: context?.talkgroupLabel,
			talkgroupName: context?.talkgroupName,
			talkgroupId: call.talkgroup,
			systemId: call.system,
			source: call.source,
			sources: call.sources?.map((s) => ({ src: s.src, tag: s.tag })),
			frequency: call.frequency,
			site: call.site,
			hasTones: call.hasTones,
			transcript: call.transcript ?? context?.text,
			delayed: call.delayed,
			timestamp: Date.now()
		};

		this.queue = [...this.queue, item];

		if (this.isLive && !this.current) {
			this.playNext();
		}
	}

	play() {
		if (this.current) {
			this.startPlayback(this.current.objectUrl);
		} else if (this.queue.length > 0) {
			this.playNext();
		}
	}

	pause() {
		this.audio.pause();
		this.isPlaying = false;
	}

	skip() {
		this.audio.pause();
		if (this.current) {
			if (!this.replayingFromHistory) {
				this.pushToHistory(this.current);
			}
			this.current = null;
		}
		this.isPlaying = false;
		this.currentTime = 0;
		this.duration = 0;
		if (this.queue.length > 0) {
			this.playNext();
		} else {
			this.replayingFromHistory = false;
		}
	}

	toggleLive() {
		this.isLive = !this.isLive;
		this.syncLivefeedMap();
		if (this.isLive) {
			if (!this.current && this.queue.length > 0) {
				this.playNext();
			}
		} else {
			this.audio.pause();
			if (this.current) {
				this.pushToHistory(this.current);
				this.current = null;
			}
			for (const item of this.queue) {
				this.revokeUrl(item.objectUrl);
			}
			this.queue = [];
			this.isPlaying = false;
			this.currentTime = 0;
			this.duration = 0;
		}
	}

	setVolume(v: number) {
		this.volume = Math.max(0, Math.min(1, v));
		this.audio.volume = this.volume;
	}

	// Talkgroup selection methods
	toggleTalkgroup(systemRef: string, tgRef: string) {
		const system = this.selectedTalkgroups[systemRef] ?? {};
		const current = system[tgRef] ?? false;
		this.selectedTalkgroups = {
			...this.selectedTalkgroups,
			[systemRef]: { ...system, [tgRef]: !current }
		};
		this.saveSelections();
		this.syncLivefeedMap();
	}

	setAllForSystem(systemRef: string, tgRefs: string[], enabled: boolean) {
		const system: Record<string, boolean> = {};
		for (const ref of tgRefs) {
			system[ref] = enabled;
		}
		this.selectedTalkgroups = {
			...this.selectedTalkgroups,
			[systemRef]: system
		};
		this.saveSelections();
		this.syncLivefeedMap();
	}

	setAllForGroup(systemRef: string, tgRefs: string[], enabled: boolean) {
		const system = { ...(this.selectedTalkgroups[systemRef] ?? {}) };
		for (const ref of tgRefs) {
			system[ref] = enabled;
		}
		this.selectedTalkgroups = {
			...this.selectedTalkgroups,
			[systemRef]: system
		};
		this.saveSelections();
		this.syncLivefeedMap();
	}

	syncLivefeedMap() {
		if (!this.isLive) {
			this.client.setLivefeedMap({});
			return;
		}
		// Build clean map with only enabled entries
		const map: LivefeedMap = {};
		for (const [systemRef, talkgroups] of Object.entries(this.selectedTalkgroups)) {
			const enabledTgs: Record<string, boolean> = {};
			let hasAny = false;
			for (const [tgRef, enabled] of Object.entries(talkgroups)) {
				if (enabled) {
					enabledTgs[tgRef] = true;
					hasAny = true;
				}
			}
			if (hasAny) {
				map[systemRef] = enabledTgs;
			}
		}
		this.client.setLivefeedMap(map);
	}

	playFromHistory(callId: number) {
		const index = this.history.findIndex((h) => h.callId === callId);
		if (index === -1) return;

		this.replayingFromHistory = true;

		// Queue newer history items (above the clicked one) to play after it, oldest first
		const replayItems = this.history.slice(0, index).reverse();
		this.queue = [...replayItems, ...this.queue];

		this.current = this.history[index];
		this.startPlayback(this.current.objectUrl);
	}

	destroy() {
		if (this.current) this.audio.pause();
		this.coordinator.unregister('live');
		this.current = null;
		this.queue = [];
		this.history = [];
		this.isPlaying = false;
		this.currentTime = 0;
		this.duration = 0;
		for (const url of this.objectUrls) {
			URL.revokeObjectURL(url);
		}
		this.objectUrls.clear();
	}

	private playNext() {
		if (this.queue.length === 0) return;
		const next = this.queue[0];
		this.queue = this.queue.slice(1);

		// When transitioning from history replay back to normal queue items, clear the flag
		if (this.replayingFromHistory && !this.history.some((h) => h.callId === next.callId)) {
			this.replayingFromHistory = false;
		}

		this.current = next;
		this.startPlayback(next.objectUrl);
	}

	private startPlayback(url: string) {
		this.coordinator.acquire('live');
		this.audio.src = url;
		this.autoplayBlocked = false;
		const promise = this.audio.play();
		if (promise) {
			promise
				.then(() => {
					this.isPlaying = true;
				})
				.catch((err: Error) => {
					if (err.name === 'NotAllowedError') {
						this.autoplayBlocked = true;
						this.isPlaying = false;
					}
				});
		}
	}

	private pushToHistory(item: AudioQueueItem) {
		// Remove duplicate if already in history
		const filtered = this.history.filter((h) => h.callId !== item.callId);
		const updated = [item, ...filtered];
		// Revoke URLs of items that fall off
		for (const dropped of updated.slice(MAX_HISTORY)) {
			this.revokeUrl(dropped.objectUrl);
		}
		this.history = updated.slice(0, MAX_HISTORY);
	}

	private revokeUrl(url: string) {
		URL.revokeObjectURL(url);
		this.objectUrls.delete(url);
	}

	private saveSelections() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.selectedTalkgroups));
		} catch {
			// localStorage may be unavailable
		}
	}

	private loadSelections(): LivefeedMap {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) return JSON.parse(stored);
		} catch {
			// localStorage may be unavailable
		}
		return {};
	}
}
