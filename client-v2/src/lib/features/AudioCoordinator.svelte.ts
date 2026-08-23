import { useEventListener } from 'runed';
import { ScreenWakeLock } from '$lib/core/screen-wake-lock.ts';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

//* Grace period so gaps between queued calls don't thrash the wake lock
const WAKE_LOCK_RELEASE_DELAY_MS = 5000;

export type ConsumerId = 'live' | 'call-history' | 'alert';

export interface ConsumerCallbacks {
	onEnded: () => void;
	onTimeUpdate: (time: number) => void;
	onLoadedMetadata: (duration: number) => void;
	onYield: () => void;
	onReclaim: () => void;
}

/**
 * Centralizes ownership of the shared call audio element.
 *
 * Only one consumer owns `callAudio` at a time. Events are routed
 * exclusively to the current owner. When a new consumer acquires
 * ownership the previous owner is yielded and can be reclaimed later.
 *
 * Must be constructed during component initialization (uses runed's
 * useEventListener for automatic cleanup).
 */
export class AudioCoordinator {
	readonly callAudio: HTMLAudioElement;
	readonly notificationAudio: HTMLAudioElement;

	private owner: ConsumerId | null = null;
	private previousOwner: ConsumerId | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private consumers = new Map<ConsumerId, ConsumerCallbacks>();

	//* Only callAudio drives this, so the notification chime never holds the screen awake
	private wakeLock = new ScreenWakeLock();
	private wakeLockReleaseTimer: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		this.callAudio = new Audio();
		this.notificationAudio = new Audio('/alert.wav');

		useEventListener(
			() => this.callAudio,
			'ended',
			() => this.consumers.get(this.owner!)?.onEnded()
		);

		useEventListener(
			() => this.callAudio,
			'timeupdate',
			() => this.consumers.get(this.owner!)?.onTimeUpdate(this.callAudio.currentTime)
		);

		useEventListener(
			() => this.callAudio,
			'loadedmetadata',
			() => this.consumers.get(this.owner!)?.onLoadedMetadata(this.callAudio.duration)
		);

		useEventListener(
			() => this.callAudio,
			'playing',
			() => {
				//* Ignore the silent priming clip so a play tap alone doesn't hold the screen
				if (this.callAudio.src === SILENT_WAV) return;
				this.clearWakeLockReleaseTimer();
				this.wakeLock.request();
			}
		);

		for (const event of ['pause', 'ended', 'emptied'] as const) {
			useEventListener(
				() => this.callAudio,
				event,
				() => this.scheduleWakeLockRelease()
			);
		}
	}

	/** Snapshot for the debug badge. Reads the live sentinel, not our stored intent. */
	wakeLockDebug() {
		return {
			supported: this.wakeLock.supported,
			active: this.wakeLock.active,
			requested: this.wakeLock.requested,
			releasePending: this.wakeLockReleaseTimer !== null,
			audioPaused: this.callAudio.paused,
			lastError: this.wakeLock.lastError
		};
	}

	private clearWakeLockReleaseTimer() {
		if (this.wakeLockReleaseTimer === null) return;
		clearTimeout(this.wakeLockReleaseTimer);
		this.wakeLockReleaseTimer = null;
	}

	private scheduleWakeLockRelease() {
		this.clearWakeLockReleaseTimer();
		this.wakeLockReleaseTimer = setTimeout(() => {
			this.wakeLockReleaseTimer = null;
			if (this.callAudio.paused) this.wakeLock.release();
		}, WAKE_LOCK_RELEASE_DELAY_MS);
	}

	destroy() {
		this.clearWakeLockReleaseTimer();
		this.wakeLock.destroy();
	}

	//* Returns an unregister function that only fires while these exact callbacks are current.
	//* Tabs share ids (every alert surface is 'alert') and the incoming tab mounts before the
	//* outgoing one runs onDestroy, so an id-only delete would evict its replacement.
	register(id: ConsumerId, callbacks: ConsumerCallbacks): () => void {
		this.consumers.set(id, callbacks);
		return () => {
			if (this.consumers.get(id) !== callbacks) return;
			this.consumers.delete(id);
			if (this.owner === id) this.owner = null;
			if (this.previousOwner === id) this.previousOwner = null;
		};
	}

	/** Yield current owner and set new owner. */
	acquire(id: ConsumerId) {
		if (this.owner === id) return;
		if (this.owner) {
			this.consumers.get(this.owner)?.onYield();
			this.previousOwner = this.owner;
		}
		this.owner = id;
	}

	/** Clear ownership and reclaim the previous owner if there was one. */
	release(id: ConsumerId) {
		if (this.owner !== id) return;
		this.owner = null;
		if (this.previousOwner) {
			const prev = this.previousOwner;
			this.previousOwner = null;
			this.owner = prev;
			this.consumers.get(prev)?.onReclaim();
		}
	}

	/** Play a silent WAV during a user gesture to satisfy Chromium autoplay policy. */
	prime() {
		this.callAudio.src = SILENT_WAV;
		this.callAudio.play().catch(() => {});
	}

	/** Play the notification ding sound. */
	playNotification() {
		this.notificationAudio.currentTime = 0;
		this.notificationAudio.play().catch(() => {});
	}
}
