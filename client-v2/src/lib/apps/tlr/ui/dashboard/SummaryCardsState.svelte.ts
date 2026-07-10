import type { AlertFeedCardState } from './AlertFeedCardState.svelte.ts';
import type { StatsCardState } from './StatsCardState.svelte.ts';
import type { SystemAlertsCardState } from './SystemAlertsCardState.svelte.ts';

interface SummaryCardsStateOptions {
	nowMs: () => number;
	alertFeed: AlertFeedCardState;
	statsCard: StatsCardState;
	systemAlertsCard: SystemAlertsCardState;
}

export class SummaryCardsState {
	private options: SummaryCardsStateOptions;

	constructor(options: SummaryCardsStateOptions) {
		this.options = options;
	}

	get recentAlertCount(): number {
		const now = this.options.nowMs();
		return this.options.alertFeed.alerts.filter((alert) => now - alert.createdAt < 60 * 60 * 1000).length;
	}

	get callsLastHour(): number | undefined {
		return this.options.statsCard.callsLastHour;
	}

	get callsLastMinute(): number {
		const callsPerMinute = this.options.statsCard.getCallsPerMinute(2);
		return callsPerMinute[0]?.count ?? 0;
	}

	get activeSystemAlertCount(): number {
		return this.options.systemAlertsCard.activeCount;
	}

	get showSystemAlerts(): boolean {
		return this.options.systemAlertsCard.isSystemAdmin;
	}
}
