import { appSettings } from './app-settings.svelte.ts';
import type { TlrClient } from './tlr-client.ts';
import { ResumeWatcher } from './resume-watcher.ts';
import type { AudioCoordinator } from '$lib/features/AudioCoordinator.svelte.ts';
import type { Alert, TlrSocketEvent } from './types.ts';

const ALERT_RESYNC_GRACE_MS = 60_000;
const MAX_ALERTS = 200;
// Hidden longer than this → assume the OS froze us and force a socket swap on resume
const FORCE_RECONNECT_AFTER_MS = 30_000;

function sortByCreatedAtDesc(items: Alert[]): Alert[] {
	return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

function alertKey(alert: Alert): string {
	return alert.alertId > 0 ? `alert:${alert.alertId}` : `temp:${alert.callId}:${alert.alertType}`;
}

export class TlrAlertFeed {
	alerts = $state.raw<Alert[]>([]);
	allAlerts = $state.raw<Alert[]>([]);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	newAlertIds = $state.raw(new Set<number>());
	alertAddressStats = $state({ total: 0, matched: 0 });
	lastRefreshAt = $state<number | null>(null);

	private client: TlrClient;
	private coordinator: AudioCoordinator | null;
	private hydrating = false;
	private resyncing = false;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeSocket: (() => void) | null = null;
	private resumeWatcher = new ResumeWatcher(({ hiddenMs }) => {
		this.client.resumeSocket({ force: hiddenMs > FORCE_RECONNECT_AFTER_MS });
		void this.resync();
	});

	constructor(client: TlrClient, coordinator?: AudioCoordinator) {
		this.client = client;
		this.coordinator = coordinator ?? null;
	}

	async start() {
		this.unsubscribeSocket = this.client.subscribe((event: TlrSocketEvent) => {
			if (event.type === 'alert') this.scheduleRefresh();
		});

		this.client.connectSocket();
		this.resumeWatcher.start();

		if (this.client.isAuthenticated) {
			this.hydrating = true;
			await this.refreshInitial();
			this.hydrating = false;
		}
	}

	destroy() {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.resumeWatcher.stop();
		this.unsubscribeSocket?.();
	}

	reset() {
		this.alerts = [];
		this.allAlerts = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.newAlertIds = new Set<number>();
		this.lastRefreshAt = null;
	}

	scheduleRefresh() {
		if (!this.client.isAuthenticated) return;
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			void this.refreshIncremental();
		}, 400);
	}

	/**
	 * Catch up after the app was backgrounded: pull missed alerts without
	 * marking them "new", so resuming doesn't replay notification sounds for
	 * alerts that web push already delivered.
	 */
	async resync() {
		if (!this.client.isAuthenticated || this.resyncing) return;
		this.resyncing = true;
		this.hydrating = true;
		try {
			await this.refreshIncremental();
		} finally {
			this.hydrating = false;
			this.resyncing = false;
		}
	}

	async refreshInitial(): Promise<Alert[]> {
		const alerts = await this.client.getAlerts({ limit: MAX_ALERTS });
		this.mergeAlerts(alerts);
		return alerts;
	}

	private async refreshIncremental() {
		try {
			const alerts = await this.client.getAlerts({
				since: this.lastRefreshAt == null ? undefined : Math.max(0, this.lastRefreshAt - ALERT_RESYNC_GRACE_MS),
				limit: MAX_ALERTS
			});
			this.mergeAlerts(alerts);
		} catch {
			// Silently ignore incremental refresh errors
		}
	}

	private mergeAlerts(nextAlerts: Alert[]) {
		if (nextAlerts.length === 0) {
			this.lastRefreshAt = Date.now();
			return;
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const existingKeys = new Set(this.allAlerts.map(alertKey));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const merged = new Map<string, Alert>();
		for (const alert of this.allAlerts) {
			merged.set(alertKey(alert), alert);
		}

		const freshIds: number[] = [];
		for (const alert of nextAlerts) {
			for (const existing of merged.values()) {
				if (existing.alertId < 0 && existing.callId === alert.callId && existing.alertType === alert.alertType) {
					merged.delete(alertKey(existing));
				}
			}
			if (!this.hydrating && !existingKeys.has(alertKey(alert))) {
				freshIds.push(alert.alertId);
			}
			merged.set(alertKey(alert), alert);
		}

		const allAlerts = sortByCreatedAtDesc([...merged.values()]);

		const limitedAlerts = allAlerts.slice(0, MAX_ALERTS);
		const alertsWithAddressMatch = limitedAlerts.filter((alert: Alert) => alert.parsedAddress && alert.parsedAddress.match);
		this.alertAddressStats = {
			matched: alertsWithAddressMatch.length,
			total: Math.min(allAlerts.length, MAX_ALERTS)
		};

		this.allAlerts = allAlerts;
		this.alerts = allAlerts.slice(0, MAX_ALERTS);
		this.lastRefreshAt = Math.max(...this.alerts.map((alert) => alert.createdAt), this.lastRefreshAt ?? 0);

		if (freshIds.length > 0) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const updated = new Set(this.newAlertIds);
			for (const id of freshIds) updated.add(id);
			this.newAlertIds = updated;
			setTimeout(() => {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const cleared = new Set(this.newAlertIds);
				for (const id of freshIds) cleared.delete(id);
				this.newAlertIds = cleared;
			}, 2000);

			void this.sendBrowserNotification(nextAlerts, freshIds);
		}
	}

	private async sendBrowserNotification(alerts: Alert[], freshIds: number[]) {
		const freshAlerts = alerts.filter((a) => freshIds.includes(a.alertId));
		if (freshAlerts.length === 0) return;

		const allParsed = freshAlerts.map((alert) => {
			const annotations = alert.transcriptAnnotations ?? [];
			const hasBattalion = annotations.some((a) => a.type === 'unit' && a.apparatus === 'BATTALION');
			const body = alert.transcript ?? alert.alertType ?? '';
			return { alert, body, hasBattalion };
		});

		const parsed = appSettings.notificationFilter.current === 'battalion-only' ? allParsed.filter((item) => item.hasBattalion) : allParsed;
		if (parsed.length === 0) return;

		this.coordinator?.playNotification();

		if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

		for (const { alert, body } of parsed) {
			const title = [alert.systemLabel, alert.talkgroupLabel ?? alert.talkgroupName].filter(Boolean).join(' / ') || 'New Alert';
			const options: NotificationOptions = {
				body,
				tag: `alert-${alert.alertId}`,
				icon: '/empty.png'
			};

			try {
				new Notification(title, options);
			} catch {
				//* Some mobile browsers disallow constructor notifications; nothing to fall back to.
			}
		}
	}
}
