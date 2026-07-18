//* Types for the admin panel API (server/admin.go, server/options.go).
//* Options fields mirror the Go Options struct's JSON tags; unknown keys are
//* preserved via index signatures so partial typing never drops server data.

export interface AdminLoginConfig {
	adminPasswordLoginDisabled: boolean;
	version?: string;
}

export interface AdminLoginResponse {
	token: string;
	passwordNeedChange?: boolean;
}

//* Nested Options objects (deep-merged server-side on PATCH).
export interface AdminTranscriptionConfig {
	enabled?: boolean;
	provider?: 'whisper-api' | 'azure' | 'google' | 'assemblyai' | 'cloudflare';
	whisperAPIURL?: string;
	whisperAPIKey?: string;
	whisperAPIModel?: string;
	azureKey?: string;
	azureRegion?: string;
	googleAPIKey?: string;
	googleCredentials?: string;
	assemblyAIKey?: string;
	assemblyAISpeechModel?: string;
	assemblyAIWordBoost?: string[];
	cloudflareAccountID?: string;
	cloudflareAPIToken?: string;
	cloudflareModel?: string;
	language?: string;
	prompt?: string;
	timeoutSeconds?: number;
	minCallDuration?: number;
	workerPoolSize?: number;
	hallucinationPatterns?: string[];
	hallucinationDetectionMode?: 'off' | 'learning' | 'auto-remove';
	hallucinationConfidenceThreshold?: number;
	[key: string]: unknown;
}

export interface AdminOpenAIIntegration {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
	[key: string]: unknown;
}

export interface AdminAutoLearnToneSetConfig {
	aToneMinDuration?: number;
	aToneMaxDuration?: number;
	bToneMinDuration?: number;
	bToneMaxDuration?: number;
	longToneMinDuration?: number;
	longToneMaxDuration?: number;
	callsRequired?: number;
	frequencyToleranceHz?: number;
	[key: string]: unknown;
}

//* The server Options struct (Stripe/billing fields intentionally untyped; they
//* ride along in the index signature and are never surfaced in this UI).
export interface AdminOptions {
	//* General
	time12hFormat?: boolean;
	autoPopulate?: boolean;
	defaultSystemDelay?: number;
	playbackGoesLive?: boolean;
	keypadBeeps?: string;
	maxClients?: number;
	pruneDays?: number;
	showListenersCount?: boolean;
	sortTalkgroups?: boolean;
	reconnectionGracePeriod?: number;
	reconnectionMaxBufferSize?: number;
	configSyncEnabled?: boolean;
	configSyncPath?: string;
	//* Branding
	branding?: string;
	baseUrl?: string;
	email?: string;
	faviconFilename?: string;
	emailLogoFilename?: string;
	emailLogoBorderRadius?: string;
	//* Alerts and health
	alertRetentionDays?: number;
	systemHealthAlertsEnabled?: boolean;
	transcriptionFailureAlertsEnabled?: boolean;
	transcriptionFailureThreshold?: number;
	transcriptionFailureTimeWindow?: number;
	transcriptionFailureRepeatMinutes?: number;
	toneDetectionAlertsEnabled?: boolean;
	toneDetectionIssueThreshold?: number;
	toneDetectionTimeWindow?: number;
	toneDetectionRepeatMinutes?: number;
	noAudioAlertsEnabled?: boolean;
	noAudioThresholdMinutes?: number;
	noAudioRepeatMinutes?: number;
	autoLearnToneSetConfig?: AdminAutoLearnToneSetConfig;
	//* Audio
	audioConversion?: number;
	disableDuplicateDetection?: boolean;
	duplicateTimestampWindow?: number;
	duplicateDetectionTimeFrame?: number;
	audioEncryptionEnabled?: boolean;
	maxDownloadsPerWindow?: number;
	downloadWindowMinutes?: number;
	//* Email
	emailServiceEnabled?: boolean;
	emailProvider?: 'sendgrid' | 'mailgun' | 'smtp';
	emailSendGridApiKey?: string;
	emailMailgunApiKey?: string;
	emailMailgunDomain?: string;
	emailMailgunApiBase?: string;
	emailSmtpHost?: string;
	emailSmtpPort?: number;
	emailSmtpUsername?: string;
	emailSmtpPassword?: string;
	emailSmtpUseTLS?: boolean;
	emailSmtpSkipVerify?: boolean;
	emailSmtpFromEmail?: string;
	emailSmtpFromName?: string;
	//* Integrations
	openAIIntegration?: AdminOpenAIIntegration;
	radioReferenceEnabled?: boolean;
	radioReferenceUsername?: string;
	radioReferencePassword?: string;
	relayServerURL?: string;
	relayServerAPIKey?: string;
	//* Transcription
	transcriptionEnabled?: boolean;
	transcriptionEnhancement?: boolean;
	transcriptionConfig?: AdminTranscriptionConfig;
	nominatimUrl?: string;
	//* Registration
	userRegistrationEnabled?: boolean;
	publicRegistrationEnabled?: boolean;
	publicRegistrationMode?: 'codes' | 'email' | 'both';
	emailVerificationRequired?: boolean;
	turnstileEnabled?: boolean;
	turnstileSiteKey?: string;
	turnstileSecretKey?: string;
	//* Admin access
	adminLocalhostOnly?: boolean;
	adminPasswordLoginDisabled?: boolean;
	adminAllowedIPs?: string;
	//* Central management (read-only in this UI for now)
	centralManagementEnabled?: boolean;
	[key: string]: unknown;
}

//* A partial Options object for PATCH /api/admin/options (single or few keys).
export type AdminOptionsPatch = Partial<AdminOptions>;

//* A radio system as it appears in the admin config payload (partial typing;
//* only the fields the admin UI touches so far).
export interface AdminSystem {
	id: number;
	label: string;
	noAudioAlertsEnabled?: boolean;
	noAudioThresholdMinutes?: number;
	retentionDays?: number;
	duplicateDetectionEnabled?: boolean;
	[key: string]: unknown;
}

//* The `config` key of GET /api/admin/config and of PATCH responses.
export interface AdminConfigPayload {
	options: AdminOptions;
	branding?: string;
	version?: string;
	systems?: AdminSystem[];
	tags?: unknown[];
	groups?: unknown[];
	apikeys?: unknown[];
	dirwatch?: unknown[];
	downstreams?: unknown[];
	users?: unknown[];
	userGroups?: unknown[];
	keywordLists?: unknown[];
	[key: string]: unknown;
}

export interface AdminConfigDocument {
	config: AdminConfigPayload;
	passwordNeedChange?: boolean;
	docker?: boolean;
}

export type AdminSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'logged-out';

export type AdminSocketEvent = { type: 'config'; payload: AdminConfigDocument } | { type: 'status'; status: AdminSocketStatus };
