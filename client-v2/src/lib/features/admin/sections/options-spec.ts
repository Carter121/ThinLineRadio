//* Declarative spec for the server Options section: one entry per editable
//* field, grouped into panels mirroring the old admin's expandable groups.
//* Toggles auto-save on change; other fields save per panel. Stripe/billing is
//* intentionally absent. Keys are dot-paths into the Options object.

import type { AdminOptions } from '$lib/core/admin-types.ts';

//* Draft values keyed by dot-path; showIf conditions read this so visibility
//* reacts to unsaved edits (e.g. switching email provider).
export type OptionValues = Record<string, unknown>;

export interface OptionFieldSpec {
	key: string;
	label: string;
	caption?: string;
	type: 'toggle' | 'text' | 'number' | 'select' | 'textarea';
	//* Password-style input for secrets.
	masked?: boolean;
	placeholder?: string;
	min?: number;
	max?: number;
	step?: number;
	rows?: number;
	//* Array-backed text: 'lines' splits a textarea on newlines, 'csv' on commas.
	array?: 'lines' | 'csv';
	//* Select options; 'numeric' casts the chosen value back to a number on save.
	options?: { value: string; label: string }[];
	numeric?: boolean;
	//* Autocomplete suggestions for free-text fields (rendered as a datalist).
	suggestions?: { value: string; label: string }[];
	showIf?: (values: OptionValues) => boolean;
}

export interface OptionPanelSpec {
	id: string;
	label: string;
	description?: string;
	fields: OptionFieldSpec[];
}

const truthy = (values: OptionValues, key: string) => values[key] === true;

