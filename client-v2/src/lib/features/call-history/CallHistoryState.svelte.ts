import { SvelteMap } from 'svelte/reactivity';
import type { TlrClient } from '$lib/core/tlr-client.ts';
import {
	type LclFilters,
	type LclResultItem,
	type SocketCall,
	sortTalkgroupsAlphabetically,
	type TlrConfig,
	type TlrConfigTalkgroup,
	type TlrSocketEvent
} from '$lib/core/types.ts';
import { normalizeConfigSystems } from '$lib/core/types.ts';
import { systemRef, talkgroupRef, TlrDirectory } from '$lib/core/directory.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import { DateTime } from 'luxon';
import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
import { createSearchParamsSchema, useSearchParams } from 'runed/kit';
import { PersistedState } from 'runed';

const PAGE_SIZE = 20;
//* Fetch 10 pages worth of data as a buffer
const FETCH_SIZE = PAGE_SIZE * 20;
const DEFAULT_DATE_PARAM = dateToParam(today(getLocalTimeZone()));
const VOLUME_STORAGE_KEY = 'tlr-history-volume';

const searchParamsSchema = createSearchParamsSchema({
	system: { type: 'string', default: '' },
	talkgroup: { type: 'string', default: '' },
	group: { type: 'string', default: '' },
	date: { type: 'string', default: DEFAULT_DATE_PARAM },
	sort: { type: 'number', default: -1 }
});

