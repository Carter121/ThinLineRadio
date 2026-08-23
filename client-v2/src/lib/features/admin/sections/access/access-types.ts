//* Types and (de)serialization helpers shared by the Users, User Groups,
//* API Keys and Downstreams admin sections.
//* Access scopes are keyed by systemRef / talkgroupRef (not DB ids): see
//* Apikey.HasAccess, Downstream.HasAccess, User.HasAccess in the Go server.

export type AccessTalkgroups = '*' | number[];

export interface AccessSystemEntry {
	id: number;
	talkgroups: AccessTalkgroups;
}

//* '*' = every system and talkgroup; [] = no access at all.
export type AccessSystems = '*' | AccessSystemEntry[];

//* systemRef -> minutes
export type SystemDelays = Record<string, number>;
//* "systemRef:talkgroupRef" -> minutes
export type TalkgroupDelays = Record<string, number>;

export interface FcmToken {
	id: number;
	fcmToken: string;
	pushType: string;
	platform: string;
	sound: string;
	createdAt: string;
	lastUsed: string;
}

//* One row of GET /api/admin/users (timestamps arrive preformatted).
export interface AdminUserRecord {
	id: number;
	email: string;
	firstName: string;
	lastName: string;
	zipCode: string;
	verified: boolean;
	createdAt: string;
	lastLogin: string;
	systems: string;
	delay: number;
	systemDelays: string;
	talkgroupDelays: string;
	pin: string;
	pinExpiresAt: number;
	pinExpired: boolean;
	connectionLimit: number;
	effectiveConnectionLimit: number;
	userGroupId: number;
	isGroupAdmin: boolean;
	systemAdmin: boolean;
	pushSystemNoAudioAlerts: boolean;
	pushApiKeyNoAudioAlerts: boolean;
	forcePasswordReset: boolean;
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	subscriptionStatus: string;
	fcmTokens: FcmToken[] | null;
}

//* Body of PUT /api/admin/users/{id}. Stripe fields are echoed back untouched
//* because the handler overwrites them unconditionally.
export interface UserUpdatePayload {
	email: string;
	firstName: string;
	lastName: string;
	zipCode: string;
	verified: boolean;
	systems: string;
	delay: number;
	systemDelays: string;
	talkgroupDelays: string;
	connectionLimit: number;
	pinExpiresAt: number;
	userGroupId: number;
	isGroupAdmin: boolean;
	systemAdmin: boolean;
	pushSystemNoAudioAlerts: boolean;
	pushApiKeyNoAudioAlerts: boolean;
	forcePasswordReset: boolean;
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	subscriptionStatus: string;
	pin?: string;
	regeneratePin?: boolean;
}

export interface UserCreatePayload {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	zipCode: string;
	userGroupId: number;
	verified: boolean;
}

//* One row of GET /api/admin/groups. Billing fields ride along (never shown)
//* so updates can echo them back without wiping server data.
export interface AdminUserGroupRecord {
	id: number;
	name: string;
	description: string;
	systemAccess: string;
	delay: number;
	systemDelays: string;
	talkgroupDelays: string;
	connectionLimit: number;
	maxUsers: number;
	isPublicRegistration: boolean;
	allowAddExistingUsers: boolean;
	createdAt: number;
	billingEnabled?: boolean;
	stripePriceId?: string;
	pricingOptions?: unknown;
	billingMode?: string;
	collectSalesTax?: boolean;
	taxMode?: string;
	stripeTaxRateId?: string;
}

export interface GroupEditableFields {
	name: string;
	description: string;
	systemAccess: string;
	delay: number;
	systemDelays: string;
	talkgroupDelays: string;
	connectionLimit: number;
	maxUsers: number;
	isPublicRegistration: boolean;
	allowAddExistingUsers: boolean;
}

export interface GroupCreatePayload extends GroupEditableFields {
	assignExistingUserAsAdmin?: boolean;
	groupAdminUserId?: number;
	createNewUserAsAdmin?: boolean;
	newGroupAdminEmail?: string;
	newGroupAdminPassword?: string;
	newGroupAdminFirstName?: string;
	newGroupAdminLastName?: string;
	newGroupAdminZipCode?: string;
}

export interface RegistrationCode {
	id: number;
	code: string;
	label: string;
	expiresAt: number;
	maxUses: number;
	currentUses: number;
	isOneTime: boolean;
	isActive: boolean;
	createdAt: number;
}

export interface GroupAdminSummary {
	id: number;
	email: string;
	firstName: string;
	lastName: string;
}

export interface ApikeyRecord {
	id?: number;
	disabled: boolean;
	ident: string;
	key: string;
	order?: number;
	systems: AccessSystems;
	lastCallAt: number;
	noAudioAlertsEnabled: boolean;
	noAudioThresholdMinutes: number;
}

export interface DownstreamRecord {
	id?: number;
	apikey: string;
	disabled: boolean;
	name: string;
	order?: number;
	systems: AccessSystems;
	url: string;
}

//* Minimal system / talkgroup shape the access picker needs.
export interface PickerTalkgroup {
	talkgroupRef: number;
	label: string;
	name: string;
	tagId: number;
	groupIds: number[];
}

export interface PickerSystem {
	systemRef: number;
	label: string;
	talkgroups: PickerTalkgroup[];
}

export interface PickerLabel {
	id: number;
	label: string;
}

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

