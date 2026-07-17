import type { TlrClient } from '$lib/core/tlr-client.ts';
import type { SystemAlert, SystemAlertsResponse } from '$lib/core/types.ts';

const MAX_SYSTEM_ALERTS = 15;

function asTimestamp(value: number | string | undefined | null): number {
	if (typeof value === 'number') return value > 9_999_999_999 ? value : value * 1000;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

function sortByTimestampDesc(items: SystemAlert[]): SystemAlert[] {
	return [...items].sort((a, b) => asTimestamp(b.createdAt ?? b.updatedAt ?? null) - asTimestamp(a.createdAt ?? a.updatedAt ?? null));
}

export class SystemAlertsCardState {
	systemAlerts = $state.raw<SystemAlert[]>([]);
	isSystemAdmin = $state(false);
	authenticated = $state(false);
	nowMs = $state(0);

	private client: TlrClient;

	constructor(client: TlrClient) {
		this.client = client;
	}

	get activeCount(): number {
		return this.systemAlerts.filter((alert) => alert.dismissedAt == null && alert.active !== false).length;
	}

	async refresh(): Promise<SystemAlertsResponse> {
		const response = await this.client.getSystemAlerts({ limit: 50 });
		this.isSystemAdmin = response.isSystemAdmin ?? false;
		this.mergeAlerts(response.alerts ?? []);
		return response;
	}

	setPresentationState(authenticated: boolean, nowMs: number) {
		this.authenticated = authenticated;
		this.nowMs = nowMs;
	}

	reset() {
		this.systemAlerts = [];
		this.isSystemAdmin = false;
	}

	private mergeAlerts(nextAlerts: SystemAlert[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const merged = new Map<string, SystemAlert>();
		for (const alert of this.systemAlerts) {
			merged.set(this.systemAlertKey(alert), alert);
		}
		for (const alert of nextAlerts) {
			merged.set(this.systemAlertKey(alert), alert);
		}

		this.systemAlerts = sortByTimestampDesc([...merged.values()]).slice(0, MAX_SYSTEM_ALERTS);
	}

	private systemAlertKey(alert: SystemAlert): string {
		if (alert.id != null) return `system-alert:${alert.id}`;
		return `system-alert:${alert.title ?? ''}:${alert.message ?? ''}:${alert.createdAt ?? 0}`;
	}
}
