import type { TlrClient } from '$lib/core/tlr-client.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/core/tlr-alert-feed.svelte.ts';
import { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
import type { Alert, TranscriptAnnotationUnit, TlrSocketEvent } from '$lib/core/types.ts';
import { groupAlertsByIncident } from '$lib/core/incident-grouping.ts';
import { displayAddress } from '$lib/core/format.ts';

export type TimeWindow = '1h' | '6h' | '24h' | 'all';

export const TIME_WINDOWS: { value: TimeWindow; label: string; ms: number }[] = [
	{ value: '1h', label: '1h', ms: 60 * 60 * 1000 },
	{ value: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
	{ value: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
	{ value: 'all', label: 'All', ms: Infinity }
];

export const UNKNOWN_TYPE = 'Unknown';

export interface GeocodedIncident {
	//* Stable marker identity: the server incidentId when threaded, else the alert id
	key: string;
	incidentId: number | null;
	//* Newest member alert; drives age band, selection, and playback
	alert: Alert;
	//* All member alerts, newest first
	alerts: Alert[];
	callCount: number;
	lat: number;
	lon: number;
	address: string;
	incidentType: string | null;
	//* True for low-confidence geocodes; the map renders these pins hollow
	uncertain: boolean;
	units: TranscriptAnnotationUnit[];
}

export class MapPageState {
	timeWindow = $state<TimeWindow>('all');
	typeFilter = $state<string[]>([]);

	selectedAlertId = $state<number | null>(null);
	selectionSource = $state<'map' | 'list' | null>(null);

	//* Playback layer, same consumer as the dashboard/alert-log cards; safe because tabs are mutually exclusive.
	readonly alertFeed: AlertFeedCardState;

	private feed: TlrAlertFeed;
	private client: TlrClient;
	private unsubscribeSocket: (() => void) | null = null;

	constructor(feed: TlrAlertFeed, coordinator: AudioCoordinator, client: TlrClient) {
		this.feed = feed;
		this.client = client;
		this.alertFeed = new AlertFeedCardState(feed, coordinator, client);
	}

	//* 15s ticker from the playback layer; drives marker re-aging and relative times.
	get nowMs(): number {
		return this.alertFeed.nowMs;
	}

	start() {
		this.unsubscribeSocket = this.client.subscribe((event: TlrSocketEvent) => {
			if (event.type === 'call-playback') this.alertFeed.handleCallPlayback(event.payload);
		});
		this.client.connectSocket();
	}

	destroy() {
		this.unsubscribeSocket?.();
		this.alertFeed.destroy();
	}

	//* feed.alerts is $state.raw and replaced wholesale, so a full re-derive is
	//* correct. One entry per incident group: threaded calls share a pin.
	get incidents(): GeocodedIncident[] {
		const result: GeocodedIncident[] = [];
		for (const group of groupAlertsByIncident(this.feed.alerts)) {
			//* Pin on the newest member that geocoded
			const located = group.alerts.find((a) => a.parsedAddress?.match);
			const match = located?.parsedAddress?.match;
			if (!located || !match) continue;
			result.push({
				key: group.key,
				incidentId: group.incidentId,
				alert: group.newest,
				alerts: group.alerts,
				callCount: group.alerts.length,
				lat: match.lat,
				lon: match.lon,
				address: displayAddress(located.parsedAddress) ?? match.fullAddress,
				incidentType: group.incidentType,
				uncertain: match.precision === 'uncertain',
				units: group.units
			});
		}
		return result.sort((a, b) => b.alert.createdAt - a.alert.createdAt);
	}

	get incidentTypes(): string[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const types = new Set<string>();
		let hasUnknown = false;
		for (const incident of this.incidents) {
			if (incident.incidentType) types.add(incident.incidentType);
			else hasUnknown = true;
		}
		const sorted = [...types].sort();
		if (hasUnknown) sorted.push(UNKNOWN_TYPE);
		return sorted;
	}

	get filteredIncidents(): GeocodedIncident[] {
		const windowMs = TIME_WINDOWS.find((w) => w.value === this.timeWindow)?.ms ?? Infinity;
		return this.incidents.filter((incident) => {
			if (this.nowMs - incident.alert.createdAt > windowMs) return false;
			if (this.typeFilter.length === 0) return true;
			return this.typeFilter.includes(incident.incidentType ?? UNKNOWN_TYPE);
		});
	}

	select(alertId: number, source: 'map' | 'list') {
		this.selectedAlertId = alertId;
		this.selectionSource = source;
	}
}