export const OPTION_PANELS: OptionPanelSpec[] = [
	{
		id: 'general',
		label: 'General',
		fields: [
			{ key: 'time12hFormat', label: '12-Hour Time Format', type: 'toggle', caption: 'Display times as 12-hour with AM/PM.' },
			{ key: 'autoPopulate', label: 'Auto Populate', type: 'toggle', caption: 'Automatically add new systems and talkgroups as calls arrive.' },
			{
				key: 'defaultSystemDelay',
				label: 'Default System Delay',
				type: 'number',
				min: 0,
				step: 1,
				caption: 'Minutes to delay calls for new systems.'
			},
			{ key: 'playbackGoesLive', label: 'Playback Goes Live', type: 'toggle', caption: 'Jump back to live audio when playback finishes.' },
			{
				key: 'keypadBeeps',
				label: 'Keypad Beeps',
				type: 'select',
				options: [
					{ value: '', label: 'Disabled' },
					{ value: 'uniden', label: 'Uniden' },
					{ value: 'whistler', label: 'Whistler' }
				],
				caption: 'Beep style for scanner keypad interactions.'
			},
			{ key: 'maxClients', label: 'Maximum Clients', type: 'number', min: 0, step: 1, caption: '0 means unlimited concurrent listeners.' },
			{ key: 'pruneDays', label: 'Prune Days', type: 'number', min: 0, step: 1, caption: 'Days of calls to keep; 0 disables pruning.' },
			{ key: 'showListenersCount', label: 'Show Listeners Count', type: 'toggle', caption: 'Show the live listener count in the UI.' },
			{ key: 'sortTalkgroups', label: 'Sort Talkgroups', type: 'toggle', caption: 'Sort talkgroups alphabetically instead of by config order.' },
			{
				key: 'reconnectionEnabled',
				label: 'Listener Reconnection',
				type: 'toggle',
				caption: 'Buffer calls for listeners that briefly drop their connection.'
			},
			{
				key: 'reconnectionGracePeriod',
				label: 'Reconnection Grace Period',
				type: 'number',
				min: 5,
				max: 300,
				placeholder: '60',
				caption: 'Seconds a dropped listener can reconnect without losing buffered calls.',
				showIf: (v) => truthy(v, 'reconnectionEnabled')
			},
			{
				key: 'reconnectionMaxBufferSize',
				label: 'Reconnection Max Buffer Size',
				type: 'number',
				min: 10,
				max: 500,
				step: 10,
				placeholder: '100',
				caption: 'Maximum calls buffered for a reconnecting listener.',
				showIf: (v) => truthy(v, 'reconnectionEnabled')
			},
			{
				key: 'adminLocalhostOnly',
				label: 'Admin: Localhost Only',
				type: 'toggle',
				caption: 'Restrict the admin API to localhost plus the allowed IPs below.'
			},
			{
				key: 'adminAllowedIPs',
				label: 'Admin Allowed IPs',
				type: 'text',
				array: 'csv',
				placeholder: '10.0.0.5, 192.168.1.20',
				caption: 'Comma-separated IPs allowed to reach the admin API in addition to localhost.'
			},
			{
				key: 'adminPasswordLoginDisabled',
				label: 'Disable Admin Password Login',
				type: 'toggle',
				caption: 'Only allow admin sign-in through a system admin account. Requires at least one system admin user.'
			},
			{ key: 'configSyncEnabled', label: 'Config Sync to Filesystem', type: 'toggle', caption: 'Write the config to a JSON file on every change.' },
			{
				key: 'configSyncPath',
				label: 'Config Sync Path',
				type: 'text',
				placeholder: '/backups/config.json',
				showIf: (v) => truthy(v, 'configSyncEnabled')
			}
		]
	},
	{
		id: 'branding',
		label: 'Branding',
		fields: [
			{ key: 'branding', label: 'Branding Label', type: 'text', placeholder: 'Branding', caption: 'Name shown in the UI header and emails.' },
			{ key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://radio.example.com', caption: 'Public URL used for links in emails.' },
			{ key: 'email', label: 'Support Email', type: 'text', placeholder: 'support@example.com', caption: 'Contact address shown on the login page.' },
			{
				key: 'emailLogoBorderRadius',
				label: 'Logo Border Radius',
				type: 'text',
				placeholder: '0px',
				caption: 'CSS radius applied to the email logo (e.g. 8px, 50%).',
				showIf: (v) => !!v['emailLogoFilename']
			}
		]
	},
	{
		id: 'alerts',
		label: 'Alerts & Health',
		fields: [
			{
				key: 'alertRetentionDays',
				label: 'Alert Retention Days',
				type: 'number',
				min: 0,
				step: 1,
				placeholder: '30',
				caption: 'Days to keep alert history; 0 keeps it forever.'
			},
			{ key: 'systemHealthAlertsEnabled', label: 'System Health Alerts', type: 'toggle', caption: 'Master switch for health monitoring alerts.' },
			{
				key: 'transcriptionFailureAlertsEnabled',
				label: 'Transcription Failure Alerts',
				type: 'toggle',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'transcriptionFailureThreshold',
				label: 'Failure Threshold',
				type: 'number',
				min: 1,
				placeholder: '5',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'transcriptionFailureAlertsEnabled')
			},
			{
				key: 'transcriptionFailureTimeWindow',
				label: 'Failure Time Window',
				type: 'number',
				min: 1,
				max: 168,
				placeholder: '24',
				caption: 'Hours.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'transcriptionFailureAlertsEnabled')
			},
			{
				key: 'transcriptionFailureRepeatMinutes',
				label: 'Failure Repeat Interval',
				type: 'number',
				min: 15,
				step: 15,
				placeholder: '60',
				caption: 'Minutes between repeated alerts.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'transcriptionFailureAlertsEnabled')
			},
			{ key: 'toneDetectionAlertsEnabled', label: 'Tone Detection Alerts', type: 'toggle', showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') },
			{
				key: 'toneDetectionIssueThreshold',
				label: 'Tone Issue Threshold',
				type: 'number',
				min: 1,
				placeholder: '10',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'toneDetectionAlertsEnabled')
			},
			{
				key: 'toneDetectionTimeWindow',
				label: 'Tone Time Window',
				type: 'number',
				min: 1,
				max: 168,
				placeholder: '24',
				caption: 'Hours.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'toneDetectionAlertsEnabled')
			},
			{
				key: 'toneDetectionRepeatMinutes',
				label: 'Tone Repeat Interval',
				type: 'number',
				min: 15,
				step: 15,
				placeholder: '60',
				caption: 'Minutes between repeated alerts.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'toneDetectionAlertsEnabled')
			},
			{ key: 'noAudioAlertsEnabled', label: 'No Audio Alerts', type: 'toggle', showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') },
			{
				key: 'noAudioThresholdMinutes',
				label: 'No Audio Baseline Threshold',
				type: 'number',
				min: 5,
				step: 5,
				placeholder: '60',
				caption: 'Minutes of silence before alerting.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'noAudioAlertsEnabled')
			},
			{
				key: 'noAudioRepeatMinutes',
				label: 'No Audio Repeat Interval',
				type: 'number',
				min: 15,
				step: 15,
				placeholder: '120',
				caption: 'Minutes between repeated alerts.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'noAudioAlertsEnabled')
			},
			{
				key: 'noAudioMultiplier',
				label: 'No Audio Multiplier',
				type: 'number',
				min: 1,
				step: 0.5,
				placeholder: '3',
				caption: 'Alert when silence exceeds this multiple of the typical gap between calls.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'noAudioAlertsEnabled')
			},
			{
				key: 'noAudioTimeWindow',
				label: 'No Audio Time Window',
				type: 'number',
				min: 1,
				max: 168,
				placeholder: '24',
				caption: 'Hours of recent activity used to compute the typical call gap.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'noAudioAlertsEnabled')
			},
			{
				key: 'noAudioHistoricalDataDays',
				label: 'No Audio Historical Days',
				type: 'number',
				min: 1,
				placeholder: '7',
				caption: 'Days of call history considered for the baseline.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled') && truthy(v, 'noAudioAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.aToneMinDuration',
				label: 'A-Tone Min Duration',
				type: 'number',
				min: 0.1,
				step: 0.1,
				caption: 'Seconds.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.aToneMaxDuration',
				label: 'A-Tone Max Duration',
				type: 'number',
				min: 0.1,
				step: 0.1,
				caption: 'Seconds.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.bToneMinDuration',
				label: 'B-Tone Min Duration',
				type: 'number',
				min: 0.1,
				step: 0.1,
				caption: 'Seconds.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.bToneMaxDuration',
				label: 'B-Tone Max Duration',
				type: 'number',
				min: 0.1,
				step: 0.1,
				caption: 'Seconds.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.longToneMinDuration',
				label: 'Long Tone Min Duration',
				type: 'number',
				min: 1,
				step: 0.5,
				caption: 'Seconds.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.longToneMaxDuration',
				label: 'Long Tone Max Duration',
				type: 'number',
				min: 0,
				step: 0.5,
				caption: 'Seconds; 0 means no long tone.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.callsRequired',
				label: 'Auto-Learn Calls Required',
				type: 'number',
				min: 2,
				step: 1,
				caption: 'Matching calls needed before a tone set is learned.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			},
			{
				key: 'autoLearnToneSetConfig.frequencyToleranceHz',
				label: 'Frequency Tolerance',
				type: 'number',
				min: 1,
				step: 1,
				caption: 'Hz.',
				showIf: (v) => truthy(v, 'systemHealthAlertsEnabled')
			}
		]
	},
	{
		id: 'audio',
		label: 'Audio',
		fields: [
			{
				key: 'audioConversion',
				label: 'Audio Conversion',
				type: 'select',
				numeric: true,
				options: [
					{ value: '0', label: 'Disabled' },
					{ value: '1', label: 'Enabled, no normalization' },
					{ value: '2', label: 'Enabled with normalization' },
					{ value: '3', label: 'Enabled with loud normalization' }
				]
			},
			{
				key: 'disableDuplicateDetection',
				label: 'Disable Duplicate Detection',
				type: 'toggle',
				caption: 'Skip filtering of duplicate call uploads.'
			},
			{
				key: 'duplicateTimestampWindow',
				label: 'Duplicate Timestamp Window',
				type: 'number',
				min: 100,
				max: 30000,
				step: 100,
				placeholder: '800',
				caption: 'Milliseconds.',
				showIf: (v) => !truthy(v, 'disableDuplicateDetection')
			},
			{
				key: 'duplicateDetectionTimeFrame',
				label: 'Duplicate Cache Retention',
				type: 'number',
				min: 1000,
				step: 1000,
				placeholder: '30000',
				caption: 'Milliseconds.',
				showIf: (v) => !truthy(v, 'disableDuplicateDetection')
			},
			{
				key: 'audioEncryptionEnabled',
				label: 'Audio Encryption',
				type: 'toggle',
				caption: 'Requires a relay server API key.',
				showIf: (v) => !!v['relayServerAPIKey']
			},
			{
				key: 'maxDownloadsPerWindow',
				label: 'Max Downloads Per Window',
				type: 'number',
				min: 0,
				placeholder: '100',
				caption: 'Download rate limit; 0 disables rate limiting.'
			},
			{
				key: 'downloadWindowMinutes',
				label: 'Download Window',
				type: 'number',
				min: 1,
				max: 60,
				placeholder: '60',
				caption: 'Minutes.',
				showIf: (v) => Number(v['maxDownloadsPerWindow']) > 0
			}
		]
	},
	{
		id: 'email',
		label: 'Email',
		fields: [
			{
				key: 'emailServiceEnabled',
				label: 'Email Service',
				type: 'toggle',
				caption: 'Master switch for outgoing email (verification, alerts, resets).'
			},
			{
				key: 'emailProvider',
				label: 'Email Provider',
				type: 'select',
				options: [
					{ value: 'sendgrid', label: 'SendGrid' },
					{ value: 'mailgun', label: 'Mailgun' },
					{ value: 'smtp', label: 'SMTP' }
				],
				showIf: (v) => truthy(v, 'emailServiceEnabled')
			},
			{
				key: 'emailSendGridApiKey',
				label: 'SendGrid API Key',
				type: 'text',
				masked: true,
				placeholder: 'SG.xxxx',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'sendgrid'
			},
			{
				key: 'emailMailgunApiKey',
				label: 'Mailgun API Key',
				type: 'text',
				masked: true,
				placeholder: 'key-xxxx',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'mailgun'
			},
			{
				key: 'emailMailgunDomain',
				label: 'Mailgun Domain',
				type: 'text',
				placeholder: 'mg.example.com',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'mailgun'
			},
			{
				key: 'emailMailgunApiBase',
				label: 'Mailgun API Base',
				type: 'select',
				options: [
					{ value: 'https://api.mailgun.net', label: 'US (api.mailgun.net)' },
					{ value: 'https://api.eu.mailgun.net', label: 'EU (api.eu.mailgun.net)' }
				],
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'mailgun'
			},
			{
				key: 'emailSmtpHost',
				label: 'SMTP Host',
				type: 'text',
				placeholder: 'smtp.example.com',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpPort',
				label: 'SMTP Port',
				type: 'number',
				min: 1,
				max: 65535,
				placeholder: '587',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpUsername',
				label: 'SMTP Username',
				type: 'text',
				placeholder: 'user@example.com',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpPassword',
				label: 'SMTP Password',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpUseTLS',
				label: 'Use TLS/SSL',
				type: 'toggle',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpSkipVerify',
				label: 'Skip Certificate Verification',
				type: 'toggle',
				showIf: (v) => truthy(v, 'emailServiceEnabled') && v['emailProvider'] === 'smtp'
			},
			{
				key: 'emailSmtpFromEmail',
				label: 'From Email Address',
				type: 'text',
				placeholder: 'noreply@example.com',
				showIf: (v) => truthy(v, 'emailServiceEnabled')
			},
			{ key: 'emailSmtpFromName', label: 'From Name', type: 'text', placeholder: 'Thinline Radio', showIf: (v) => truthy(v, 'emailServiceEnabled') }
		]
	},
	{
		id: 'integrations',
		label: 'Integrations',
		description: 'Relay key request/recovery dialogs are not ported yet; paste a key directly or use the old admin.',
		fields: [
			{ key: 'openAIIntegration.baseUrl', label: 'OpenAI API Base URL', type: 'text', placeholder: 'https://api.openai.com' },
			{ key: 'openAIIntegration.apiKey', label: 'OpenAI API Key', type: 'text', masked: true, placeholder: 'sk-...' },
			{
				key: 'openAIIntegration.model',
				label: 'OpenAI Chat Model',
				type: 'select',
				options: [
					{ value: 'gpt-5.4-mini', label: 'GPT-5.4 mini (recommended)' },
					{ value: 'gpt-4o-mini', label: 'GPT-4o mini (lowest cost)' },
					{ value: 'gpt-4o', label: 'GPT-4o (highest quality)' }
				],
				caption: 'Used for tone/unit naming and diagnostics.'
			},
			{ key: 'radioReferenceEnabled', label: 'Radio Reference Integration', type: 'toggle' },
			{ key: 'radioReferenceUsername', label: 'Radio Reference Username', type: 'text', showIf: (v) => truthy(v, 'radioReferenceEnabled') },
			{
				key: 'radioReferencePassword',
				label: 'Radio Reference Password',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'radioReferenceEnabled')
			},
			{
				key: 'radioReferenceAPIKey',
				label: 'Radio Reference API Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'radioReferenceEnabled')
			},
			{ key: 'relayServerAPIKey', label: 'Relay Server API Key', type: 'text', masked: true, caption: 'Connects this server to the ThinLine relay.' },
			{
				key: 'relayServerURL',
				label: 'Relay Server URL',
				type: 'text',
				placeholder: 'https://relay.thinlineradio.com',
				caption: 'Leave the default unless directed otherwise.'
			},
			{
				key: 'centralManagementEnabled',
				label: 'Central Management',
				type: 'toggle',
				caption: 'Connect this server to a Central Management instance.'
			},
			{
				key: 'centralManagementURL',
				label: 'Central Management URL',
				type: 'text',
				placeholder: 'https://cm.example.com',
				showIf: (v) => truthy(v, 'centralManagementEnabled')
			},
			{
				key: 'centralManagementAPIKey',
				label: 'Central Management API Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'centralManagementEnabled')
			},
			{
				key: 'centralManagementServerName',
				label: 'Central Management Server Name',
				type: 'text',
				placeholder: 'My TLR Server',
				showIf: (v) => truthy(v, 'centralManagementEnabled')
			}
		]
	},
	{
		id: 'transcription',
		label: 'Transcription',
		fields: [
			{
				key: 'transcriptionConfig.enabled',
				label: 'Transcription',
				type: 'toggle',
				caption: 'Master switch for call transcription. Generates the text used by keyword alerts and the dashboard feed.'
			},
			{ key: 'transcriptionEnhancement', label: 'Audio Enhancement', type: 'toggle', caption: 'Pre-process audio before transcribing.' },
			{
				key: 'transcriptionConfig.provider',
				label: 'Provider',
				type: 'select',
				options: [
					{ value: 'whisper-api', label: 'Whisper API' },
					{ value: 'azure', label: 'Azure' },
					{ value: 'google', label: 'Google' },
					{ value: 'assemblyai', label: 'AssemblyAI' },
					{ value: 'cloudflare', label: 'Cloudflare' }
				],
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.whisperAPIURL',
				label: 'Whisper API URL',
				type: 'text',
				placeholder: 'http://localhost:8000',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'whisper-api'
			},
			{
				key: 'transcriptionConfig.whisperAPIKey',
				label: 'Whisper API Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'whisper-api'
			},
			{
				key: 'transcriptionConfig.whisperAPIModel',
				label: 'Whisper Model',
				type: 'text',
				placeholder: 'whisper-1',
				suggestions: [
					{ value: 'whisper-1', label: 'original Whisper, works local and cloud' },
					{ value: 'gpt-4o-transcribe', label: 'OpenAI cloud only' },
					{ value: 'gpt-4o-mini-transcribe', label: 'OpenAI cloud only, cheaper' },
					{ value: 'whisper-large-v3', label: '' },
					{ value: 'whisper-large-v3-turbo', label: 'faster' },
					{ value: 'distil-whisper-large-v3-en', label: 'English only, fastest' }
				],
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'whisper-api'
			},
			{
				key: 'transcriptionConfig.azureKey',
				label: 'Azure Subscription Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'azure'
			},
			{
				key: 'transcriptionConfig.azureRegion',
				label: 'Azure Region',
				type: 'text',
				placeholder: 'eastus',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'azure'
			},
			{
				key: 'transcriptionConfig.googleAPIKey',
				label: 'Google API Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'google'
			},
			{
				key: 'transcriptionConfig.googleCredentials',
				label: 'Google Credentials JSON',
				type: 'textarea',
				rows: 4,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'google'
			},
			{
				key: 'transcriptionConfig.assemblyAIKey',
				label: 'AssemblyAI API Key',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'assemblyai'
			},
			{
				key: 'transcriptionConfig.assemblyAISpeechModel',
				label: 'AssemblyAI Speech Model',
				type: 'select',
				options: [
					{ value: 'universal-2', label: 'Universal 2' },
					{ value: 'universal-3-pro', label: 'Universal 3 Pro' }
				],
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'assemblyai'
			},
			{
				key: 'transcriptionConfig.assemblyAIWordBoost',
				label: 'AssemblyAI Keyterms',
				type: 'text',
				array: 'csv',
				placeholder: 'ENGINE, LADDER, MEDIC',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'assemblyai'
			},
			{
				key: 'transcriptionConfig.cloudflareAccountID',
				label: 'Cloudflare Account ID',
				type: 'text',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'cloudflare'
			},
			{
				key: 'transcriptionConfig.cloudflareAPIToken',
				label: 'Cloudflare API Token',
				type: 'text',
				masked: true,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'cloudflare'
			},
			{
				key: 'transcriptionConfig.cloudflareModel',
				label: 'Cloudflare Model',
				type: 'text',
				placeholder: '@cf/openai/whisper-large-v3-turbo',
				suggestions: [
					{ value: '@cf/openai/whisper-large-v3-turbo', label: 'faster, recommended' },
					{ value: '@cf/openai/whisper-large-v3', label: 'higher accuracy' },
					{ value: '@cf/openai/whisper', label: 'original Whisper' }
				],
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'cloudflare'
			},
			{
				key: 'transcriptionConfig.language',
				label: 'Language',
				type: 'text',
				placeholder: 'en',
				caption: 'Use "auto" for automatic detection.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.prompt',
				label: 'Custom Prompt',
				type: 'textarea',
				rows: 4,
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'whisper-api'
			},
			{
				key: 'transcriptionConfig.timeoutSeconds',
				label: 'Transcription Timeout',
				type: 'number',
				min: 0,
				max: 600,
				placeholder: '300',
				caption: 'Seconds; 0 uses the default.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.provider'] === 'whisper-api'
			},
			{
				key: 'transcriptionConfig.minCallDuration',
				label: 'Minimum Call Duration',
				type: 'number',
				min: 0,
				step: 0.1,
				placeholder: '0',
				caption: 'Seconds; shorter calls are skipped.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.workerPoolSize',
				label: 'Worker Pool Size',
				type: 'number',
				min: 1,
				max: 16,
				placeholder: '1',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.hallucinationPatterns',
				label: 'Hallucination Removal Patterns',
				type: 'textarea',
				rows: 4,
				array: 'lines',
				caption: 'One pattern per line.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.hallucinationDetectionMode',
				label: 'Automatic Hallucination Detection',
				type: 'select',
				options: [
					{ value: 'off', label: 'Off' },
					{ value: 'learning', label: 'Learning' },
					{ value: 'auto-remove', label: 'Auto-remove' }
				],
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			},
			{
				key: 'transcriptionConfig.hallucinationConfidenceThreshold',
				label: 'Hallucination Confidence Threshold',
				type: 'number',
				min: 0,
				max: 1,
				step: 0.05,
				placeholder: '0.90',
				caption: 'Minimum confidence for auto-removal. 0.85-0.95 is a good default.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.hallucinationDetectionMode'] !== 'off'
			},
			{
				key: 'transcriptionConfig.hallucinationMinOccurrences',
				label: 'Hallucination Min Occurrences',
				type: 'number',
				min: 1,
				placeholder: '5',
				caption: 'Times a phrase must be flagged before it counts as a hallucination.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled') && v['transcriptionConfig.hallucinationDetectionMode'] !== 'off'
			},
			{
				key: 'nominatimUrl',
				label: 'Nominatim Geocoding URL',
				type: 'text',
				placeholder: 'http://localhost:8088',
				caption: 'Used to geocode addresses heard in transcripts.',
				showIf: (v) => truthy(v, 'transcriptionConfig.enabled')
			}
		]
	},
	{
		id: 'registration',
		label: 'User Registration',
		fields: [
			{ key: 'userRegistrationEnabled', label: 'User Registration', type: 'toggle', caption: 'Master switch for account signup.' },
			{ key: 'publicRegistrationEnabled', label: 'Public Registration', type: 'toggle', showIf: (v) => truthy(v, 'userRegistrationEnabled') },
			{
				key: 'publicRegistrationMode',
				label: 'Public Registration Mode',
				type: 'select',
				options: [
					{ value: 'codes', label: 'Access codes' },
					{ value: 'email', label: 'Email verification' },
					{ value: 'both', label: 'Codes and email' }
				],
				showIf: (v) => truthy(v, 'userRegistrationEnabled') && truthy(v, 'publicRegistrationEnabled')
			},
			{ key: 'emailVerificationRequired', label: 'Email Verification Required', type: 'toggle', showIf: (v) => truthy(v, 'userRegistrationEnabled') },
			{ key: 'turnstileEnabled', label: 'Cloudflare Turnstile', type: 'toggle', caption: 'Bot protection on signup and login.' },
			{ key: 'turnstileSiteKey', label: 'Turnstile Site Key', type: 'text', placeholder: '0x4xxxx', showIf: (v) => truthy(v, 'turnstileEnabled') },
			{
				key: 'turnstileSecretKey',
				label: 'Turnstile Secret Key',
				type: 'text',
				masked: true,
				placeholder: '0x4xxxx',
				showIf: (v) => truthy(v, 'turnstileEnabled')
			}
		]
	}
];

