//* Types and pure helpers for the Dirwatch, Logs and System Health admin sections.

//* ---- Dirwatch (server/dirwatch.go FromMap/MarshalJSON) ----

export type DirwatchType = 'default' | 'dsdplus' | 'sdr-trunk' | 'trunk-recorder';

export const DIRWATCH_TYPES: { value: DirwatchType; label: string; description: string }[] = [
	{ value: 'default', label: 'Default', description: 'Extract the metadata from a custom file name mask.' },
	{ value: 'dsdplus', label: 'DSDPlus Fast Lane', description: 'Extract the metadata from the file path.' },
	{ value: 'sdr-trunk', label: 'SDR Trunk', description: 'Extract the metadata from the MP3 tags defined on the SDR Trunk aliases tab.' },
	{ value: 'trunk-recorder', label: 'Trunk Recorder', description: 'Extract the metadata from the json file written next to the audio.' }
];

export const DIRWATCH_MIN_DELAY = 2000;

//* The server omits zero/empty values when marshalling, so every field is optional.
export interface DirwatchEntry {
	id?: number;
	delay?: number;
	deleteAfter?: boolean;
	directory?: string;
	disabled?: boolean;
	extension?: string;
	frequency?: number;
	mask?: string;
	order?: number;
	siteId?: number;
	systemId?: number;
	talkgroupId?: number;
	type?: DirwatchType | string;
}

export const MASK_TAGS: { tag: string; description: string }[] = [
	{ tag: '#DATE', description: 'date like 20201231 (YYYYMMDD), 2020-12-31 or 2020_12_31' },
	{ tag: '#GROUP', description: 'group label' },
	{ tag: '#HZ', description: 'frequency in hertz like 119100000' },
	{ tag: '#KHZ', description: 'frequency in kilohertz like 119100' },
	{ tag: '#MHZ', description: 'frequency in megahertz like 119.100' },
	{ tag: '#SITE', description: 'site id like 1' },
	{ tag: '#SITELBL', description: 'site label' },
	{ tag: '#SYS', description: 'system id like 11' },
	{ tag: '#SYSLBL', description: 'system label' },
	{ tag: '#TAG', description: 'tag label' },
	{ tag: '#TG', description: 'talkgroup id like 1457 (decimal)' },
	{ tag: '#TGAFS', description: 'talkgroup id like 11-061 (agency-fleet-subfleet)' },
	{ tag: '#TGHZ', description: 'frequency in hertz like 119100000, talkgroup id set to 119100' },
	{ tag: '#TGKHZ', description: 'frequency in kilohertz like 119100.000 or 119100, talkgroup id set to 119100' },
	{ tag: '#TGLBL', description: 'talkgroup label' },
	{ tag: '#TGMHZ', description: 'frequency in megahertz like 119.100000 or 119, talkgroup id set to 119100' },
	{ tag: '#TIME', description: 'local time like 083439 (HHMMSS), 08-34-39 or 08:34:39' },
	{ tag: '#UNIT', description: 'unit id like 4424001' },
	{ tag: '#UNITLBL', description: 'unit label (also requires #UNIT)' },
	{ tag: '#ZTIME', description: 'zulu time like 043439 (HHMMSS), 04-34-39 or 04:34:39' }
];

export function newDirwatchEntry(): DirwatchEntry {
	return { type: 'default', delay: DIRWATCH_MIN_DELAY, deleteAfter: true, disabled: false, directory: '' };
}

export function dirwatchTypeLabel(type: string | undefined): string {
	return DIRWATCH_TYPES.find((t) => t.value === (type || 'default'))?.label ?? type ?? 'Default';
}

//* Which fields apply to a given dirwatch type (mirrors the old admin form).
export function dirwatchShows(type: string | undefined, field: 'extension' | 'system' | 'mask' | 'frequency' | 'delay'): boolean {
	const t = type || 'default';
	switch (field) {
		case 'extension':
			return t === 'default' || t === 'dsdplus' || t === 'trunk-recorder';
		case 'system':
			return t === 'default' || t === 'dsdplus';
		default:
			return t === 'default';
	}
}

export type DirwatchErrors = Partial<Record<'directory' | 'extension' | 'mask' | 'frequency' | 'delay' | 'systemId' | 'talkgroupId', string>>;

