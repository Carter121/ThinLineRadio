export interface AddressMatch {
	fullAddress: string;
	lat: number;
	lon: number;
	houseNumber?: string;
	road?: string;
	city?: string;
	county?: string;
	state?: string;
}

export type AlertType = 'tone' | 'keyword' | 'tone+keyword';

export interface LoginResponse {
	message: string;
	user: {
		id: number;
		email: string;
		pin?: string;
		systemAdmin?: boolean;
		subscriptionStatus?: string;
		needsSubscription?: boolean;
	};
}

export interface ServerStatus {
	cpu_cores: number;
	active_workers: number;
	total_calls: number;
	avg_process_time: string;
	goroutines: number;
	memory_stats: {
		alloc_mb: number;
		total_alloc_mb: number;
		sys_mb: number;
	};
}

export interface TranscriptAnnotationUnit {
	type: 'unit';
	text: string;
	start: number;
	end: number;
	prefix?: string;
	apparatus: string;
	number: string;
	fuzzy: boolean;
}

export interface TranscriptAnnotationChannel {
	type: 'channel';
	text: string;
	start: number;
	end: number;
	dispatch: string;
	separator: string;
	channel: string;
	fuzzy: boolean;
}

export type TranscriptAnnotation = TranscriptAnnotationUnit | TranscriptAnnotationChannel;

export interface ParsedAddress {
	address: string;
	originalAddress: string;
	geocodeQuery: string;
	near?: string;
	incidentType?: string;
	raw: string;
	match?: AddressMatch;
}

export interface Alert {
	alertId: number;
	callId: number;
	systemId: number;
	talkgroupId: number;
	alertType: AlertType;
	transcriptAnnotations?: TranscriptAnnotation[];
	parsedAddress?: ParsedAddress;
	toneDetected?: boolean;
	toneSetId?: string;
	keywordsMatched?: string[] | string;
	transcriptSnippet?: string;
	transcript?: string;
	transcriptionStatus?: string;
	callToneSequence?: unknown;
	callTimestamp?: number;
	createdAt: number;
	systemLabel?: string;
	systemRef?: number;
	talkgroupLabel?: string;
	talkgroupName?: string;
	matchedToneSetName?: string;
	matchedToneSetNames?: string[];
}

export interface Transcript {
	callId: number;
	systemId: number;
	talkgroupId: number;
	transcript: string;
	transcriptAnnotations?: TranscriptAnnotation[];
	transcriptionStatus?: string;
	alertSummary?: string;
	reviewedTranscript?: string;
	timestamp?: number | null;
	systemLabel?: string;
	talkgroupLabel?: string;
	talkgroupName?: string;
}

export interface StatsSystem {
	id: number;
	label: string;
}

export interface CallsPerMinuteBucket {
	minute: number | string;
	count: number;
}

export interface TopTalkgroupStat {
	label?: string;
	count?: number;
}

export interface IncidentSubcategory {
	label: string;
	count: number;
}

export interface IncidentCategory {
	category: string;
	count: number;
	subcategories?: IncidentSubcategory[];
}

export interface StatsResponse {
	availableSystems?: StatsSystem[];
	callsPerMinute?: CallsPerMinuteBucket[];
	topTalkgroups?: TopTalkgroupStat[];
	incidentSummary?: IncidentCategory[];
	callsLastHour?: number;
	callsLastMinute?: number;
	[key: string]: unknown;
}

