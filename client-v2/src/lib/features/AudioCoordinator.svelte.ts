import { useEventListener } from 'runed';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

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
	}

	register(id: ConsumerId, callbacks: ConsumerCallbacks) {
		this.consumers.set(id, callbacks);
	}

	unregister(id: ConsumerId) {
		this.consumers.delete(id);
		if (this.owner === id) this.owner = null;
		if (this.previousOwner === id) this.previousOwner = null;
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
