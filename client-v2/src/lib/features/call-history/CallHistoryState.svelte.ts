import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { TlrApiError, type TlrClient } from '$lib/core/tlr-client.ts';
import { type LclFilters, type LclResultItem, type SocketCall, type TlrConfig, type TlrSocketEvent } from '$lib/core/types.ts';
import { TlrDirectory } from '$lib/core/directory.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import { DateTime } from 'luxon';
import { getLocalTimeZone, parseDate, today, type DateValue } from '@internationalized/date';
import { useSearchParams } from 'runed/kit';
import { callSearchParamsSchema } from './call-search-params.ts';
import { PersistedState } from 'runed';
import { channelChoices, parseChannelSelection, resolveChannelSelection, selectionSummary, type ChannelSelection } from './channel-selection.ts';

const PAGE_SIZE = 20;
//* Fetch 10 pages worth of data as a buffer
const FETCH_SIZE = PAGE_SIZE * 20;
//* Max audio blobs kept in the in-memory LRU cache
const AUDIO_CACHE_MAX = 40;
//* How many upcoming calls to prefetch while one is playing
const LOOKAHEAD_COUNT = 5;
const VOLUME_STORAGE_KEY = 'tlr-history-volume';

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

//* Builds a download name when the server does not supply one via Content-Disposition
function fallbackFilename(callId: number, mimeType: string): string {
	const ext = mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'audio/wav' || mimeType === 'audio/x-wav' ? 'wav' : 'm4a';
	return `call-${callId}.${ext}`;
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
	#searchParams = useSearchParams(callSearchParamsSchema, {
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

	get selection(): ChannelSelection {
		return parseChannelSelection(this.#searchParams.selection);
	}

	applySelection(selection: ChannelSelection) {
		this.#searchParams.selection = parseChannelSelection(selection);
		this.search();
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
	searchError = $state<string | null>(null);
	private socketReady = false;
	results = $derived.by((): LclResultItem[] => this.buffer.slice(this.offset, this.offset + this.pageSize));

	// Playback
	playbackCallId = $state<number | null>(null);
	playbackCall = $state.raw<LclResultItem | null>(null);
	playbackLoading = $state(false);
	playbackError = $state<string | null>(null);
	isPlaying = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	//* Volume persists across reloads (and syncs across tabs) via localStorage
	private volumeState = new PersistedState<number>(VOLUME_STORAGE_KEY, 1);

	// Download
	downloadingCallId = $state<number | null>(null);
	//* Intentionally not persisted; the download column resets to hidden on every page load
	showDownloads = $state(false);

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

	channelChoices = $derived(channelChoices(this.config));
	selectionSummary = $derived(selectionSummary(this.selection, this.channelChoices));
	selectionNotices = $derived(resolveChannelSelection(this.selection, this.config, this.systemFilter).notices);

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
	private autoAdvancing = false;
	private initialSearchDone = false;
	private userRequestedPause = false;
	//* Invalidates stale async audio fetches when a newer play or stop happens
	private playbackToken = 0;
	//* Set when a call ends while the list is refreshing; resumed on the next call-list
	private pendingAdvanceFromId: number | null = null;
	//* id to audio blob, bounded LRU via Map insertion order
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private audioCache = new Map<number, Blob>();
	//* Dedups fetches between lookahead prefetch and playCall
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private audioInFlight = new Map<number, Promise<Blob>>();
	private unregisterConsumer: () => void;

	constructor(client: TlrClient, coordinator: AudioCoordinator) {
		this.client = client;
		this.coordinator = coordinator;
		this.audio = coordinator.callAudio;

		this.unregisterConsumer = coordinator.register('call-history', {
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
		this.unregisterConsumer();
	}

	search() {
		if (!this.config || !this.socketReady) return;
		this.isLoading = true;
		this.isLoadingAll = false;
		this.searchError = null;
		this.offset = 0;
		this.buffer = [];
		this.hasMore = false;
		this.audioCache.clear();
		const filters: LclFilters = {
			limit: FETCH_SIZE,
			sort: this.sortDirection,
			date: this.selectedDateStart(),
			system: this.systemFilter,
			channels: resolveChannelSelection(this.selection, this.config, this.systemFilter).channels
		};
		this.client.requestCallList(filters);
	}

	private loadMore(): boolean {
		if (!this.socketReady || this.isLoading || !this.hasMore || this.buffer.length === 0) return false;
		if (!this.client.requestCallListPage(this.fetchedCount)) return false;
		this.isLoading = true;
		this.searchError = null;
		return true;
	}

	loadAll() {
		if (this.isLoading || !this.hasMore) return;
		this.isLoadingAll = this.loadMore();
	}

	cancelLoadAll() {
		this.isLoadingAll = false;
	}

	//* Server offsets count fetched rows even if a shifted page repeats a displayed call.
	private fetchedCount = 0;

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

	//* Resolves audio for a call: LRU hit, in-flight join, or a fresh HTTP fetch
	private getAudio(callId: number): Promise<Blob> {
		const cached = this.audioCache.get(callId);
		if (cached) {
			//* Re-insert to mark as most recently used
			this.audioCache.delete(callId);
			this.audioCache.set(callId, cached);
			return Promise.resolve(cached);
		}
		const inFlight = this.audioInFlight.get(callId);
		if (inFlight) return inFlight;
		const fetchPromise = this.client
			.getCallAudioBlob(callId)
			.then((blob) => {
				this.audioCache.set(callId, blob);
				while (this.audioCache.size > AUDIO_CACHE_MAX) {
					const oldest = this.audioCache.keys().next().value;
					if (oldest == null) break;
					this.audioCache.delete(oldest);
				}
				return blob;
			})
			.finally(() => {
				this.audioInFlight.delete(callId);
			});
		this.audioInFlight.set(callId, fetchPromise);
		return fetchPromise;
	}

	//* Warms audio for the next calls in auto-advance order so playback stays gapless
	private lookahead(fromCallId: number) {
		const idx = this.buffer.findIndex((r) => r.id === fromCallId);
		if (idx === -1) return;
		for (let i = 1; i <= LOOKAHEAD_COUNT; i++) {
			const next = this.buffer[idx - i];
			if (!next) break;
			this.getAudio(next.id).catch(() => {});
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
		this.pendingAdvanceFromId = null;
		this.playbackCallId = callId;
		//* The playback bar only needs the list row (system/talkgroup), not the audio payload
		this.playbackCall = this.buffer.find((r) => r.id === callId) ?? null;
		this.playbackError = null;
		this.isPlaying = false;
		this.autoAdvancing = options.autoAdvance ?? false;
		this.currentTime = 0;
		this.duration = 0;

		// Prime the audio element during the user gesture to satisfy Chromium autoplay policy.
		this.coordinator.prime();

		const token = ++this.playbackToken;
		this.playbackLoading = true;
		this.getAudio(callId)
			.then((blob) => {
				if (token !== this.playbackToken) return;
				this.playbackLoading = false;
				this.startPlayback(blob);
				this.lookahead(callId);
			})
			.catch((err) => {
				if (token !== this.playbackToken) return;
				this.playbackLoading = false;
				this.playbackError = err instanceof TlrApiError && err.status === 404 ? 'No audio available for this call' : 'Failed to load call audio';
				if (this.autoAdvancing) this.playNextCall();
			});
	}

	private startPlayback(blob: Blob) {
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
		this.playbackToken++;
		this.pendingAdvanceFromId = null;
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

	async downloadCall(callId: number) {
		this.downloadingCallId = callId;
		try {
			//* Fetch over HTTP even if cached; the response carries the real filename
			const { blob, filename } = await this.client.getCallAudioDownload(callId);
			this.saveBlob(blob, filename ?? fallbackFilename(callId, blob.type));
		} catch {
			//* No dedicated download error UI; just reset the spinner
		} finally {
			this.downloadingCallId = null;
		}
	}

	private saveBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	private playNextCall() {
		if (this.playbackCallId == null) return;
		const idx = this.buffer.findIndex((r) => r.id === this.playbackCallId);
		if (idx === -1) {
			//* A list refresh emptied the buffer mid-playback; resume once the new list arrives
			if (this.isLoading) this.pendingAdvanceFromId = this.playbackCallId;
			return;
		}
		if (idx - 1 >= 0) {
			this.playCall(this.buffer[idx - 1].id, { autoAdvance: true });
		} else {
			this.stopPlayback();
		}
	}

	private handleSocketEvent(event: TlrSocketEvent) {
		switch (event.type) {
			case 'connection':
				this.socketReady = ['connected', 'authenticated'].includes(event.state.status);
				if (['connecting', 'disconnected', 'expired', 'limited'].includes(event.state.status)) {
					this.initialSearchDone = false;
					this.isLoading = false;
					this.isLoadingAll = false;
				}
				break;
			case 'config':
				this.config = event.payload;
				if (!this.initialSearchDone && this.socketReady) {
					this.initialSearchDone = true;
					this.search();
				}
				break;
			case 'call-list-error':
			case 'call-list': {
				this.isLoading = false;
				if (event.type === 'call-list-error') {
					this.searchError = event.message;
					this.isLoadingAll = false;
					this.pendingAdvanceFromId = null;
					return;
				}
				const incoming = event.payload.results;
				this.hasMore = event.payload.hasMore && incoming.length > 0;
				this.fetchedCount = event.replace ? incoming.length : this.fetchedCount + incoming.length;
				const seen = new SvelteSet(event.replace ? [] : this.buffer.map((r) => r.id));
				const newCalls = incoming.filter((r) => {
					if (seen.has(r.id)) return false;
					seen.add(r.id);
					return true;
				});
				this.buffer = event.replace ? newCalls : [...this.buffer, ...newCalls];
				this.resumeDeferredAdvance();
				if (this.isLoadingAll) this.isLoadingAll = this.loadMore();
				break;
			}
			case 'call':
				//* Live call events still carry source unit tags worth caching
				this.cacheSourceAliases(event.payload);
				break;
		}
	}

	//* Continues auto-advance that was deferred while the list refreshed mid-playback
	private resumeDeferredAdvance() {
		if (this.pendingAdvanceFromId == null) return;
		const fromId = this.pendingAdvanceFromId;
		this.pendingAdvanceFromId = null;
		const idx = this.buffer.findIndex((r) => r.id === fromId);
		if (idx > 0) {
			this.playCall(this.buffer[idx - 1].id, { autoAdvance: true });
		} else {
			this.stopPlayback();
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
