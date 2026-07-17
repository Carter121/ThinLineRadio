import { SvelteDate } from 'svelte/reactivity';
import { TlrApiError, type TlrClient } from './tlr-client.ts';
import { TlrDirectory } from './directory.ts';
import { ResumeWatcher } from './resume-watcher.ts';
import type { TlrAlertFeed } from './tlr-alert-feed.svelte.ts';
import type { TlrConfig, TlrConnectionState, TlrSocketEvent } from './types.ts';
import type { AudioCoordinator } from '$lib/features/AudioCoordinator.svelte.ts';
import { AlertFeedCardState } from '$lib/features/dashboard/AlertFeedCardState.svelte.ts';
import { AudioPlayerState } from '$lib/features/live-audio/AudioPlayerState.svelte.ts';

const PRIVATE_REFRESH_MS = 90_000;

/**
 * Shared TLR session lifecycle for the app shell: auth state,
 * socket event handling, the periodic private-data refresh, and a private-data
 * refresh whenever the page resumes from being backgrounded (the socket itself
 * is recovered by TlrAlertFeed's ResumeWatcher).
 *
 * Subclasses own their card states and plug in via the protected hooks.
 */
export abstract class TlrSessionState {
	authenticated = $state(false);
	requiresLogin = $state(false);
	isStarting = $state(true);
	isHydrating = $state(false);
	isLoggingIn = $state(false);

	config = $state.raw<TlrConfig | null>(null);
	directory = $derived(new TlrDirectory(this.config));
	connection = $state<TlrConnectionState>({ status: 'idle', attempt: 0 });
	listenerCount = $state<number | null>(null);
	livefeedEnabled = $state(false);

	privateError = $state<string | null>(null);
	socketError = $state<string | null>(null);
	authError = $state<string | null>(null);

	lastPrivateRefreshAt = $state<number | null>(null);
	version = $state<string | null>(null);
	branding = $state<string | null>(null);

	now = new SvelteDate();

	connectionLabel = $derived.by(() => {
		switch (this.connection.status) {
			case 'authenticated':
				return 'Live';
			case 'authenticating':
				return 'Authenticating';
			case 'connecting':
				return 'Connecting';
			case 'connected':
				return 'Connected';
			case 'expired':
				return 'PIN Expired';
			case 'limited':
				return 'Connection Limited';
			case 'error':
				return 'Socket Error';
			case 'disconnected':
				return 'Disconnected';
			default:
				return 'Idle';
		}
	});

	readonly audioPlayer: AudioPlayerState;
	readonly alertCard: AlertFeedCardState;

	protected client: TlrClient;
	protected feed: TlrAlertFeed;

	private clockInterval: ReturnType<typeof setInterval> | null = null;
	private privateRefreshInterval: ReturnType<typeof setInterval> | null = null;
	private unsubscribeSocket: (() => void) | null = null;
	private started = false;
	// Socket recovery and alert resync are handled by TlrAlertFeed's own
	// ResumeWatcher; the session layer only needs to refresh its private data.
	private resumeWatcher = new ResumeWatcher(() => {
		if (this.authenticated) void this.refreshPrivateData();
	});

	constructor(client: TlrClient, coordinator: AudioCoordinator, feed: TlrAlertFeed) {
		this.client = client;
		this.feed = feed;
		this.authenticated = client.isAuthenticated;
		this.audioPlayer = new AudioPlayerState(client, coordinator);
		this.alertCard = new AlertFeedCardState(feed, coordinator, client);
	}

	/** Fetches run by the periodic private-data refresh (stats, system alerts, ...). */
	protected abstract privateRefreshTasks(): Array<Promise<unknown>>;
	/** Called after a private refresh where at least one task succeeded. */
	protected onPrivateRefreshSuccess(): void {}
	protected onClockTick(): void {}
	protected onStarted(): void {}
	protected onAuthenticated(): void {}
	protected onLogout(): void {}
	protected onDestroyed(): void {}

