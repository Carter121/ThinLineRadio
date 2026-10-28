import type { TlrClient } from '$lib/core/tlr-client';
import type { Incident, IncidentMembership, IncidentMutationResult } from '$lib/core/types';

export type IncidentAction = 'create' | 'assign' | 'remove' | 'edit';

class IncidentManagement {
	open = $state(false);
	requestId = $state(0);
	action = $state<IncidentAction>('create');
	calls = $state.raw<IncidentMembership[]>([]);
	incident = $state.raw<Incident | null>(null);
	client: TlrClient | null = null;

	show(client: TlrClient, action: IncidentAction, calls: IncidentMembership[], incident: Incident | null = null) {
		this.requestId++;
		this.client = client;
		this.action = action;
		this.calls = [...new Map(calls.map((call) => [call.callId, { ...call }])).values()];
		this.incident = incident;
		this.open = true;
	}

	changed(result: IncidentMutationResult) {
		window.dispatchEvent(new CustomEvent('tlr-incidents-changed', { detail: result }));
	}
}

export const incidentManagement = new IncidentManagement();