function dateToParam(date: DateValue | undefined): string {
	if (!date) return '';
	return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function dateFromParam(value: string): DateValue | undefined {
	if (!value) return undefined;
	try {
		return parseDate(value);
	} catch {
		return undefined;
	}
}

function numberFromParam(value: string): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export interface EnrichedCallResult extends LclResultItem {
	systemLabel?: string;
	talkgroupLabel?: string;
	talkgroupName?: string;
}

export class CallHistoryState {
	#searchParams = useSearchParams(searchParamsSchema, {
		pushHistory: false,
		noScroll: true
	});

	// URL-backed filters
	get systemFilter(): number | undefined {
		return numberFromParam(this.#searchParams.system);
	}
	set systemFilter(value: number | undefined) {
		this.#searchParams.system = value == null ? '' : String(value);
	}

	get talkgroupFilter(): number | undefined {
		return numberFromParam(this.#searchParams.talkgroup);
	}
	set talkgroupFilter(value: number | undefined) {
		this.#searchParams.talkgroup = value == null ? '' : String(value);
	}

	get groupFilter(): string | undefined {
		return this.#searchParams.group || undefined;
	}
	set groupFilter(value: string | undefined) {
		this.#searchParams.group = value ?? '';
	}

	get selectedDate(): DateValue | undefined {
		return dateFromParam(this.#searchParams.date) ?? today(getLocalTimeZone());
	}
	set selectedDate(value: DateValue | undefined) {
		this.#searchParams.date = dateToParam(value);
	}

	get sortDirection(): -1 | 1 {
		return this.#searchParams.sort === 1 ? 1 : -1;
	}
	set sortDirection(value: -1 | 1) {
		this.#searchParams.sort = value;
	}

	// Pagination (client-side over buffer)
	pageSize = PAGE_SIZE;
	offset = $state(0);
	hasMore = $state(false);
	isLoading = $state(false);
	isLoadingAll = $state(false);

	// Buffer: all fetched calls; results is a page-sized slice
	private buffer = $state.raw<LclResultItem[]>([]);
	private isLoadingMore = false;
	results = $derived.by((): LclResultItem[] => this.buffer.slice(this.offset, this.offset + this.pageSize));

	// Playback
	playbackCallId = $state<number | null>(null);
	playbackCall = $state.raw<SocketCall | null>(null);
	playbackLoading = $state(false);
	playbackError = $state<string | null>(null);
	isPlaying = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	//* Volume persists across reloads (and syncs across tabs) via localStorage
	private volumeState = new PersistedState<number>(VOLUME_STORAGE_KEY, 1);

	// Download
	downloadingCallId = $state<number | null>(null);

	// Config
	config = $state.raw<TlrConfig | null>(null);

	// Source alias cache: source ID → tag
	sourceAliases = $state<Map<number, string>>(new SvelteMap());

	// Derived
	currentPage = $derived(Math.floor(this.offset / this.pageSize) + 1);
	totalCount = $derived(this.buffer.length);
	pageCount = $derived(Math.max(1, Math.ceil(this.buffer.length / this.pageSize) + (this.hasMore ? 1 : 0)));

	hasNewer = $derived.by(() => {
		if (!this.playbackCallId) return false;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		return idx > 0;
	});

	hasOlder = $derived.by(() => {
		if (!this.playbackCallId) return false;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		return idx >= 0 && idx < this.buffer.length - 1;
	});

	directory = $derived(new TlrDirectory(this.config));
	systems = $derived(this.directory.systems);

	talkgroupsForSystem = $derived.by(() => {
		if (this.systemFilter == null) return [];
		let talkgroups = this.directory.system(this.systemFilter)?.talkgroups ?? [];
		if (this.groupFilter && this.config?.groups) {
			const groupData = this.config.groups[this.groupFilter];
			if (groupData) {
				const allowedRefs = groupData[String(this.systemFilter)];
				if (allowedRefs) {
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const allowedSet = new Set(allowedRefs);
					talkgroups = talkgroups.filter((tg) => allowedSet.has(talkgroupRef(tg) ?? 0));
				} else {
					talkgroups = [];
				}
			}
		}
		return sortTalkgroupsAlphabetically(talkgroups);
	});

	favoriteTalkgroups = $derived.by(() => {
		const favTalkgroupIds = this.directory.favoriteTalkgroups(this.systemFilter) ?? [];
		const favTalkgroups: TlrConfigTalkgroup[] = [];

		favTalkgroupIds.forEach((fav) => {
			const tg = this.directory.talkgroup(this.systemFilter, fav);

			if (tg) {
				favTalkgroups.push(tg);
			}
		});

		return sortTalkgroupsAlphabetically(favTalkgroups);
	});

	groups = $derived.by(() => {
		if (!this.config?.groups) return [] as string[];
		return Object.keys(this.config.groups).sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));
	});

	favoriteGroups = $derived.by(() => {
		if (!this.config?.groups || this.systemFilter != 1) return [] as string[];
		return ['SLC FD', 'SLC FD Abnormal', 'VECC', 'VECC Abnormal'];
	});

	allEnrichedCalls = $derived.by((): EnrichedCallResult[] => {
		return this.buffer.map((r) => {
			const sys = this.directory.system(r.system);
			const tg = this.directory.talkgroup(r.system, r.talkgroup);
			return { ...r, systemLabel: sys?.label, talkgroupLabel: tg?.label, talkgroupName: tg?.name };
		});
	});

	enrichedResults = $derived(this.allEnrichedCalls.slice(this.offset, this.offset + this.pageSize));

	private unsubscribeSocket: (() => void) | null = null;
	private client: TlrClient;
	private coordinator: AudioCoordinator;
	private audio: HTMLAudioElement;
	private objectUrl: string | null = null;
	private pendingPlaybackId: number | null = null;
	private autoAdvancing = false;
	private initialSearchDone = false;
	private userRequestedPause = false;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private callCache = new Map<number, SocketCall>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private prefetchInFlight = new Set<number>();

	constructor(client: TlrClient, coordinator: AudioCoordinator) {
		this.client = client;
		this.coordinator = coordinator;
		this.audio = coordinator.callAudio;

		coordinator.register('call-history', {
			onEnded: () => {
				if (this.playbackCallId == null || this.playbackLoading) return;
				this.isPlaying = false;
				if (this.userRequestedPause) {
					this.userRequestedPause = false;
					return;
				}
				this.currentTime = 0;
				this.playNextCall();
			},
			onTimeUpdate: (time) => {
				if (this.playbackCallId == null || this.playbackLoading) return;
				this.currentTime = time;
			},
			onLoadedMetadata: (duration) => {
				if (this.playbackCallId == null || this.playbackLoading) return;
				this.duration = duration;
			},
			onYield: () => {
				this.isPlaying = false;
			},
			onReclaim: () => {
				if (this.playbackCallId != null && this.objectUrl) {
					this.audio.src = this.objectUrl;
					this.audio.volume = this.volume;
					this.audio
						.play()
						.then(() => {
							this.isPlaying = true;
						})
						.catch(() => {});
				}
			}
		});
	}

	start() {
		this.unsubscribeSocket = this.client.subscribe((event) => this.handleSocketEvent(event));
		this.client.connectSocket();
	}

	destroy() {
		this.unsubscribeSocket?.();
		this.stopPlayback();
		this.coordinator.unregister('call-history');
	}

	search(options: { loadAll?: boolean } = {}) {
		this.isLoading = true;
		this.isLoadingAll = options.loadAll ?? false;
		this.isLoadingMore = false;
		this.offset = 0;
		this.buffer = [];
		this.callCache.clear();
		this.prefetchInFlight.clear();
		const filters = this.buildFilters({ limit: FETCH_SIZE, offset: 0 });
		this.client.requestCallList(filters);
	}

	private loadMore(): boolean {
		if (this.isLoading || this.isLoadingMore || !this.hasMore || this.buffer.length === 0) return false;
		this.isLoadingMore = true;
		this.isLoading = true;
		const filters = this.buildFilters({ limit: FETCH_SIZE, offset: this.buffer.length });
		this.client.requestCallList(filters);
		return true;
	}

	loadAll() {
		if (this.isLoading) return;
		this.search({ loadAll: true });
	}

	cancelLoadAll() {
		this.isLoadingAll = false;
	}

	private buildFilters(base: { limit: number; offset: number }): LclFilters {
		const filters: LclFilters = {
			offset: base.offset,
			limit: base.limit,
			sort: this.sortDirection,
			date: this.selectedDateStart()
		};
		if (this.systemFilter != null) filters.system = this.systemFilter;
		if (this.talkgroupFilter != null) filters.talkgroup = this.talkgroupFilter;
		if (this.groupFilter != null) filters.group = this.groupFilter;
		return filters;
	}

	private selectedDateStart(): string | undefined {
		if (!this.selectedDate) return undefined;
		const date = DateTime.fromObject({
			year: this.selectedDate.year,
			month: this.selectedDate.month,
			day: this.selectedDate.day
		});
		if (!date.isValid) return undefined;
		return date.startOf('day').toISO() ?? undefined;
	}

	setPage(page: number) {
		const targetPage = Math.max(1, Math.min(page, this.pageCount));
		this.offset = (targetPage - 1) * this.pageSize;
		this.prefetchWindow();
		// Pre-fetch next buffer when approaching the end (5 pages before last)
		const bufferedPages = Math.ceil(this.buffer.length / this.pageSize);
		if (targetPage >= bufferedPages - 5 && this.hasMore) {
			this.loadMore();
		}
	}

	private followCallPage(callIndex: number) {
		if (callIndex < 0) return;
		const page = Math.floor(callIndex / this.pageSize) + 1;
		if (page !== this.currentPage) {
			this.setPage(page);
		}
	}

	private followCallById(callId: number) {
		this.followCallPage(this.buffer.findIndex((r) => r.id === callId));
	}

	private prefetchWindow() {
		const page = this.currentPage;
		const startIdx = Math.max(0, (page - 2) * this.pageSize); // page - 1
		const endIdx = Math.min(this.buffer.length, (page + 1) * this.pageSize); // page + 1
		for (let i = startIdx; i < endIdx; i++) {
			const call = this.buffer[i];
			if (!this.callCache.has(call.id) && !this.prefetchInFlight.has(call.id)) {
				this.prefetchInFlight.add(call.id);
				this.client.requestCallPlayback(call.id);
			}
		}
	}

	playCall(callId: number, options: { autoAdvance?: boolean } = {}) {
		this.coordinator.acquire('call-history');
		this.audio.pause();
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
		this.followCallById(callId);
		this.playbackCallId = callId;
		this.playbackError = null;
		this.isPlaying = false;
		this.autoAdvancing = options.autoAdvance ?? false;
		this.currentTime = 0;
		this.duration = 0;

		// Prime the audio element during the user gesture to satisfy Chromium autoplay policy.
		this.coordinator.prime();

		// Use cached call data if available (prefetched)
		const cached = this.callCache.get(callId);
		if (cached) {
			this.playbackLoading = false;
			this.pendingPlaybackId = callId;
			this.handlePlaybackCall(cached);
		} else {
			this.playbackLoading = true;
			this.pendingPlaybackId = callId;
			this.client.requestCallPlayback(callId);
		}
	}

	stopPlayback() {
		this.coordinator.release('call-history');
		this.audio.pause();
		this.audio.removeAttribute('src');
		this.audio.load();
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = null;
		}
		this.playbackCallId = null;
		this.playbackCall = null;
		this.playbackLoading = false;
		this.playbackError = null;
		this.isPlaying = false;
		this.currentTime = 0;
		this.duration = 0;
		this.pendingPlaybackId = null;
		this.autoAdvancing = false;
	}

	get volume(): number {
		//* Clamp so a corrupted stored value can never produce an invalid audio volume
		return Math.max(0, Math.min(1, this.volumeState.current));
	}

	setVolume(v: number) {
		this.volumeState.current = Math.max(0, Math.min(1, v));
		this.audio.volume = this.volumeState.current;
	}

	togglePlayPause() {
		if (this.isPlaying) {
			this.userRequestedPause = true;
			this.audio.pause();
			this.isPlaying = false;
		} else {
			this.userRequestedPause = false;
			this.audio
				.play()
				.then(() => {
					this.isPlaying = true;
				})
				.catch(() => {});
		}
	}

	seek(time: number) {
		this.audio.currentTime = time;
		this.currentTime = time;
	}

	downloadCall(callId: number) {
		//* Prefetched playback data already contains the audio bytes, so reuse it
		const cached = this.callCache.get(callId);
		if (cached?.audio?.data?.length) {
			this.saveCallAudio(cached);
			return;
		}
		this.downloadingCallId = callId;
		this.client.requestCallDownload(callId);
	}

	private saveCallAudio(call: SocketCall) {
		if (!call.audio?.data?.length) return;
		const bytes = new Uint8Array(call.audio.data);
		const blob = new Blob([bytes], { type: call.audioType || 'audio/wav' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = call.audioName || `call-${call.id}`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	private playNextCall() {
		if (this.playbackCallId == null) return;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		if (idx === -1) return;
		if (idx - 1 >= 0) {
			this.playCall(this.buffer[idx - 1].id, { autoAdvance: true });
		} else {
			this.stopPlayback();
		}
	}

	private handleSocketEvent(event: TlrSocketEvent) {
		switch (event.type) {
			case 'config':
				this.config = event.payload;
				if (this.systemFilter == null) {
					const systems = normalizeConfigSystems(event.payload);
					if (systems.length === 1) {
						this.systemFilter = systemRef(systems[0]);
					}
				}
				if (!this.initialSearchDone) {
					this.initialSearchDone = true;
					this.search();
				}
				break;
			case 'call-list': {
				const incoming = event.payload.results;
				this.hasMore = event.payload.hasMore;
				if (this.isLoadingMore) {
					// Append to buffer, deduplicating by id
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const existingIds = new Set(this.buffer.map((r) => r.id));
					const newCalls = incoming.filter((r) => !existingIds.has(r.id));
					this.buffer = [...this.buffer, ...newCalls];
					this.isLoadingMore = false;
				} else {
					// Fresh fetch — replace buffer
					this.buffer = incoming;
				}
				this.isLoading = false;
				this.prefetchWindow();
				if (this.isLoadingAll) {
					if (this.hasMore) {
						this.isLoadingAll = this.loadMore();
					} else {
						this.isLoadingAll = false;
					}
				}
				break;
			}
			case 'call-playback':
				this.callCache.set(event.payload.id, event.payload);
				this.prefetchInFlight.delete(event.payload.id);
				this.cacheSourceAliases(event.payload);
				this.handlePlaybackCall(event.payload);
				break;
			case 'call-download':
				this.callCache.set(event.payload.id, event.payload);
				this.cacheSourceAliases(event.payload);
				if (this.downloadingCallId === event.payload.id) {
					this.downloadingCallId = null;
					this.saveCallAudio(event.payload);
				}
				break;
			case 'call':
				this.callCache.set(event.payload.id, event.payload);
				this.prefetchInFlight.delete(event.payload.id);
				this.cacheSourceAliases(event.payload);
				if (this.pendingPlaybackId != null && event.payload.id === this.pendingPlaybackId) {
					this.handlePlaybackCall(event.payload);
				}
				break;
		}
	}

	private cacheSourceAliases(call: SocketCall) {
		if (!call.sources?.length) return;
		let changed = false;
		for (const s of call.sources) {
			if (s.src != null && s.tag && !this.sourceAliases.has(s.src)) {
				this.sourceAliases.set(s.src, s.tag);
				changed = true;
			}
		}
		if (changed) this.sourceAliases = new SvelteMap(this.sourceAliases);
	}

	private handlePlaybackCall(call: SocketCall) {
		if (this.pendingPlaybackId == null || call.id !== this.pendingPlaybackId) return;
		this.pendingPlaybackId = null;
		this.playbackCall = call;
		this.playbackLoading = false;

		if (!call.audio?.data?.length) {
			this.playbackError = 'No audio available for this call';
			if (this.autoAdvancing) this.playNextCall();
			return;
		}

		const bytes = new Uint8Array(call.audio.data);
		const mimeType = call.audioType || 'audio/wav';
		const blob = new Blob([bytes], { type: mimeType });
		this.objectUrl = URL.createObjectURL(blob);

		this.audio.volume = this.volume;
		this.audio.src = this.objectUrl;
		this.audio
			.play()
			.then(() => {
				this.isPlaying = true;
			})
			.catch(() => {
				this.playbackError = 'Playback blocked by browser';
			});
	}

	skipToNewer() {
		if (!this.playbackCallId) return;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		if (idx > 0) {
			this.playCall(this.buffer[idx - 1].id);
		}
	}

	skipToOlder() {
		if (!this.playbackCallId) return;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		if (idx >= 0 && idx < this.buffer.length - 1) {
			this.playCall(this.buffer[idx + 1].id);
		}
	}

	loadMoreIfAvailable() {
		this.loadMore();
	}

	getLiveCurrentTime(): number {
		return this.audio.currentTime;
	}

	resolveSourceAlias(sourceId: number | undefined, systemId?: number): string | undefined {
		if (sourceId == null) return undefined;
		return this.directory.unitLabel(systemId, sourceId) ?? this.sourceAliases.get(sourceId);
	}

	resolveSystemLabel(systemRef: number): string {
		return this.directory.systemLabel(systemRef);
	}

	resolveTalkgroupLabel(systemRef: number, tgRef: number): string {
		return this.directory.talkgroupLabel(systemRef, tgRef);
	}

	resolveCallLabel(call: { system: number; talkgroup: number }): string {
		return this.directory.callLabel(call);
	}

	nextAutoPlayCall(): EnrichedCallResult | null {
		if (!this.playbackCallId) return null;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		if (idx <= 0) return null;
		return this.allEnrichedCalls[idx - 1];
	}
}
