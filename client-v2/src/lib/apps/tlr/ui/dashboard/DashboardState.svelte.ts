import type { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
import { TlrSessionState } from '$lib/apps/tlr/session-state.svelte.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/apps/tlr/tlr-alert-feed.svelte.ts';
import type { Alert } from '$lib/apps/tlr/types.ts';
import type { AlertFeedCardState } from './AlertFeedCardState.svelte.ts';
import { StatsCardState } from './StatsCardState.svelte.ts';
import { SummaryCardsState } from './SummaryCardsState.svelte.ts';
import { SystemAlertsCardState } from './SystemAlertsCardState.svelte.ts';
import { UnitInfoCardState } from './UnitInfoCardState.svelte.ts';

export class DashboardState extends TlrSessionState {
	timeStr = $derived(
		this.now.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		})
	);
	dateStr = $derived(
		this.now.toLocaleDateString('en-US', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		})
	);

	statsCard: StatsCardState;
	systemAlertsCard: SystemAlertsCardState;
	summaryCards: SummaryCardsState;
	unitInfoCard: UnitInfoCardState;

	constructor(client: TlrClient, coordinator: AudioCoordinator, feed: TlrAlertFeed) {
		super(client, coordinator, feed);
		this.statsCard = new StatsCardState(client);
		this.systemAlertsCard = new SystemAlertsCardState(client);
		this.summaryCards = new SummaryCardsState({
			nowMs: () => this.now.getTime(),
			alertFeed: this.alertCard,
			statsCard: this.statsCard,
			systemAlertsCard: this.systemAlertsCard
		});
		this.unitInfoCard = new UnitInfoCardState({
			counties: ['Salt Lake County']
		});
	}

	// Existing card components reference `alertFeed`
	get alertFeed(): AlertFeedCardState {
		return this.alertCard;
	}

	get alerts(): Alert[] {
		return this.alertCard.alerts;
	}

	protected privateRefreshTasks(): Array<Promise<unknown>> {
		return [this.statsCard.refresh(), this.systemAlertsCard.refresh()];
	}

	protected onPrivateRefreshSuccess() {
		this.syncSystemAlertsPresentation();
	}

	protected onClockTick() {
		this.syncSystemAlertsPresentation();
	}

	protected onStarted() {
		this.syncSystemAlertsPresentation();
	}

	protected onAuthenticated() {
		this.syncSystemAlertsPresentation();
	}

	protected onLogout() {
		this.systemAlertsCard.reset();
		this.statsCard.reset();
		this.syncSystemAlertsPresentation();
	}

	private syncSystemAlertsPresentation() {
		this.systemAlertsCard.setPresentationState(this.authenticated, this.now.getTime());
	}
}
