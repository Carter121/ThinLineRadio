import type { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
import { TlrSessionState } from '$lib/apps/tlr/session-state.svelte.ts';
import { StatsCardState } from '../dashboard/StatsCardState.svelte.ts';
import { UnitInfoCardState } from '../dashboard/UnitInfoCardState.svelte.ts';
import type { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
import { PushNotificationState } from './PushNotificationState.svelte.ts';
import type { AudioCoordinator } from '../AudioCoordinator.svelte.ts';
import type { TlrAlertFeed } from '$lib/apps/tlr/tlr-alert-feed.svelte.ts';

export class PwaState extends TlrSessionState {
	statsCard: StatsCardState;
	unitInfoCard: UnitInfoCardState;
	pushNotifications: PushNotificationState;

	constructor(client: TlrClient, coordinator: AudioCoordinator, feed: TlrAlertFeed) {
		super(client, coordinator, feed);
		this.statsCard = new StatsCardState(client);
		this.unitInfoCard = new UnitInfoCardState({ counties: ['Salt Lake County'] });
		this.pushNotifications = new PushNotificationState(client);
	}

	// Existing card components reference `alertFeedCard`
	get alertFeedCard(): AlertFeedCardState {
		return this.alertCard;
	}

	protected privateRefreshTasks(): Array<Promise<unknown>> {
		return [this.statsCard.refresh()];
	}

	protected onStarted() {
		void this.pushNotifications.checkSubscription();
	}

	protected onLogout() {
		this.statsCard.reset();
	}
}
