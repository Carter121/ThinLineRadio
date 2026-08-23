//* API helpers and types for the admin Tools sections (import/export, purge,
//* password, maintenance). Contracts come from server/admin.go.

import { DateTime } from 'luxon';
import type { AdminClient } from '$lib/core/admin-client.ts';
import type { AdminConfigDocument, AdminConfigPayload } from '$lib/core/admin-types.ts';

//* ---- Import / Export ------------------------------------------------------

//* Entity lists the PUT /api/admin/config import understands. Any list present
//* in the payload replaces the server's list of that type (Write diffs and
//* deletes rows missing from the payload); lists absent are left untouched.
export const IMPORT_ENTITIES = [
	{ key: 'options', label: 'Options', kind: 'object' },
	{ key: 'systems', label: 'Systems (with talkgroups, units, sites)', kind: 'list' },
	{ key: 'tags', label: 'Tags', kind: 'list' },
	{ key: 'groups', label: 'Talkgroup groups', kind: 'list' },
	{ key: 'apikeys', label: 'API keys', kind: 'list' },
	{ key: 'dirwatch', label: 'Dirwatch entries', kind: 'list' },
	{ key: 'downstreams', label: 'Downstreams', kind: 'list' },
	{ key: 'users', label: 'Users', kind: 'list' },
	{ key: 'userGroups', label: 'User groups', kind: 'list' },
	{ key: 'keywordLists', label: 'Keyword lists', kind: 'list', fullOnly: true },
	{ key: 'userAlertPreferences', label: 'User alert preferences', kind: 'list', fullOnly: true },
	{ key: 'deviceTokens', label: 'Device tokens', kind: 'list', fullOnly: true }
] as const;

export type ImportEntityKey = (typeof IMPORT_ENTITIES)[number]['key'];

export interface ImportEntitySummary {
	key: ImportEntityKey;
	label: string;
	//* Number of rows (lists) or keys (options).
	count: number;
	//* Extra detail line (e.g. talkgroup total for systems).
	detail?: string;
	//* Only applied by a full restore; ignored by a standard import.
	fullOnly: boolean;
}

export interface ParsedConfigImport {
	config: Record<string, unknown>;
	version?: string;
	entities: ImportEntitySummary[];
	//* Top-level keys the server import does not read.
	ignoredKeys: string[];
	//* Legacy (v6) keys that were renamed on the way in.
	legacyFixes: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

//* Renames legacy v6 keys so older exports import cleanly (apiKeys, dirWatch,
//* _id), and drops the v6-only access list. Mirrors the old admin's import.
function normalizeLegacyConfig(config: Record<string, unknown>): string[] {
	const fixes: string[] = [];
	if ('access' in config) {
		delete config.access;
		fixes.push('Dropped v6 access list');
	}
	const renames: Array<[string, string]> = [
		['apiKeys', 'apikeys'],
		['dirWatch', 'dirwatch']
	];
	for (const [from, to] of renames) {
		if (from in config && !(to in config)) {
			config[to] = config[from];
			delete config[from];
			fixes.push(`Renamed ${from} to ${to}`);
		}
	}
	let idFixes = 0;
	for (const entity of IMPORT_ENTITIES) {
		const rows = config[entity.key];
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (isRecord(row) && '_id' in row && !('id' in row)) {
				row.id = row._id;
				delete row._id;
				idFixes++;
			}
		}
	}
	if (idFixes > 0) fixes.push(`Converted _id to id on ${idFixes} rows`);
	return fixes;
}

//* Parses and validates an exported config file. Accepts both the bare config
//* payload and the {config, passwordNeedChange} wrapper GET returns.
export function parseConfigImport(text: string): ParsedConfigImport {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('The file is not valid JSON.');
	}
	if (!isRecord(raw)) throw new Error('The file does not contain a JSON object.');

	const config: Record<string, unknown> = isRecord(raw.config) && !('options' in raw) ? { ...raw.config } : { ...raw };
	const legacyFixes = normalizeLegacyConfig(config);

	const entities: ImportEntitySummary[] = [];
	for (const entity of IMPORT_ENTITIES) {
		const value = config[entity.key];
		if (value === undefined) continue;
		if (entity.kind === 'list') {
			if (!Array.isArray(value)) throw new Error(`"${entity.key}" must be an array.`);
		} else if (!isRecord(value)) {
			throw new Error(`"${entity.key}" must be an object.`);
		}
		const count = Array.isArray(value) ? value.length : Object.keys(value as object).length;
		let detail: string | undefined;
		if (entity.key === 'systems' && Array.isArray(value)) {
			const talkgroups = value.reduce<number>((sum, s) => sum + (isRecord(s) && Array.isArray(s.talkgroups) ? s.talkgroups.length : 0), 0);
			detail = `${talkgroups} talkgroups`;
		}
		entities.push({ key: entity.key, label: entity.label, count, detail, fullOnly: 'fullOnly' in entity && entity.fullOnly === true });
	}
	if (entities.length === 0) throw new Error('No importable sections found (expected keys like options, systems, tags, users).');

	const known = new Set<string>([...IMPORT_ENTITIES.map((e) => e.key), 'version', 'branding', 'radioReference']);
	const ignoredKeys = Object.keys(config).filter((k) => !known.has(k));

	return {
		config,
		version: typeof config.version === 'string' ? config.version : undefined,
		entities,
		ignoredKeys,
		legacyFixes
	};
}

