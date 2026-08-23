//* HTTP helpers for the Systems section. The targeted routes (server/admin_systems.go)
//* write only the affected rows; the legacy whole-tree save is only used to create
//* a system. Every successful call also triggers a full config push over the admin
//* websocket, so callers patch local state optimistically and let the push reconcile.

import type { AdminClient } from '$lib/core/admin-client.ts';
import type { AdminSite, AdminSystemFull, AdminSystemSummary, AdminTalkgroup, AdminUnit } from './systems-types.ts';

export type TalkgroupPatch = Partial<Omit<AdminTalkgroup, 'id'>>;
export type UnitPatch = Partial<Omit<AdminUnit, 'id'>>;
export type SystemPatch = Partial<Omit<AdminSystemFull, 'id' | 'talkgroups' | 'units'>> & { sites?: AdminSite[] };

export interface TalkgroupBulkPatch {
	ids: number[];
	set?: TalkgroupPatch;
	addGroupIds?: number[];
	removeGroupIds?: number[];
}

export class SystemsApi {
	constructor(private client: AdminClient) {}

	private json(method: string, path: string, body?: unknown): RequestInit {
		return { method, body: body === undefined ? undefined : JSON.stringify(body) };
	}

	//* Creates a system through the legacy save route (it appends when no id is given).
	async createSystem(fields: { label: string; systemRef: number; type?: string }): Promise<AdminSystemFull[]> {
		const response = await this.client.request<{ systems: AdminSystemFull[] }>(
			'/api/admin/systems/save',
			this.json('POST', '/api/admin/systems/save', {
				...fields,
				autoPopulate: false,
				alertsEnabled: true,
				autoPopulateAlertsEnabled: true,
				duplicateDetectionEnabled: true,
				talkgroups: [],
				units: [],
				sites: []
			})
		);
		return response.systems;
	}

	async deleteSystem(systemId: number): Promise<void> {
		await this.client.request(`/api/admin/systems/delete/${systemId}`, { method: 'DELETE' });
	}

	async patchSystem(systemId: number, patch: SystemPatch): Promise<AdminSystemSummary> {
		const response = await this.client.request<{ system: AdminSystemSummary }>(`/api/admin/systems/${systemId}`, this.json('PATCH', '', patch));
		return response.system;
	}

	async createTalkgroup(systemId: number, talkgroup: TalkgroupPatch): Promise<AdminTalkgroup> {
		const response = await this.client.request<{ talkgroup: AdminTalkgroup }>(
			`/api/admin/systems/${systemId}/talkgroups`,
			this.json('POST', '', talkgroup)
		);
		return response.talkgroup;
	}

	async patchTalkgroup(systemId: number, talkgroupId: number, patch: TalkgroupPatch): Promise<AdminTalkgroup> {
		const response = await this.client.request<{ talkgroup: AdminTalkgroup }>(
			`/api/admin/systems/${systemId}/talkgroups/${talkgroupId}`,
			this.json('PATCH', '', patch)
		);
		return response.talkgroup;
	}

	async bulkPatchTalkgroups(systemId: number, body: TalkgroupBulkPatch): Promise<number> {
		const response = await this.client.request<{ updated: number }>(`/api/admin/systems/${systemId}/talkgroups`, this.json('PATCH', '', body));
		return response.updated;
	}

	async reorderTalkgroups(systemId: number, ids: number[]): Promise<number> {
		const response = await this.client.request<{ updated: number }>(`/api/admin/systems/${systemId}/talkgroups/order`, this.json('PUT', '', { ids }));
		return response.updated;
	}

	async deleteTalkgroups(systemId: number, ids: number[]): Promise<number> {
		const response = await this.client.request<{ deleted: number }>(
			`/api/admin/systems/${systemId}/talkgroups/delete`,
			this.json('POST', '', { ids })
		);
		return response.deleted;
	}

	async createUnit(systemId: number, unit: UnitPatch): Promise<AdminUnit> {
		const response = await this.client.request<{ unit: AdminUnit }>(`/api/admin/systems/${systemId}/units`, this.json('POST', '', unit));
		return response.unit;
	}

	async patchUnit(systemId: number, unitId: number, patch: UnitPatch): Promise<AdminUnit> {
		const response = await this.client.request<{ unit: AdminUnit }>(`/api/admin/systems/${systemId}/units/${unitId}`, this.json('PATCH', '', patch));
		return response.unit;
	}

	async deleteUnits(systemId: number, ids: number[]): Promise<number> {
		const response = await this.client.request<{ deleted: number }>(`/api/admin/systems/${systemId}/units/delete`, this.json('POST', '', { ids }));
		return response.deleted;
	}
}