export interface SystemAlert {
	id?: number;
	title?: string;
	message?: string;
	severity?: 'info' | 'warning' | 'error' | 'critical' | string;
	createdAt?: number;
	updatedAt?: number;
	dismissedAt?: number | null;
	active?: boolean;
	source?: string;
	type?: string;
	data?: {
		callId?: number;
		systemId?: number;
		talkgroupId?: number;
		service?: string;
		error?: string;
		count?: number;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export interface SystemAlertsResponse {
	alerts: SystemAlert[];
	isSystemAdmin?: boolean;
	count?: number;
}

export interface VersionInfo {
	version: string;
	branding?: string;
	email?: string;
}

export interface TlrConfigTalkgroup {
	id?: number;
	talkgroupRef?: number;
	label?: string;
	name?: string;
	tag?: string;
	alertCooldownSeconds?: number;
	linkedVoiceTalkgroupRef?: number;
	linkedVoiceWindowSeconds?: number;
	linkedVoiceMinDurationSeconds?: number;
}

export interface TlrConfigUnit {
	id?: number;
	label?: string;
	order?: number;
	unitRef?: number;
	unitFrom?: number;
	unitTo?: number;
}

export interface TlrConfigSystem {
	id?: number;
	systemRef?: number;
	label?: string;
	talkgroups?: TlrConfigTalkgroup[];
	units?: TlrConfigUnit[];
}

export interface TlrConfigOptions {
	baseUrl?: string;
	pricingOptions?: Array<{
		priceId: string;
		label: string;
		amount: string;
		trialDays?: number;
	}>;
	transcriptionEnabled?: boolean;
	stripePaywallEnabled?: boolean;
	audioFingerprintEnabled?: boolean;
	audioFingerprintThreshold?: number;
	audioFingerprintTimeFrame?: number;
	hydraAPIKey?: string;
	hydraTranscriptionEnabled?: boolean;
	adminPasswordLoginDisabled?: boolean;
	adminAllowedIPs?: string;
	timeoutSeconds?: number;
}

export interface TlrConfigUserFavorites {
	systemId?: number;
	talkgroupId?: number;
	type?: string;
}

export interface TlrConfigUserSettings {
	alertSound?: string;
	appFont?: string;
	autoLiveFeed?: boolean;
	favorites?: TlrConfigUserFavorites[];
}

export interface TlrConfig {
	branding?: string;
	email?: string;
	options?: TlrConfigOptions;
	playbackGoesLive?: boolean;
	showListenersCount?: boolean;
	time12hFormat?: boolean;
	systems?: TlrConfigSystem[] | Record<string, TlrConfigSystem>;
	groups?: Record<string, Record<string, number[]>>;
	userSettings?: TlrConfigUserSettings;
	[key: string]: unknown;
}

export interface TlrCallAudioBuffer {
	type: 'Buffer';
	data: number[];
}

export interface SocketCall {
	id: number;
	audio?: TlrCallAudioBuffer;
	audioName?: string;
	audioType?: string;
	dateTime: string;
	delayed: boolean;
	frequencies?: Array<{
		dbm?: number;
		errorCount?: number;
		freq?: number;
		len?: number;
		pos?: number;
		spikeCount?: number;
	}>;
	frequency?: number;
	patches?: number[];
	source?: number;
	sources?: Array<{
		pos?: number;
		src?: number;
		tag?: string;
	}>;
	site?: number | string;
	system: number;
	talkgroup: number;
	hasTones?: boolean;
	toneSequence?: unknown;
	transcript?: string;
	transcriptConfidence?: number;
	transcriptionStatus?: string;
}

export interface SocketAlertNotification {
	type: 'alert';
	callId: number;
	alertType: AlertType;
}

export type WebsocketCommand = 'ALT' | 'CAL' | 'CFG' | 'ERR' | 'XPR' | 'LCL' | 'LSC' | 'LFM' | 'MAX' | 'PIN' | 'PNS' | 'VER';

export type LivefeedMap = Record<string, Record<string, boolean>>;

export interface TlrConnectionState {
	status: 'idle' | 'connecting' | 'connected' | 'authenticating' | 'authenticated' | 'disconnected' | 'expired' | 'limited' | 'error';
	attempt: number;
	message?: string;
	limit?: number;
}

export type TlrSocketEvent =
	| { type: 'connection'; state: TlrConnectionState }
	| { type: 'version'; payload: VersionInfo }
	| { type: 'pin-required' }
	| { type: 'pin-set'; pin: string }
	| { type: 'config'; payload: TlrConfig }
	| { type: 'livefeed'; active: boolean }
	| { type: 'call'; payload: SocketCall }
	| { type: 'alert'; payload: SocketAlertNotification }
	| { type: 'listeners'; count: number }
	| { type: 'expired' }
	| { type: 'limited'; limit: number }
	| { type: 'call-list'; payload: LclResponse }
	| { type: 'call-playback'; payload: SocketCall }
	| { type: 'call-alias'; payload: SocketCall }
	| { type: 'error'; message: string };

export interface LclFilters {
	date?: string;
	group?: string;
	limit?: number;
	offset?: number;
	sort?: number;
	system?: number;
	tag?: string;
	talkgroup?: number;
}

export interface LclResultItem {
	id: number;
	system: number;
	talkgroup: number;
	dateTime: string;
	frequency?: number;
	source?: number;
	site?: number | string;
}

export interface LclResponse {
	count: number;
	hasMore: boolean;
	results: LclResultItem[];
}

export interface TranscriptQuery {
	limit?: number;
	offset?: number;
	systemId?: number;
	talkgroupId?: number;
	status?: string;
	dateFrom?: number;
	dateTo?: number;
	search?: string;
}

export function normalizeConfigSystems(config: TlrConfig | null | undefined): TlrConfigSystem[] {
	if (!config?.systems) return [];
	return Array.isArray(config.systems) ? config.systems : Object.values(config.systems);
}

export function sortTalkgroupsAlphabetically(talkgroups: TlrConfigTalkgroup[]): TlrConfigTalkgroup[] {
	return talkgroups.sort((a, b) => {
		if (!a.id || !a.label || !b.id || !b.label) return 0;
		const aVal = a.label.toLocaleLowerCase();
		const bVal = b.label.toLocaleLowerCase();
		return aVal.localeCompare(bVal);
	});
}