	async start() {
		if (this.started) return;
		this.started = true;
		this.isStarting = true;

		if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
			void Notification.requestPermission();
		}

		this.unsubscribeSocket = this.client.subscribe((event) => this.handleSocketEvent(event));

		this.clockInterval = setInterval(() => {
			this.now.setTime(Date.now());
			this.onClockTick();
		}, 1000);

		this.privateRefreshInterval = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			if (this.authenticated) void this.refreshPrivateData();
		}, PRIVATE_REFRESH_MS);

		this.resumeWatcher.start();

		this.client.connectSocket();
		this.onStarted();

		if (this.authenticated) {
			await this.refreshPrivateData({ initial: true });
		}

		this.isStarting = false;
	}

	async onLoginSuccess() {
		this.authenticated = true;
		this.requiresLogin = false;
		this.authError = null;
		this.privateError = null;
		this.socketError = null;
		this.onAuthenticated();
		this.client.connectSocket();
		this.client.authenticateSocket();
		await this.refreshPrivateData({ initial: true });
	}

	logout() {
		this.client.clearPin();
		this.authenticated = false;
		this.requiresLogin = false;
		this.authError = null;
		this.privateError = null;
		this.feed.reset();
		this.alertCard.reset();
		this.livefeedEnabled = false;
		this.audioPlayer.destroy();
		this.onLogout();
		this.client.disconnectSocket();
		this.client.connectSocket();
	}

	destroy() {
		this.started = false;
		if (this.clockInterval) clearInterval(this.clockInterval);
		if (this.privateRefreshInterval) clearInterval(this.privateRefreshInterval);
		this.resumeWatcher.stop();
		this.unsubscribeSocket?.();
		this.alertCard.destroy();
		this.audioPlayer.destroy();
		this.onDestroyed();
	}

	async refreshPrivateData(options: { initial?: boolean } = {}) {
		if (!this.authenticated) return;

		this.isHydrating = options.initial ?? false;

		const results = await Promise.allSettled(this.privateRefreshTasks());
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

		if (failures.length < results.length) {
			this.privateError = null;
			this.lastPrivateRefreshAt = Date.now();
			this.onPrivateRefreshSuccess();
		} else if (failures.length > 0) {
			const reason = failures[0].reason;
			this.privateError = reason instanceof Error ? reason.message : String(reason);
			if (reason instanceof TlrApiError && [401, 403].includes(reason.status)) {
				this.authError = reason.message;
				this.requiresLogin = true;
			}
		}

		this.isHydrating = false;
	}

	private handleSocketEvent(event: TlrSocketEvent) {
		switch (event.type) {
			case 'connection':
				this.connection = event.state;
				if (event.state.status !== 'error') this.socketError = null;
				break;
			case 'version':
				this.version = event.payload.version;
				this.branding = event.payload.branding ?? this.branding;
				break;
			case 'pin-required':
				this.requiresLogin = !this.authenticated;
				break;
			case 'pin-set':
				this.authenticated = true;
				this.requiresLogin = false;
				this.onAuthenticated();
				break;
			case 'config':
				this.config = event.payload;
				this.branding = event.payload.branding ?? this.branding;
				this.audioPlayer.syncLivefeedMap();
				break;
			case 'livefeed':
				this.livefeedEnabled = event.active;
				break;
			case 'call': {
				if (event.payload.audio?.data?.length) {
					const context = this.directory.context(event.payload.system, event.payload.talkgroup);
					this.audioPlayer.enqueue(event.payload, context);
				}
				break;
			}
			case 'call-playback':
				this.alertCard.handleCallPlayback(event.payload);
				break;
			case 'listeners':
				this.listenerCount = event.count;
				break;
			case 'expired':
				this.authError = 'Your ThinLineRadio PIN is expired.';
				this.requiresLogin = true;
				break;
			case 'limited':
				this.socketError = `Connection limit reached (${event.limit})`;
				break;
			case 'error':
				this.socketError = event.message;
				break;
		}
	}
}