//* Validation ported from the old admin form validators. `others` are the other
//* entries in the list (for the duplicate-directory check).
export function validateDirwatch(entry: DirwatchEntry, others: DirwatchEntry[]): DirwatchErrors {
	const errors: DirwatchErrors = {};
	const type = entry.type || 'default';
	const directory = (entry.directory ?? '').trim();
	const mask = entry.mask ?? '';

	if (!directory) errors.directory = 'Directory is required';
	else if (directory.startsWith('\\')) errors.directory = 'Network folders are not supported';
	else if (others.some((o) => (o.directory ?? '').trim() === directory)) errors.directory = 'Directory is already defined';

	if (dirwatchShows(type, 'extension') && entry.extension && !/^[0-9a-zA-Z]+$/.test(entry.extension)) {
		errors.extension = 'Extension must be letters and digits only, without the period';
	}

	if (type === 'default') {
		const tags = mask.match(/(#[A-Z]+)/g) ?? [];
		if (!tags.some((tag) => MASK_TAGS.some((m) => m.tag === tag))) {
			errors.mask = 'Mask must include at least one meta tag (e.g. #TG)';
		}
		if (entry.frequency !== undefined && entry.frequency !== null && entry.frequency < 1) {
			errors.frequency = 'Frequency must be at least 1 Hz';
		}
		if ((entry.delay ?? DIRWATCH_MIN_DELAY) < DIRWATCH_MIN_DELAY) {
			errors.delay = `Delay cannot be less than ${DIRWATCH_MIN_DELAY} milliseconds`;
		}
	}

	if (dirwatchShows(type, 'system')) {
		const maskHasSys = type === 'default' && /#SYS/.test(mask);
		const maskHasTg = type === 'default' && /#TG/.test(mask);
		if (!maskHasSys && !entry.systemId) errors.systemId = 'System is required unless the mask contains #SYS';
		if (!maskHasTg && !entry.talkgroupId) errors.talkgroupId = 'Talkgroup is required unless the mask contains #TG';
	}

	return errors;
}

//* Drops fields that do not apply to the type and normalizes numbers so the
//* PUT body matches what the server expects (floats for numeric fields).
export function normalizeDirwatch(entry: DirwatchEntry, order: number): DirwatchEntry {
	const type = (entry.type || 'default') as DirwatchType;
	const out: DirwatchEntry = {
		delay: Math.max(DIRWATCH_MIN_DELAY, Number(entry.delay) || DIRWATCH_MIN_DELAY),
		deleteAfter: !!entry.deleteAfter,
		directory: (entry.directory ?? '').trim(),
		disabled: !!entry.disabled,
		order,
		type
	};
	if (entry.id) out.id = entry.id;
	if (dirwatchShows(type, 'extension') && entry.extension) out.extension = entry.extension.trim();
	if (dirwatchShows(type, 'system')) {
		if (entry.systemId) out.systemId = entry.systemId;
		if (entry.siteId) out.siteId = entry.siteId;
		if (entry.talkgroupId) out.talkgroupId = entry.talkgroupId;
	}
	if (type === 'default') {
		if (entry.mask) out.mask = entry.mask.trim();
		if (entry.frequency) out.frequency = Number(entry.frequency);
	}
	return out;
}

//* ---- Logs (server/log.go) ----

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
	id: number;
	dateTime: string;
	level: LogLevel | string;
	category: string;
	message: string;
}

export interface LogCategory {
	key: string;
	label: string;
}

//* POST /api/admin/logs body. `date` is RFC3339; `sort` -1 = newest first.
export interface LogsSearchRequest {
	categories?: string[];
	date?: string;
	level?: LogLevel;
	limit: number;
	offset: number;
	search?: string;
	sort: 1 | -1;
}

//* `count` is not a total: it is offset + rows (+1 when hasMore).
export interface LogsSearchResponse {
	count: number;
	hasMore: boolean;
	logs: LogEntry[];
}

export function logLevelLabel(level: string): string {
	switch (level) {
		case 'error':
			return 'Error';
		case 'warn':
			return 'Warn';
		case 'info':
			return 'Info';
		default:
			return level;
	}
}

//* ---- System health (server/system_alert.go) ----

export type SystemAlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface SystemAlert {
	id: number;
	alertType: string;
	severity: SystemAlertSeverity | string;
	title: string;
	message: string;
	data: string;
	createdAt: number;
	createdBy: number;
	dismissed: boolean;
}

export interface SystemAlertData {
	callId?: number;
	systemId?: number;
	systemLabel?: string;
	talkgroupId?: number;
	error?: string;
	count?: number;
	service?: string;
	threshold?: number;
	lastCallTime?: number;
	minutesSinceLast?: number;
	apiKeyId?: number;
	apiKeyIdent?: string;
	[key: string]: unknown;
}

export interface FailedCall {
	callId: number;
	systemId: number;
	talkgroupId: number;
	timestamp: number;
	systemLabel: string;
	talkgroupLabel: string;
	talkgroupName: string;
	failureReason: string;
}

export const ALERT_GROUP_ORDER = ['no_audio', 'no_audio_received', 'api_key_no_audio', 'tone_detection_issue', 'transcription_failure', 'other'] as const;

export function alertTypeLabel(type: string): string {
	switch (type) {
		case 'no_audio':
		case 'no_audio_received':
			return 'No Audio Received';
		case 'api_key_no_audio':
			return 'API Key No Uploads';
		case 'tone_detection_issue':
			return 'Tone Detection Issues';
		case 'transcription_failure':
			return 'Transcription Failures';
		case 'service_health':
			return 'Service Health';
		case 'manual':
			return 'Manual Alerts';
		default:
			return 'Other Alerts';
	}
}

export function parseAlertData(alert: SystemAlert): SystemAlertData {
	try {
		const parsed = JSON.parse(alert.data || '{}');
		return parsed && typeof parsed === 'object' ? (parsed as SystemAlertData) : {};
	} catch {
		return {};
	}
}

//* Groups active alerts by type in a stable display order.
export function groupAlerts(alerts: SystemAlert[]): { type: string; label: string; alerts: SystemAlert[] }[] {
	const buckets = new Map<string, SystemAlert[]>();
	for (const alert of alerts) {
		const key = (ALERT_GROUP_ORDER as readonly string[]).includes(alert.alertType) ? alert.alertType : 'other';
		const bucket = buckets.get(key);
		if (bucket) bucket.push(alert);
		else buckets.set(key, [alert]);
	}
	return ALERT_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({ type: key, label: alertTypeLabel(key), alerts: buckets.get(key)! }));
}