//* Accepts '*', '', null, a JSON string, or an already-parsed array (legacy
//* number arrays become whole-system entries). Anything unparseable is '*',
//* mirroring the server's fallback.
export function parseAccess(raw: unknown, emptyMeans: '*' | 'none' = '*'): AccessSystems {
	if (raw === null || raw === undefined) return emptyMeans === '*' ? '*' : [];
	let value: unknown = raw;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') return emptyMeans === '*' ? '*' : [];
		if (trimmed === '*') return '*';
		try {
			value = JSON.parse(trimmed);
		} catch {
			return '*';
		}
	}
	if (value === '*') return '*';
	if (!Array.isArray(value)) return '*';
	const entries: AccessSystemEntry[] = [];
	for (const item of value) {
		if (typeof item === 'number' || typeof item === 'string') {
			const id = toNumber(item);
			if (id !== null) entries.push({ id, talkgroups: '*' });
			continue;
		}
		if (item && typeof item === 'object') {
			const id = toNumber((item as { id?: unknown }).id);
			if (id === null) continue;
			const tg = (item as { talkgroups?: unknown }).talkgroups;
			let talkgroups: AccessTalkgroups = '*';
			if (Array.isArray(tg)) {
				talkgroups = tg.map(toNumber).filter((n): n is number => n !== null);
			}
			entries.push({ id, talkgroups });
		}
	}
	return entries;
}

//* Users store access as a string column: '*' or JSON.
export function serializeUserAccess(access: AccessSystems): string {
	return access === '*' ? '*' : JSON.stringify(access);
}

//* Groups store access as a string column where '' means every system.
export function serializeGroupAccess(access: AccessSystems): string {
	return access === '*' ? '' : JSON.stringify(access);
}

export function parseDelayMap(raw: unknown): Record<string, number> {
	if (typeof raw !== 'string' || raw.trim() === '') return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const out: Record<string, number> = {};
		for (const [key, value] of Object.entries(parsed)) {
			const n = toNumber(value);
			if (n !== null && n >= 0) out[key] = n;
		}
		return out;
	} catch {
		return {};
	}
}

export function serializeDelayMap(map: Record<string, number>): string {
	const entries = Object.entries(map).filter(([, v]) => Number.isFinite(v) && v > 0);
	return entries.length === 0 ? '' : JSON.stringify(Object.fromEntries(entries));
}

//* Short human label for an access value, e.g. "All systems" or "2 systems, 14 talkgroups".
export function describeAccess(access: AccessSystems, systems: PickerSystem[]): string {
	if (access === '*') return 'All systems';
	if (access.length === 0) return 'No access';
	if (access.length === 1) {
		const entry = access[0];
		const system = systems.find((s) => s.systemRef === entry.id);
		const name = system?.label ?? `System ${entry.id}`;
		if (entry.talkgroups === '*') return `${name} (all talkgroups)`;
		return `${name} (${entry.talkgroups.length} talkgroup${entry.talkgroups.length === 1 ? '' : 's'})`;
	}
	const allTalkgroups = access.every((e) => e.talkgroups === '*');
	if (allTalkgroups) return `${access.length} systems (all talkgroups)`;
	const count = access.reduce((sum, e) => {
		if (e.talkgroups === '*') {
			const system = systems.find((s) => s.systemRef === e.id);
			return sum + (system?.talkgroups.length ?? 0);
		}
		return sum + e.talkgroups.length;
	}, 0);
	return `${access.length} systems, ${count} talkgroups`;
}

//* Maps the loosely typed admin config systems into what the picker needs.
export function toPickerSystems(raw: unknown): PickerSystem[] {
	if (!Array.isArray(raw)) return [];
	const out: PickerSystem[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const sys = item as Record<string, unknown>;
		const systemRef = toNumber(sys.systemRef) ?? toNumber(sys.id);
		if (systemRef === null) continue;
		const talkgroups: PickerTalkgroup[] = [];
		if (Array.isArray(sys.talkgroups)) {
			for (const tgRaw of sys.talkgroups) {
				if (!tgRaw || typeof tgRaw !== 'object') continue;
				const tg = tgRaw as Record<string, unknown>;
				const talkgroupRef = toNumber(tg.talkgroupRef);
				if (talkgroupRef === null) continue;
				talkgroups.push({
					talkgroupRef,
					label: typeof tg.label === 'string' ? tg.label : String(talkgroupRef),
					name: typeof tg.name === 'string' ? tg.name : '',
					tagId: toNumber(tg.tagId) ?? 0,
					groupIds: Array.isArray(tg.groupIds) ? tg.groupIds.map(toNumber).filter((n): n is number => n !== null) : []
				});
			}
		}
		talkgroups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
		out.push({ systemRef, label: typeof sys.label === 'string' ? sys.label : `System ${systemRef}`, talkgroups });
	}
	return out;
}

export function toPickerLabels(raw: unknown): PickerLabel[] {
	if (!Array.isArray(raw)) return [];
	const out: PickerLabel[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const id = toNumber((item as { id?: unknown }).id);
		const label = (item as { label?: unknown }).label;
		if (id !== null && typeof label === 'string') out.push({ id, label });
	}
	return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function userDisplayName(user: Pick<AdminUserRecord, 'firstName' | 'lastName' | 'email'>): string {
	const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
	return name || user.email;
}

export function generateApiKey(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	let dt = Date.now();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (dt + Math.random() * 16) % 16 | 0;
		dt = Math.floor(dt / 16);
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}
