import type { Alert, TranscriptAnnotationUnit } from './types.ts';

//* A group of alerts belonging to one incident. Alerts without a server-side
//* incidentId become singleton groups so nothing disappears from the feed.
export interface IncidentGroup {
	//* "incident-<id>" for threaded groups, "alert-<alertId>" for singletons
	key: string;
	incidentId: number | null;
	//* Members, newest first
	alerts: Alert[];
	newest: Alert;
	//* Units accumulated across all member calls, deduped by apparatus-number
	units: TranscriptAnnotationUnit[];
	incidentType: string | null;
}

function unitAnnotations(alert: Alert): TranscriptAnnotationUnit[] {
	return (alert.transcriptAnnotations ?? []).filter((a): a is TranscriptAnnotationUnit => a.type === 'unit');
}

export function groupAlertsByIncident(alerts: Alert[]): IncidentGroup[] {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const groups = new Map<string, Alert[]>();
	for (const alert of alerts) {
		const key = alert.incidentId ? `incident-${alert.incidentId}` : `alert-${alert.alertId}`;
		const list = groups.get(key);
		if (list) list.push(alert);
		else groups.set(key, [alert]);
	}

	const result: IncidentGroup[] = [];
	for (const [key, list] of groups) {
		list.sort((a, b) => b.createdAt - a.createdAt);
		const newest = list[0];
		//* Newest-first scan: a fire-type upgrade arrives on a later call
		const incidentType = list.map((a) => a.parsedAddress?.incidentType).find(Boolean) ?? null;
		const units = [
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			...new Map(list.flatMap(unitAnnotations).map((u) => [`${u.apparatus}-${u.number}`, u])).values()
		];
		result.push({ key, incidentId: newest.incidentId ?? null, alerts: list, newest, units, incidentType });
	}
	return result.sort((a, b) => b.newest.createdAt - a.newest.createdAt);
}
