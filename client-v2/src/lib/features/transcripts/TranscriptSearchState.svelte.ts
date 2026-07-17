import { TlrApiError, type TlrClient } from '$lib/core/tlr-client.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/core/tlr-alert-feed.svelte.ts';
import type { TlrConfig, Transcript, TlrSocketEvent } from '$lib/core/types.ts';
import { TlrDirectory } from '$lib/core/directory.ts';
import { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
import { createSearchParamsSchema, useSearchParams } from 'runed/kit';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;
const ALL = 'all';

const searchParamsSchema = createSearchParamsSchema({
	q: { type: 'string', default: '' },
	system: { type: 'string', default: '' },
	talkgroup: { type: 'string', default: '' }
});

function numberFromParam(value: string): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export class TranscriptSearchState {
	#searchParams = useSearchParams(searchParamsSchema, {
		pushHistory: false,
		noScroll: true
	});

	get searchQuery(): string {
		return this.#searchParams.q;
	}
	set searchQuery(value: string) {
		this.#searchParams.q = value;
		this.scheduleSearch();
	}

	// Select-friendly accessors ('all' sentinel) over the URL-backed filters
	get systemFilterValue(): string {
		return this.#searchParams.system || ALL;
	}
	set systemFilterValue(value: string) {
		this.#searchParams.system = value === ALL ? '' : value;
		this.#searchParams.talkgroup = '';
		this.page = 1;
		void this.search();
	}

	get talkgroupFilterValue(): string {
		return this.#searchParams.talkgroup || ALL;
	}
	set talkgroupFilterValue(value: string) {
		this.#searchParams.talkgroup = value === ALL ? '' : value;
		this.page = 1;
		void this.search();
	}

	get systemFilter(): number | undefined {
		return numberFromParam(this.#searchParams.system);
	}
	get talkgroupFilter(): number | undefined {
		return numberFromParam(this.#searchParams.talkgroup);
	}

	page = $state(1);
	results = $state.raw<Transcript[]>([]);
	hasMore = $state(false);
	isLoading = $state(false);
	hasSearched = $state(false);
	error = $state<string | null>(null);

	config = $state.raw<TlrConfig | null>(null);
	directory = $derived(new TlrDirectory(this.config));
	talkgroupsForSystem = $derived(this.directory.system(this.systemFilter)?.talkgroups ?? []);

	// Playback layer — same controls the Alert Log cards use
	readonly alertFeed: AlertFeedCardState;

	private client: TlrClient;
	private unsubscribeSocket: (() => void) | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private requestSeq = 0;

	constructor(client: TlrClient, coordinator: AudioCoordinator, feed: TlrAlertFeed) {
		this.client = client;
		this.alertFeed = new AlertFeedCardState(feed, coordinator, client);
	}

	get authenticated(): boolean {
		return this.client.isAuthenticated;
	}

	start() {
		this.unsubscribeSocket = this.client.subscribe((event: TlrSocketEvent) => {
			if (event.type === 'config') this.config = event.payload;
			if (event.type === 'call-playback') this.alertFeed.handleCallPlayback(event.payload);
		});
		this.client.connectSocket();
		if (this.authenticated) {
			void this.search();
		} else {
			this.hasSearched = true;
			this.error = 'Sign in on the Dashboard tab to search transcripts.';
		}
	}

	destroy() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.requestSeq += 1;
		this.unsubscribeSocket?.();
		this.alertFeed.destroy();
	}

	setPage(page: number) {
		this.page = Math.max(1, page);
		void this.search();
	}

	private scheduleSearch() {
		this.page = 1;
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			void this.search();
		}, SEARCH_DEBOUNCE_MS);
	}

	async search() {
		const seq = ++this.requestSeq;
		this.isLoading = true;
		this.error = null;
		try {
			const results = await this.client.getTranscripts({
				limit: PAGE_SIZE,
				offset: (this.page - 1) * PAGE_SIZE,
				systemId: this.systemFilter,
				talkgroupId: this.talkgroupFilter,
				search: this.searchQuery.trim() || undefined
			});
			if (seq !== this.requestSeq) return;
			this.results = results;
			this.hasMore = results.length === PAGE_SIZE;
			this.hasSearched = true;
		} catch (error) {
			if (seq !== this.requestSeq) return;
			this.results = [];
			this.hasMore = false;
			if (error instanceof TlrApiError && [401, 403].includes(error.status)) {
				this.error = 'Sign in on the Dashboard tab to search transcripts.';
			} else {
				this.error = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (seq === this.requestSeq) this.isLoading = false;
		}
	}
}
