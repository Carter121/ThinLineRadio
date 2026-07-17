import type { TlrClient } from '$lib/core/tlr-client.ts';
import type { IncidentCategory, StatsResponse } from '$lib/core/types.ts';

export class StatsCardState {
	stats = $state.raw<StatsResponse | null>(null);

	private client: TlrClient;

	constructor(client: TlrClient) {
		this.client = client;
	}

	get incidentSummary(): IncidentCategory[] {
		return (this.stats?.incidentSummary as IncidentCategory[]) ?? [];
	}

	get callsLastHour(): number | undefined {
		return this.stats?.callsLastHour;
	}

	get callsLastMinute(): number {
		return this.stats?.callsLastMinute ?? 0;
	}

	getTopTalkgroups(limit = 5) {
		return this.stats?.topTalkgroups?.slice(0, limit) ?? [];
	}

	getCallsPerMinute(limit = 12) {
		return this.stats?.callsPerMinute?.slice(-limit) ?? [];
	}

	async refresh(): Promise<StatsResponse> {
		const stats = await this.client.getStats();
		this.stats = stats;
		return stats;
	}

	reset() {
		this.stats = null;
	}
}
