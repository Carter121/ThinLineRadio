//* API helpers and usage-count math for the Tags, Talkgroup Groups, and
//* Keyword Lists sections.

import type { AdminClient } from '$lib/core/admin-client.ts';
import type { AdminSystem } from '$lib/core/admin-types.ts';
import type { AdminKeywordList, AdminKeywordListInput, AdminLabelRow } from './radio-types.ts';

//* GET /api/admin/tags -> {tags}; PUT takes the whole list and returns {tags}.
export async function fetchTags(client: AdminClient): Promise<AdminLabelRow[]> {
	const res = await client.request<{ tags?: AdminLabelRow[] }>('/api/admin/tags');
	return res.tags ?? [];
}

export async function putTags(client: AdminClient, tags: AdminLabelRow[]): Promise<AdminLabelRow[]> {
	const res = await client.request<{ tags?: AdminLabelRow[] }>('/api/admin/tags', { method: 'PUT', body: JSON.stringify(tags) });
	return res.tags ?? [];
}

//* GET /api/admin/talkgroup-groups -> {groups}; PUT whole list -> {groups}.
export async function fetchGroups(client: AdminClient): Promise<AdminLabelRow[]> {
	const res = await client.request<{ groups?: AdminLabelRow[] }>('/api/admin/talkgroup-groups');
	return res.groups ?? [];
}

export async function putGroups(client: AdminClient, groups: AdminLabelRow[]): Promise<AdminLabelRow[]> {
	const res = await client.request<{ groups?: AdminLabelRow[] }>('/api/admin/talkgroup-groups', { method: 'PUT', body: JSON.stringify(groups) });
	return res.groups ?? [];
}

//* Keyword lists: GET returns a bare array; POST returns {id, success};
//* PUT/DELETE /api/keyword-lists/{id} return {success}. The admin token is
//* accepted as the raw Authorization header.
export async function fetchKeywordLists(client: AdminClient): Promise<AdminKeywordList[]> {
	const res = await client.request<AdminKeywordList[] | null>('/api/keyword-lists');
	return (res ?? []).map(normalizeKeywordList);
}

export async function createKeywordList(client: AdminClient, input: AdminKeywordListInput): Promise<number> {
	const res = await client.request<{ id: number }>('/api/keyword-lists', { method: 'POST', body: JSON.stringify(input) });
	return res.id;
}

export function updateKeywordList(client: AdminClient, id: number, input: AdminKeywordListInput): Promise<unknown> {
	return client.request(`/api/keyword-lists/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteKeywordList(client: AdminClient, id: number): Promise<unknown> {
	return client.request(`/api/keyword-lists/${id}`, { method: 'DELETE' });
}

export function normalizeKeywordList(raw: Partial<AdminKeywordList>): AdminKeywordList {
	return {
		id: Number(raw.id ?? 0),
		label: raw.label ?? '',
		description: raw.description ?? '',
		keywords: Array.isArray(raw.keywords) ? normalizeKeywords(raw.keywords.filter((k): k is string => typeof k === 'string')) : [],
		order: Number(raw.order ?? 0),
		createdAt: raw.createdAt
	};
}

//* Talkgroups carry `tagId` (one) and `groupIds` (many); counts are keyed by id.
export function tagUsageCounts(systems: AdminSystem[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const system of systems) {
		for (const talkgroup of system.talkgroups ?? []) {
			const tagId = talkgroup.tagId;
			if (typeof tagId === 'number') counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
		}
	}
	return counts;
}

export function groupUsageCounts(systems: AdminSystem[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const system of systems) {
		for (const talkgroup of system.talkgroups ?? []) {
			const groupIds = talkgroup.groupIds;
			if (!Array.isArray(groupIds)) continue;
			for (const groupId of groupIds) {
				if (typeof groupId === 'number') counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
			}
		}
	}
	return counts;
}

//* Sorts ascending by order (zero/missing first, stable), like the server Read sort.
export function sortByOrder<T extends { order?: number }>(rows: T[]): T[] {
	return rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => (a.row.order ?? 0) - (b.row.order ?? 0) || a.index - b.index)
		.map((entry) => entry.row);
}

//* Uppercases, trims, and dedupes keywords (server matching is case-insensitive).
export function normalizeKeywords(raw: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of raw) {
		const keyword = value.toUpperCase().trim();
		if (!keyword || seen.has(keyword)) continue;
		seen.add(keyword);
		out.push(keyword);
	}
	return out;
}

//* Parses an imported keywords file. .txt is one keyword per line; .json is
//* either an array or an object of category -> array (returned as categories).
export type KeywordImport = { keywords: string[] } | { categories: Record<string, string[]> };

export function parseKeywordFile(name: string, mime: string, text: string): KeywordImport {
	const isJson = name.toLowerCase().endsWith('.json') || mime === 'application/json';
	if (!isJson) {
		return { keywords: normalizeKeywords(text.split(/\r?\n/)) };
	}
	const data: unknown = JSON.parse(text);
	if (Array.isArray(data)) {
		return { keywords: normalizeKeywords(data.filter((k): k is string => typeof k === 'string')) };
	}
	if (data && typeof data === 'object') {
		const categories: Record<string, string[]> = {};
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			if (Array.isArray(value)) categories[key] = normalizeKeywords(value.filter((k): k is string => typeof k === 'string'));
		}
		const names = Object.keys(categories);
		if (names.length === 0) throw new Error('No keyword arrays found in JSON');
		if (names.length === 1) return { keywords: categories[names[0]] };
		return { categories };
	}
	throw new Error('Unsupported JSON structure');
}

//* "fire_keywords" -> "Fire Keywords".
export function categoryToLabel(key: string): string {
	return key
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
