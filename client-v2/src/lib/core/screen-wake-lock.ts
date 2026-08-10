//* Holds a screen wake lock while something wants the screen kept on.
//* No-ops when the API is unavailable (insecure origin, older browsers).
export class ScreenWakeLock {
	private sentinel: WakeLockSentinel | null = null;
	private wanted = false;
	private acquiring = false;
	private onVisibilityChange: () => void;

	//* Surfaced by the debug status badge
	lastError: string | null = null;

	constructor() {
		this.onVisibilityChange = () => {
			//* The OS drops the lock whenever the tab goes hidden, so re-acquire on return
			if (this.wanted && document.visibilityState === 'visible') void this.acquire();
		};
		document.addEventListener('visibilitychange', this.onVisibilityChange);
	}

	get supported() {
		return 'wakeLock' in navigator;
	}

	/** True only if a sentinel exists and the browser still reports it as held. */
	get active() {
		return this.sentinel !== null && !this.sentinel.released;
	}

	/** Whether playback currently wants the screen awake, regardless of whether we hold a lock. */
	get requested() {
		return this.wanted;
	}

	request() {
		this.wanted = true;
		void this.acquire();
	}

	release() {
		this.wanted = false;
		const sentinel = this.sentinel;
		this.sentinel = null;
		void sentinel?.release().catch(() => {});
	}

	destroy() {
		this.release();
		document.removeEventListener('visibilitychange', this.onVisibilityChange);
	}

	private async acquire() {
		if (this.sentinel || this.acquiring) return;
		if (!this.supported) {
			this.lastError = 'unsupported';
			return;
		}
		this.acquiring = true;
		try {
			const sentinel = await navigator.wakeLock.request('screen');
			//* Playback may have stopped while the request was in flight
			if (!this.wanted) {
				void sentinel.release().catch(() => {});
				return;
			}
			this.sentinel = sentinel;
			this.lastError = null;
			sentinel.addEventListener('release', () => {
				if (this.sentinel === sentinel) this.sentinel = null;
			});
		} catch (error) {
			//* Rejects while the document is hidden or if the user agent refuses
			this.lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		} finally {
			this.acquiring = false;
		}
	}
}
