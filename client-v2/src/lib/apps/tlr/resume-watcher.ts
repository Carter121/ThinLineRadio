/**
 * Invokes a callback when the page comes back to life after being hidden,
 * frozen (PWA backgrounded on mobile), restored from the bfcache, or
 * reconnected to the network. `hiddenMs` is how long the page was hidden,
 * so callers can decide between a light touch and a full reconnect.
 */
export class ResumeWatcher {
	private hiddenAt: number | null = null;
	private cleanup: (() => void) | null = null;
	private onResume: (info: { hiddenMs: number }) => void;

	constructor(onResume: (info: { hiddenMs: number }) => void) {
		this.onResume = onResume;
	}

	start() {
		if (typeof document === 'undefined' || typeof window === 'undefined' || this.cleanup) return;

		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				this.hiddenAt = Date.now();
			} else {
				this.fire();
			}
		};
		// pageshow with persisted=true means a bfcache restore — treat as resume
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) this.fire();
		};
		const onOnline = () => this.fire();

		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('pageshow', onPageShow);
		window.addEventListener('online', onOnline);
		this.cleanup = () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('pageshow', onPageShow);
			window.removeEventListener('online', onOnline);
		};
	}

	stop() {
		this.cleanup?.();
		this.cleanup = null;
		this.hiddenAt = null;
	}

	private fire() {
		const hiddenMs = this.hiddenAt == null ? 0 : Date.now() - this.hiddenAt;
		this.hiddenAt = null;
		this.onResume({ hiddenMs });
	}
}
