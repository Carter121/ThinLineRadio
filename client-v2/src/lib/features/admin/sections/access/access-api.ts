//* Thin wrappers over AdminClient.request for the users / user-groups /
//* api-keys / downstreams admin endpoints. Request and response shapes are
//* taken from server/admin.go (users, apikeys, downstreams) and server/api.go
//* (groups, codes, invitations, transfer).

import type { AdminClient } from '$lib/core/admin-client.ts';
import { TlrApiError } from '$lib/core/tlr-client.ts';
import type {
	AdminUserGroupRecord,
	AdminUserRecord,
	ApikeyRecord,
	DownstreamRecord,
	GroupAdminSummary,
	GroupCreatePayload,
	GroupEditableFields,
	RegistrationCode,
	UserCreatePayload,
	UserUpdatePayload
} from './access-types.ts';

//* The api.go group handlers answer errors as plain text, which AdminClient
//* turns into "Request failed (NNN)". Map the common statuses to something
//* readable; JSON error bodies (admin.go) already carry their own message.
export function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof TlrApiError) {
		if (/^Request failed \(\d+\)$/.test(error.message)) {
			switch (error.status) {
				case 400:
					return `${fallback}: invalid request`;
				case 401:
					return `${fallback}: unauthorized`;
				case 403:
					return `${fallback}: not allowed (limit reached)`;
				case 404:
					return `${fallback}: not found`;
				case 409:
					return `${fallback}: already exists`;
				default:
					return `${fallback} (${error.status})`;
			}
		}
		return error.message;
	}
	return error instanceof Error ? error.message : fallback;
}

//* Users (server/admin.go)

export function listUsers(client: AdminClient): Promise<AdminUserRecord[]> {
	return client.request<AdminUserRecord[]>('/api/admin/users');
}

