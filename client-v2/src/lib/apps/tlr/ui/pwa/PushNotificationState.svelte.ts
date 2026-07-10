import type { TlrClient } from '$lib/apps/tlr/tlr-client.ts';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(base64);
	const buffer = new ArrayBuffer(raw.length);
	const output = new Uint8Array(buffer);
	for (let i = 0; i < raw.length; i++) {
		output[i] = raw.charCodeAt(i);
	}
	return output;
}

export class PushNotificationState {
	subscribed = $state(false);
	loading = $state(false);
	error = $state<string | null>(null);

	private client: TlrClient;

	constructor(client: TlrClient) {
		this.client = client;
	}

	get isSupported(): boolean {
		return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	}

	async checkSubscription(): Promise<void> {
		if (!this.isSupported) return;
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			this.subscribed = sub !== null;
		} catch {
			this.subscribed = false;
		}
	}

	async subscribe(): Promise<void> {
		if (!this.isSupported) {
			this.error = 'Web Push is not supported in this browser.';
			return;
		}

		this.loading = true;
		this.error = null;

		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				this.error = 'Notification permission denied.';
				return;
			}

			const vapidKey = await this.client.getVapidPublicKey();
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidKey)
			});

			await this.client.registerWebPushSubscription(sub.toJSON());
			this.subscribed = true;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to subscribe.';
		} finally {
			this.loading = false;
		}
	}

	async unsubscribe(): Promise<void> {
		if (!this.isSupported) return;

		this.loading = true;
		this.error = null;

		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await this.client.unregisterWebPushSubscription(sub.endpoint);
				await sub.unsubscribe();
			}
			this.subscribed = false;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to unsubscribe.';
		} finally {
			this.loading = false;
		}
	}
}
