import { SvelteDate } from 'svelte/reactivity';
import type { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/apps/tlr/tlr-alert-feed.svelte.ts';
import { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
import type { Alert, TlrSocketEvent } from '$lib/apps/tlr/types.ts';
import { getTranscriptText } from '$lib/apps/tlr/format.ts';

const PAGE_SIZE = 20;

export interface AlertFilterOption {
	value: string;
	label: string;
}

export class AlertHistoryState {
	// Filters
	systemFilter = $state<string>('All Systems');
	talkgroupFilter = $state<string>('All Talkgroups');
	battalionOnly = $state(false);
	searchQuery = $state('');

	// Pagination
	pageSize = PAGE_SIZE;
	currentPage = $state(1);

	now = new SvelteDate();

	get nowMs(): number {
		return this.now.getTime();
	}

	// Playback layer — exposed to AlertCard
	readonly alertFeed: AlertFeedCardState;

	private feed: TlrAlertFeed;
	private client: TlrClient;
	private clockInterval: ReturnType<typeof setInterval> | null = null;
	private unsubscribeSocket: (() => void) | null = null;

	constructor(feed: TlrAlertFeed, coordinator: AudioCoordinator, client: TlrClient) {
		this.feed = feed;
		this.client = client;
		this.alertFeed = new AlertFeedCardState(feed, coordinator, client);
	}

	start() {
		this.clockInterval = setInterval(() => this.now.setTime(Date.now()), 1000);

		this.unsubscribeSocket = this.client.subscribe((event: TlrSocketEvent) => {
			if (event.type === 'call-playback') this.alertFeed.handleCallPlayback(event.payload);
		});

		this.client.connectSocket();
	}

	destroy() {
		if (this.clockInterval) clearInterval(this.clockInterval);
		this.unsubscribeSocket?.();
		this.alertFeed.destroy();
	}

	// Derive available systems from alert data
	get systems(): AlertFilterOption[] {
		const allAlerts = this.feed.allAlerts;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Map<number, string>();
		for (const a of allAlerts) {
			if (!seen.has(a.systemId)) {
				seen.set(a.systemId, a.systemLabel ?? String(a.systemId));
			}
		}
		return [...seen.entries()].map(([id, label]) => ({ value: String(id), label }));
	}

	// Derive available talkgroups from alerts matching the selected system
	get talkgroupsForSystem(): AlertFilterOption[] {
		if (this.systemFilter === 'All Systems') return [];
		const sysId = Number(this.systemFilter);
		const allAlerts = this.feed.allAlerts;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Map<number, string>();
		for (const a of allAlerts) {
			if (a.systemId !== sysId && a.systemRef !== sysId) continue;
			if (!seen.has(a.talkgroupId)) {
				seen.set(a.talkgroupId, a.talkgroupLabel ?? a.talkgroupName ?? String(a.talkgroupId));
			}
		}
		return [...seen.entries()].map(([id, label]) => ({ value: String(id), label }));
	}

	// Filtered alerts (client-side)
	get filteredAlerts(): Alert[] {
		let result = this.feed.allAlerts;

		if (this.systemFilter !== 'All Systems') {
			const sysRef = Number(this.systemFilter);
			result = result.filter((a) => a.systemId === sysRef || a.systemRef === sysRef);
		}
		if (this.talkgroupFilter !== 'All Talkgroups') {
			const tgRef = Number(this.talkgroupFilter);
			result = result.filter((a) => a.talkgroupId === tgRef);
		}
		if (this.battalionOnly) {
			result = result.filter((a) => a.transcriptAnnotations?.some((ann) => ann.type === 'unit' && ann.apparatus === 'BATTALION'));
		}
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.toLowerCase();
			result = result.filter((a) => getTranscriptText(a).toLowerCase().includes(q));
		}

		return result;
	}

	get pageCount(): number {
		return Math.max(1, Math.ceil(this.filteredAlerts.length / this.pageSize));
	}

	get pagedAlerts(): Alert[] {
		const start = (this.currentPage - 1) * this.pageSize;
		return this.filteredAlerts.slice(start, start + this.pageSize);
	}

	setPage(page: number) {
		this.currentPage = Math.max(1, Math.min(page, this.pageCount));
	}
}