export function createUser(client: AdminClient, payload: UserCreatePayload): Promise<{ message: string; userId: number; pin: string }> {
	return client.request('/api/admin/users/create', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateUser(client: AdminClient, userId: number, payload: UserUpdatePayload): Promise<{ message: string }> {
	return client.request(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function deleteUser(client: AdminClient, userId: number): Promise<{ message: string }> {
	return client.request(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export function resetUserPassword(client: AdminClient, userId: number, newPassword: string): Promise<{ message: string }> {
	return client.request(`/api/admin/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
}

export function sendTestPush(client: AdminClient, userId: number): Promise<{ message: string; email: string }> {
	return client.request(`/api/admin/users/${userId}/test-push`, { method: 'POST', body: '{}' });
}

export function deleteDeviceToken(client: AdminClient, userId: number, tokenId: number): Promise<{ message: string }> {
	return client.request(`/api/admin/users/${userId}/device-tokens/${tokenId}`, { method: 'DELETE' });
}

export function transferUser(client: AdminClient, userId: number, toGroupId: number): Promise<{ message: string }> {
	return client.request('/api/admin/users/transfer', { method: 'POST', body: JSON.stringify({ userId, toGroupId }) });
}

export function inviteUser(client: AdminClient, email: string, groupId: number): Promise<{ message?: string }> {
	return client.request('/api/admin/invitations', { method: 'POST', body: JSON.stringify({ email, groupId }) });
}

//* Public endpoint (no admin token), same as the old admin used.
export function resendVerification(client: AdminClient, email: string): Promise<unknown> {
	return client.request('/api/user/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }, false);
}

//* User groups (server/api.go)

export async function listGroups(client: AdminClient): Promise<AdminUserGroupRecord[]> {
	const response = await client.request<{ groups: AdminUserGroupRecord[] }>('/api/admin/groups');
	return response?.groups ?? [];
}

export function createGroup(client: AdminClient, payload: GroupCreatePayload): Promise<{ message: string; group: { id: number; name: string } }> {
	return client.request('/api/admin/groups/create', { method: 'POST', body: JSON.stringify(payload) });
}

//* Billing fields are echoed from the existing record; the handler overwrites
//* every field it receives (and zero-values the ones it does not).
export function updateGroup(client: AdminClient, existing: AdminUserGroupRecord, fields: GroupEditableFields): Promise<{ message: string }> {
	const payload = {
		id: existing.id,
		...fields,
		billingEnabled: existing.billingEnabled ?? false,
		stripePriceId: existing.stripePriceId ?? '',
		pricingOptions: Array.isArray(existing.pricingOptions) ? existing.pricingOptions : [],
		billingMode: existing.billingMode ?? '',
		collectSalesTax: existing.collectSalesTax ?? false,
		taxMode: existing.taxMode ?? '',
		stripeTaxRateId: existing.stripeTaxRateId ?? ''
	};
	return client.request('/api/admin/groups/update', { method: 'PUT', body: JSON.stringify(payload) });
}

//* The server unassigns every member (userGroupId = 0) before deleting.
export function deleteGroup(client: AdminClient, groupId: number): Promise<{ message: string }> {
	return client.request(`/api/admin/groups/delete/${groupId}`, { method: 'DELETE' });
}

export async function listGroupAdmins(client: AdminClient, groupId: number): Promise<GroupAdminSummary[]> {
	const response = await client.request<{ groupAdmins: GroupAdminSummary[] | null }>(`/api/admin/groups/admins?groupId=${groupId}`);
	return response?.groupAdmins ?? [];
}

export function assignGroupAdmin(client: AdminClient, userId: number, groupId: number): Promise<{ message: string }> {
	return client.request('/api/admin/groups/assign-admin', { method: 'POST', body: JSON.stringify({ userId, groupId }) });
}

export function removeGroupAdmin(client: AdminClient, userId: number, groupId: number): Promise<{ message: string }> {
	return client.request('/api/admin/groups/remove-admin', { method: 'POST', body: JSON.stringify({ userId, groupId }) });
}

export async function listGroupCodes(client: AdminClient, groupId: number): Promise<RegistrationCode[]> {
	const response = await client.request<{ codes: RegistrationCode[] | null }>(`/api/admin/groups/${groupId}/codes`);
	return response?.codes ?? [];
}

export interface GenerateCodePayload {
	label: string;
	code: string;
	expiresAt: number;
	maxUses: number;
	isOneTime: boolean;
}

export function generateGroupCode(client: AdminClient, groupId: number, payload: GenerateCodePayload): Promise<{ code: string; message: string }> {
	return client.request(`/api/admin/groups/${groupId}/codes/generate`, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteGroupCode(client: AdminClient, groupId: number, codeId: number): Promise<{ message: string }> {
	return client.request(`/api/admin/groups/${groupId}/codes/${codeId}`, { method: 'DELETE' });
}

//* API keys and downstreams (server/admin.go): whole-list GET / PUT.

export async function getApikeys(client: AdminClient): Promise<ApikeyRecord[]> {
	const response = await client.request<{ apikeys: ApikeyRecord[] | null }>('/api/admin/apikeys');
	return response?.apikeys ?? [];
}

export async function putApikeys(client: AdminClient, list: ApikeyRecord[]): Promise<ApikeyRecord[]> {
	const response = await client.request<{ apikeys: ApikeyRecord[] | null }>('/api/admin/apikeys', { method: 'PUT', body: JSON.stringify(list) });
	return response?.apikeys ?? [];
}

export async function getDownstreams(client: AdminClient): Promise<DownstreamRecord[]> {
	const response = await client.request<{ downstreams: DownstreamRecord[] | null }>('/api/admin/downstreams');
	return response?.downstreams ?? [];
}

export async function putDownstreams(client: AdminClient, list: DownstreamRecord[]): Promise<DownstreamRecord[]> {
	const response = await client.request<{ downstreams: DownstreamRecord[] | null }>('/api/admin/downstreams', {
		method: 'PUT',
		body: JSON.stringify(list)
	});
	return response?.downstreams ?? [];
}