//* PUT /api/admin/config. Without the X-Full-Import header the server saves
//* the payload (entity lists present still replace their type; users and user
//* groups are upserted but never deleted; keyword lists, alert preferences and
//* device tokens are ignored). With the header it is a destructive restore:
//* users/user groups missing from the file are deleted, keyword lists, alert
//* preferences and device tokens are wiped and re-imported.
export function importConfig(client: AdminClient, config: Record<string, unknown>, fullImport: boolean): Promise<AdminConfigDocument> {
	return client.request<AdminConfigDocument>('/api/admin/config', {
		method: 'PUT',
		headers: fullImport ? { 'X-Full-Import': 'true' } : undefined,
		body: JSON.stringify(config)
	});
}

//* Builds the export file from the config payload. Keys are ordered with
//* options first for readability; the content is the server document as-is.
export function buildExportJson(config: AdminConfigPayload): string {
	const ordered: Record<string, unknown> = {};
	for (const key of ['version', 'options', ...IMPORT_ENTITIES.map((e) => e.key)]) {
		if (key in config) ordered[key] = config[key];
	}
	for (const [key, value] of Object.entries(config)) {
		if (!(key in ordered)) ordered[key] = value;
	}
	return JSON.stringify(ordered, null, 2);
}

export function downloadTextFile(filename: string, text: string, type = 'application/json'): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.style.display = 'none';
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

//* ---- Purge ----------------------------------------------------------------

export type PurgeType = 'calls' | 'logs';

export interface PurgeResponse {
	message?: string;
	deleted?: number;
}

//* POST /api/admin/purge {type, ids?}. No ids = purge everything of that type.
export function purgeData(client: AdminClient, type: PurgeType, ids?: number[]): Promise<PurgeResponse> {
	const body: Record<string, unknown> = { type };
	if (ids && ids.length > 0) body.ids = ids;
	return client.request<PurgeResponse>('/api/admin/purge', { method: 'POST', body: JSON.stringify(body) });
}

export interface CallSearchRow {
	id: number;
	dateTime: string;
	system: number;
	talkgroup: number;
	frequency?: number;
	source?: number;
	site?: number;
}

export interface CallsSearchOptions {
	//* RFC3339; the server returns calls from this instant forward.
	date?: string;
	limit: number;
	offset: number;
	//* -1 newest first, 1 oldest first.
	sort: -1 | 1;
	system?: number;
	talkgroup?: number;
}

export interface CallsSearchResult {
	count: number;
	hasMore: boolean;
	results: CallSearchRow[];
}

//* POST /api/admin/calls (admin search, bypasses user ACLs). Without a date,
//* newest-first searches only look back 24 hours.
export function searchCalls(client: AdminClient, options: CallsSearchOptions): Promise<CallsSearchResult> {
	return client.request<CallsSearchResult>('/api/admin/calls', { method: 'POST', body: JSON.stringify(options) });
}

export interface LogRow {
	id: number;
	dateTime: string;
	level: string;
	category?: string;
	message: string;
}

export interface LogsSearchOptions {
	date?: string;
	level?: 'error' | 'warn' | 'info';
	search?: string;
	limit: number;
	offset: number;
	sort: -1 | 1;
}

export interface LogsSearchResult {
	count: number;
	hasMore: boolean;
	logs: LogRow[];
}

//* POST /api/admin/logs. Same date/lookback semantics as calls.
export function searchLogs(client: AdminClient, options: LogsSearchOptions): Promise<LogsSearchResult> {
	return client.request<LogsSearchResult>('/api/admin/logs', { method: 'POST', body: JSON.stringify(options) });
}

//* ---- Password -------------------------------------------------------------

//* POST /api/admin/password. A wrong current password is a bare 417.
export function changeAdminPassword(client: AdminClient, currentPassword: string, newPassword: string): Promise<{ passwordNeedChange: boolean }> {
	return client.request<{ passwordNeedChange: boolean }>('/api/admin/password', {
		method: 'POST',
		body: JSON.stringify({ currentPassword, newPassword })
	});
}

//* ---- Maintenance ----------------------------------------------------------

export interface UpdateInfo {
	current_version: string;
	latest_version: string;
	update_available: boolean;
	download_url?: string;
	platform: string;
}

//* GET /api/admin/update/check (503 when the updater is not initialised).
export function checkForUpdate(client: AdminClient): Promise<UpdateInfo> {
	return client.request<UpdateInfo>('/api/admin/update/check');
}

export interface UpdateApplyResponse {
	message: string;
	version?: string;
	from?: string;
	to?: string;
}

//* POST /api/admin/update/apply. The server answers, then downloads the
//* release and restarts itself; every admin token dies with the restart.
export function applyUpdate(client: AdminClient): Promise<UpdateApplyResponse> {
	return client.request<UpdateApplyResponse>('/api/admin/update/apply', { method: 'POST', body: '{}' });
}

//* POST /api/admin/config/reload: re-reads the options table into memory.
export function reloadConfig(client: AdminClient): Promise<{ success: boolean; message: string }> {
	return client.request<{ success: boolean; message: string }>('/api/admin/config/reload', { method: 'POST', body: '{}' });
}

//* The file name SyncConfigToFile writes inside configSyncPath.
export const CONFIG_SYNC_FILENAME = 'ThinLineRadioV7-config.json';

//* Converts an <input type="date"> value (local calendar day) to the RFC3339
//* instant the calls/logs search expects (local midnight, with offset).
export function dateInputToRfc3339(value: string): string | undefined {
	if (!value) return undefined;
	const dt = DateTime.fromISO(value);
	return dt.isValid ? (dt.startOf('day').toISO({ suppressMilliseconds: true }) ?? undefined) : undefined;
}

export function formatRowTime(value: string): string {
	const dt = DateTime.fromISO(value);
	return dt.isValid ? dt.toFormat('yyyy-LL-dd HH:mm:ss') : value;
}
