//* Types for the Systems admin section. Shapes mirror the Go MarshalJSON output
//* (server/system.go, talkgroup.go, unit.go, site.go, tone_detector.go); keys the
//* server omits when zero are optional here.

export interface AdminToneSpec {
	frequency: number;
	minDuration: number;
	maxDuration: number;
}

export interface AdminToneSet {
	id?: string;
	label: string;
	aTone?: AdminToneSpec | null;
	bTone?: AdminToneSpec | null;
	longTone?: AdminToneSpec | null;
	tolerance?: number;
	minDuration?: number;
	downstreamEnabled?: boolean;
	downstreamURL?: string;
	downstreamAPIKey?: string;
}

export interface AdminTalkgroup {
	id: number;
	talkgroupRef: number;
	label: string;
	name: string;
	groupIds: number[];
	tagId?: number;
	delay?: number;
	frequency?: number;
	type?: string;
	order?: number;
	retentionDays?: number;
	toneDetectionEnabled: boolean;
	toneSets?: AdminToneSet[];
	toneDownstreamEnabled: boolean;
	toneDownstreamURL?: string;
	toneDownstreamAPIKey?: string;
	alertCooldownSeconds: number;
	linkedVoiceTalkgroupRef: number;
	linkedVoiceWindowSeconds: number;
	linkedVoiceMinDurationSeconds: number;
	alertsEnabled: boolean;
	alertingTalkgroup: boolean;
	transcriptionPrompt: string;
	autoLearnToneSets: boolean;
	autoLearnUnitAliases: boolean;
}

export interface AdminUnit {
	id: number;
	label: string;
	unitRef?: number;
	unitFrom?: number;
	unitTo?: number;
	order?: number;
}

export interface AdminSite {
	id?: number;
	siteRef: string;
	label: string;
	rfss?: number;
	order?: number;
	frequencies?: number[];
}

export interface AdminSystemFull {
	id: number;
	systemRef: number;
	label: string;
	type?: string;
	autoPopulate: boolean;
	blacklists?: string;
	delay?: number;
	order?: number;
	sites: AdminSite[];
	talkgroups: AdminTalkgroup[];
	units: AdminUnit[];
	noAudioAlertsEnabled: boolean;
	noAudioThresholdMinutes: number;
	retentionDays?: number;
	duplicateDetectionEnabled: boolean;
	alertsEnabled: boolean;
	autoPopulateAlertsEnabled: boolean;
	autoPopulateUnits: boolean;
	transcriptionPrompt: string;
	autoLearnToneSets: boolean;
	autoLearnToneSetsTagIds: number[] | null;
	autoLearnToneSetsAutoOffDays: number;
	autoLearnToneSetsExpiresAt?: number;
	bulkToneDetectionEnabled: boolean;
	bulkToneDetectionTagIds: number[] | null;
	bulkToneDetectionAutoOffDays: number;
	bulkToneDetectionExpiresAt?: number;
	autoLearnUnitAliases: boolean;
	autoLearnUnitAliasesTagIds: number[] | null;
	autoLearnUnitAliasesAutoOffDays: number;
	autoLearnUnitAliasesExpiresAt?: number;
}

//* The system PATCH response: the system minus its child lists.
export type AdminSystemSummary = Omit<AdminSystemFull, 'talkgroups' | 'units'>;

export interface AdminTag {
	id: number;
	label: string;
}

export interface AdminGroup {
	id: number;
	label: string;
}

export const SYSTEM_TYPES: { value: string; label: string }[] = [
	{ value: '', label: 'No Type' },
	{ value: 'am', label: 'AM' },
	{ value: 'dmr', label: 'DMR' },
	{ value: 'fm', label: 'FM' },
	{ value: 'nfm', label: 'NFM' },
	{ value: 'nxdn', label: 'NXDN' },
	{ value: 'p25', label: 'P25' },
	{ value: 'provoice', label: 'Provoice' },
	{ value: 'smartnet', label: 'SmartNet' },
	{ value: 'tetra', label: 'Tetra' }
];

export function systemTypeLabel(value: string | undefined): string {
	return SYSTEM_TYPES.find((t) => t.value === (value ?? ''))?.label ?? (value ?? '').toUpperCase();
}