//* Reads a dot-path value from the Options object.
export function getOptionValue(options: AdminOptions, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], options);
}

//* Converts a stored option value to its editable draft representation.
export function toDraftValue(field: OptionFieldSpec, value: unknown): unknown {
	if (field.array === 'lines') return Array.isArray(value) ? value.join('\n') : '';
	if (field.array === 'csv') return Array.isArray(value) ? value.join(', ') : '';
	if (field.type === 'select') return value === undefined || value === null ? '' : String(value);
	if (field.type === 'toggle') return value === true;
	return value ?? '';
}

//* Converts a draft value back to the wire value for PATCH.
export function toWireValue(field: OptionFieldSpec, value: unknown): unknown {
	if (field.array === 'lines') {
		return String(value ?? '')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}
	if (field.array === 'csv') {
		return String(value ?? '')
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0);
	}
	if (field.type === 'number') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (field.type === 'select' && field.numeric) return Number(value);
	return value;
}

//* Builds a nested patch object from dot-path keys ({a.b: 1} -> {a: {b: 1}}).
export function buildPatch(entries: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [path, value] of Object.entries(entries)) {
		const parts = path.split('.');
		let target = patch;
		for (const part of parts.slice(0, -1)) {
			target[part] = target[part] ?? {};
			target = target[part] as Record<string, unknown>;
		}
		target[parts[parts.length - 1]] = value;
	}
	return patch;
}
