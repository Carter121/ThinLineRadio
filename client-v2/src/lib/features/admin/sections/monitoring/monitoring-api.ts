//* Admin API calls for the Dirwatch, Logs and System Health sections.

import type { AdminClient } from '$lib/core/admin-client.ts';
import { tlrOrigin } from '$lib/tlr-config.ts';
import type { DirwatchEntry, FailedCall, LogCategory, LogsSearchRequest, LogsSearchResponse, SystemAlert } from './monitoring-types.ts';

//* GET returns {dirwatch: [...]}; PUT takes the WHOLE list and restarts the watchers.
export async function fetchDirwatch(client: AdminClient): Promise<DirwatchEntry[]> {
	const res = await client.request<{ dirwatch: DirwatchEntry[] | null }>('/api/admin/dirwatch');
	return res?.dirwatch ?? [];
}

export async function saveDirwatch(client: AdminClient, list: DirwatchEntry[]): Promise<DirwatchEntry[]> {
	const res = await client.request<{ dirwatch: DirwatchEntry[] | null }>('/api/admin/dirwatch', { method: 'PUT', body: JSON.stringify(list) });
	return res?.dirwatch ?? [];
}

export async function fetchLogCategories(client: AdminClient): Promise<LogCategory[]> {
	const res = await client.request<{ categories: LogCategory[] | null }>('/api/admin/logs/categories');
	return res?.categories ?? [];
}

export async function searchLogs(client: AdminClient, request: LogsSearchRequest): Promise<LogsSearchResponse> {
	const res = await client.request<LogsSearchResponse>('/api/admin/logs', { method: 'POST', body: JSON.stringify(request) });
	return { count: res?.count ?? 0, hasMore: !!res?.hasMore, logs: res?.logs ?? [] };
}

export async function fetchSystemAlerts(client: AdminClient, limit: number, includeDismissed: boolean): Promise<SystemAlert[]> {
	const params = new URLSearchParams({ limit: String(limit), includeDismissed: String(includeDismissed) });
	const res = await client.request<{ alerts: SystemAlert[] | null; count: number }>(`/api/admin/systemhealth?${params}`);
	return res?.alerts ?? [];
}

export function dismissSystemAlert(client: AdminClient, alertId: number): Promise<unknown> {
	return client.request('/api/admin/systemhealth', { method: 'PUT', body: JSON.stringify({ alertId }) });
}

//* Failed transcriptions from the last 24 hours (max 100).
export async function fetchTranscriptionFailures(client: AdminClient): Promise<FailedCall[]> {
	const res = await client.request<{ calls: FailedCall[] | null; count: number }>('/api/admin/transcription-failures');
	return res?.calls ?? [];
}

//* Empty callIds resets every failed call from the last 24 hours.
export function resetTranscriptionFailures(client: AdminClient, callIds: number[] = []): Promise<{ success?: boolean; rowsAffected?: number }> {
	return client.request('/api/admin/transcription-failures', { method: 'POST', body: JSON.stringify({ callIds }) });
}

//* Admin call audio needs the token header, so it is fetched as a blob for playback.
export async function fetchAdminCallAudio(client: AdminClient, callId: number): Promise<Blob> {
	const headers = new Headers();
	if (client.token) headers.set('Authorization', client.token);
	const response = await fetch(`${tlrOrigin()}/api/admin/call-audio/${callId}`, { headers });
	if (!response.ok) throw new Error(`Failed to load audio (${response.status})`);
	return response.blob();
}
