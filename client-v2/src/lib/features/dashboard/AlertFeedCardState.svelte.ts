import type { TlrClient } from '$lib/core/tlr-client.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/core/tlr-alert-feed.svelte.ts';
import type { Alert, SocketCall } from '$lib/core/types.ts';

export class AlertFeedCardState {
	alertPlaybackCallId = $state<number | null>(null);
	alertPlaybackLoading = $state(false);
	alertPlaybackError = $state<string | null>(null);
	alertIsPlaying = $state(false);
	alertCurrentTime = $state(0);
	alertDuration = $state(0);

	private feed: TlrAlertFeed;
	private coordinator: AudioCoordinator;
	private client: TlrClient;
	private callAudio: HTMLAudioElement;
	nowMs = $state(Date.now());
	private alertObjectUrl: string | null = null;
	private alertPendingPlaybackId: number | null = null;
	private nowTimer: ReturnType<typeof setInterval> | null = null;

	constructor(feed: TlrAlertFeed, coordinator: AudioCoordinator, client: TlrClient) {
		this.feed = feed;
		this.coordinator = coordinator;
		this.client = client;
		this.callAudio = coordinator.callAudio;
		this.nowTimer = setInterval(() => {
			this.nowMs = Date.now();
		}, 15_000);

		coordinator.register('alert', {
			onEnded: () => {
				if (this.alertPlaybackCallId == null || this.alertPlaybackLoading) return;
				this.alertIsPlaying = false;
				this.alertCurrentTime = 0;
				this.alertPlaybackCallId = null;
				this.coordinator.release('alert');
			},
			onTimeUpdate: (time) => {
				if (this.alertPlaybackCallId == null || this.alertPlaybackLoading) return;
				this.alertCurrentTime = time;
			},
			onLoadedMetadata: (duration) => {
				if (this.alertPlaybackCallId == null || this.alertPlaybackLoading) return;
				this.alertDuration = duration;
			},
			onYield: () => {},
			onReclaim: () => {}
		});
	}

	// Proxies to feed data so dashboard card components don't need to change
	get authenticated(): boolean {
		return this.client.isAuthenticated;
	}
	get isHydrating(): boolean {
		return false;
	}
	get alerts(): Alert[] {
		return this.feed.alerts;
	}
	get allAlerts(): Alert[] {
		return this.feed.allAlerts;
	}
	get newAlertIds(): Set<number> {
		return this.feed.newAlertIds;
	}
	get alertAddressStats() {
		return this.feed.alertAddressStats;
	}
	get alertAddressPercentage(): number {
		const { matched, total } = this.feed.alertAddressStats;
		return (matched / total) * 100;
	}
	get lastAlertRefreshAt(): number | null {
		return this.feed.lastRefreshAt;
	}
	get notificationFilter() {
		return this.feed.notificationFilter;
	}
	get recentAlertCount(): number {
		const now = Date.now();
		return this.feed.alerts.filter((alert) => now - alert.createdAt < 60 * 60 * 1000).length;
	}

	handleCallPlayback(call: SocketCall) {
		if (this.alertPendingPlaybackId == null || call.id !== this.alertPendingPlaybackId) return;
		this.alertPendingPlaybackId = null;
		this.alertPlaybackLoading = false;

		if (!call.audio?.data?.length) {
			this.alertPlaybackError = 'No audio available for this call';
			return;
		}

		const bytes = new Uint8Array(call.audio.data);
		const mimeType = call.audioType || 'audio/wav';
		const blob = new Blob([bytes], { type: mimeType });
		this.alertObjectUrl = URL.createObjectURL(blob);

		this.callAudio.src = this.alertObjectUrl;
		this.callAudio
			.play()
			.then(() => {
				this.alertIsPlaying = true;
			})
			.catch(() => {
				this.alertPlaybackError = 'Playback blocked by browser';
			});
	}

	playAlertCall(callId: number) {
		this.coordinator.acquire('alert');
		this.callAudio.pause();
		if (this.alertObjectUrl) {
			URL.revokeObjectURL(this.alertObjectUrl);
			this.alertObjectUrl = null;
		}
		this.alertPlaybackCallId = callId;
		this.alertPlaybackLoading = true;
		this.alertPlaybackError = null;
		this.alertIsPlaying = false;
		this.alertCurrentTime = 0;
		this.alertDuration = 0;
		this.alertPendingPlaybackId = callId;

		this.coordinator.prime();
		this.client.requestCallPlayback(callId);
	}

	stopAlertPlayback() {
		this.callAudio.pause();
		this.callAudio.removeAttribute('src');
		this.callAudio.load();
		if (this.alertObjectUrl) {
			URL.revokeObjectURL(this.alertObjectUrl);
		}
		this.alertObjectUrl = null;
		this.alertPlaybackCallId = null;
		this.alertPlaybackLoading = false;
		this.alertPlaybackError = null;
		this.alertIsPlaying = false;
		this.alertCurrentTime = 0;
		this.alertDuration = 0;
		this.alertPendingPlaybackId = null;
		this.coordinator.release('alert');
	}

	toggleAlertPlayPause() {
		if (this.alertIsPlaying) {
			this.callAudio.pause();
			this.alertIsPlaying = false;
		} else {
			this.callAudio
				.play()
				.then(() => {
					this.alertIsPlaying = true;
				})
				.catch(() => {});
		}
	}

	reset() {
		this.stopAlertPlayback();
	}

	destroy() {
		this.stopAlertPlayback();
		this.coordinator.unregister('alert');
		if (this.nowTimer) clearInterval(this.nowTimer);
	}
}
