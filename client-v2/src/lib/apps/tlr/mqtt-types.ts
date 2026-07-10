// ──────────────────────────────────────────────────────────────
// Shared sub-shapes
// ──────────────────────────────────────────────────────────────

export interface SystemRate {
	sys_num: number;
	sys_name: string;
	decoderate: number;
	decoderate_interval: number;
	control_channel: number;
}

export interface MqttSource {
	source_num: number;
	rate: number;
	center: number;
	min_hz: number;
	max_hz: number;
	error: number;
	driver: string;
	device: string;
	antenna: string;
	gain: number;
	analog_recorders: number;
	digital_recorders: number;
	debug_recorders: number;
	sigmf_recorders: number;
	silence_frames: number;
}

export interface MqttConfigSystem {
	sys_num: number;
	sys_name: string;
	system_type: string;
	talkgroups_file: string;
	qpsk: boolean;
	squelch_db: number;
	analog_levels: number;
	digital_levels: number;
	audio_archive: boolean;
	upload_script: string;
	record_unknown: boolean;
	call_log: boolean;
	channels?: number[];
	control_channel?: number;
}

export interface MqttConfig {
	sources: MqttSource[];
	systems: MqttConfigSystem[];
	capture_dir: string;
	upload_server: string;
	call_timeout: number;
	log_file: boolean;
	instance_id: string;
	instance_key: string;
}

export interface SystemInfo {
	sys_num: number;
	sys_name: string;
	type: string;
	sysid: string;
	wacn: string;
	nac: string;
	rfss: number;
	site_id: number;
}

export interface ActiveCall {
	id: string;
	call_num: number;
	freq: number;
	sys_num: number;
	sys_name: string;
	talkgroup: number;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	talkgroup_group: string;
	talkgroup_tag: string;
	unit: number;
	unit_alpha_tag: string;
	elapsed: number;
	length: number;
	call_state: number;
	call_state_type: string;
	mon_state: number;
	mon_state_type: string;
	phase2: boolean;
	analog: boolean;
	rec_num: number;
	src_num: number;
	rec_state: number;
	rec_state_type: string;
	conventional: boolean;
	encrypted: boolean;
	emergency: boolean;
	stop_time: number;
	start_time: number;
}

export interface Recorder {
	id: string;
	src_num: number;
	rec_num: number;
	type: string;
	duration: number;
	freq: number;
	count: number;
	rec_state: number;
	rec_state_type: string;
	squelched: boolean;
}

export interface CallData {
	id: string;
	call_num: number;
	sys_num: number;
	sys_name: string;
	freq: number;
	unit: number;
	unit_alpha_tag: string;
	talkgroup: number;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	talkgroup_group: string;
	talkgroup_tag: string;
	talkgroup_patches: string;
	elapsed: number;
	length: number;
	call_state: number;
	call_state_type: string;
	mon_state: number;
	mon_state_type: string;
	audio_type: string;
	phase2_tdma: boolean;
	tdma_slot: number;
	analog: boolean;
	rec_num: number;
	src_num: number;
	rec_state: number;
	rec_state_type: string;
	conventional: boolean;
	encrypted: boolean;
	emergency: boolean;
	start_time: number;
	stop_time: number;
}

export interface CallEndData extends CallData {
	process_call_time: number;
	error_count: number;
	spike_count: number;
	retry_attempt: number;
	freq_error: number;
	signal: number;
	noise: number;
	call_filename: string;
}

export interface UnitCallData {
	sys_num: number;
	sys_name: string;
	unit: number;
	unit_alpha_tag: string;
	talkgroup: number;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	talkgroup_group: string;
	talkgroup_tag: string;
	talkgroup_patches: string;
	call_num: number;
	start_time: number;
	freq: number;
	encrypted: boolean;
}

export interface UnitEndData {
	sys_num: number;
	sys_name: string;
	unit: number;
	unit_alpha_tag: string;
	talkgroup: number;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	talkgroup_group: string;
	talkgroup_tag: string;
	talkgroup_patches: string;
	call_num: number;
	freq: number;
	position: number;
	length: number;
	emergency: boolean;
	encrypted: boolean;
	start_time: number;
	stop_time: number;
	error_count: number;
	spike_count: number;
	sample_count: number;
	transmission_filename: string;
}

export interface UnitSimpleData {
	sys_num: number;
	sys_name: string;
	unit: number;
	unit_alpha_tag: string;
}

export interface UnitGroupData extends UnitSimpleData {
	talkgroup: number;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	talkgroup_group: string;
	talkgroup_tag: string;
	talkgroup_patches: string;
}

export interface TrunkingMessageData {
	sys_num: number;
	sys_name: string;
	trunk_msg: number;
	trunk_msg_type: string;
	opcode: string;
	opcode_type: string;
	opcode_desc: string;
	meta: string;
}

export interface ConsoleData {
	time: string;
	severity: string;
	log_msg: string;
}

// ──────────────────────────────────────────────────────────────
// Top-level message shapes (what arrives over MQTT)
// ──────────────────────────────────────────────────────────────

export interface RatesMessage {
	type: 'rates';
	rates: SystemRate[];
	timestamp: number;
	instance_id: string;
}

export interface ConfigMessage {
	type: 'config';
	config: MqttConfig;
	timestamp: number;
	instance_id: string;
}

export interface SystemsMessage {
	type: 'systems';
	systems: SystemInfo[];
	timestamp: number;
	instance_id: string;
}

export interface SystemMessage {
	type: 'system';
	system: SystemInfo;
	timestamp: number;
	instance_id: string;
}

export interface CallsActiveMessage {
	type: 'calls_active';
	calls: ActiveCall[];
	timestamp: number;
	instance_id: string;
}

export interface RecordersMessage {
	type: 'recorders';
	recorders: Recorder[];
	timestamp: number;
	instance_id: string;
}

export interface RecorderMessage {
	type: 'recorder';
	recorder: Recorder;
	timestamp: number;
	instance_id: string;
}

export interface CallStartMessage {
	type: 'call_start';
	call: CallData;
	timestamp: number;
	instance_id: string;
}

export interface CallEndMessage {
	type: 'call_end';
	call: CallEndData;
	timestamp: number;
	instance_id: string;
}

export interface AudioMessage {
	type: 'audio';
	call: {
		audio_wav_base64?: string;
		audio_m4a_base64?: string;
		metadata: Record<string, unknown>;
	};
	timestamp: number;
	instance_id: string;
}

export interface PluginStatusMessage {
	client_id: string;
	instance_id: string;
	status: string;
}

export interface UnitCallMessage {
	type: 'call';
	call: UnitCallData;
	timestamp: string | number;
	instance_id: string;
}

export interface UnitEndMessage {
	type: 'end';
	end: UnitEndData;
	timestamp: number;
	instance_id: string;
}

export interface UnitOnMessage {
	type: 'on';
	on: UnitSimpleData;
	timestamp: number;
	instance_id: string;
}

export interface UnitOffMessage {
	type: 'off';
	off: UnitSimpleData;
	timestamp: number;
	instance_id: string;
}

export interface UnitAckRespMessage {
	type: 'ackresp';
	ackresp: UnitSimpleData;
	timestamp: number;
	instance_id: string;
}

export interface UnitJoinMessage {
	type: 'join';
	join: UnitGroupData;
	timestamp: number;
	instance_id: string;
}

export interface UnitDataMessage {
	type: 'data';
	data: UnitSimpleData;
	timestamp: number;
	instance_id: string;
}

export interface UnitAnsReqMessage {
	type: 'ans_req';
	ans_req: UnitGroupData;
	timestamp: number;
	instance_id: string;
}

export interface UnitLocationMessage {
	type: 'location';
	location: UnitGroupData;
	timestamp: number;
	instance_id: string;
}

export interface TrunkingMessage {
	type: 'message';
	message: TrunkingMessageData;
	timestamp: number;
	instance_id: string;
}

export interface ConsoleMessage {
	type: 'console';
	console: ConsoleData;
	timestamp: number;
	instance_id: string;
}

// ──────────────────────────────────────────────────────────────
// Parsed event union — all messages enriched with raw topic
// ──────────────────────────────────────────────────────────────

export type MqttParsedEvent =
	| ({ topic: string } & RatesMessage)
	| ({ topic: string } & ConfigMessage)
	| ({ topic: string } & SystemsMessage)
	| ({ topic: string } & SystemMessage)
	| ({ topic: string } & CallsActiveMessage)
	| ({ topic: string } & RecordersMessage)
	| ({ topic: string } & RecorderMessage)
	| ({ topic: string } & CallStartMessage)
	| ({ topic: string } & CallEndMessage)
	| ({ topic: string } & AudioMessage)
	| ({ topic: string } & UnitCallMessage)
	| ({ topic: string } & UnitEndMessage)
	| ({ topic: string } & UnitOnMessage)
	| ({ topic: string } & UnitOffMessage)
	| ({ topic: string } & UnitAckRespMessage)
	| ({ topic: string } & UnitJoinMessage)
	| ({ topic: string } & UnitDataMessage)
	| ({ topic: string } & UnitAnsReqMessage)
	| ({ topic: string } & UnitLocationMessage)
	| ({ topic: string } & TrunkingMessage)
	| ({ topic: string } & ConsoleMessage);

export type MqttConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Unit event types for the feed panel
export type UnitEventType = 'call' | 'end' | 'on' | 'off' | 'ackresp' | 'join' | 'data' | 'ans_req' | 'location';

export interface UnitEventEntry {
	id: string; // unique key for #each
	eventType: UnitEventType;
	unit: number;
	unit_alpha_tag: string;
	sys_name: string;
	talkgroup?: number;
	talkgroup_alpha_tag?: string;
	timestamp: number;
}

export interface CallEventEntry {
	id: string;
	kind: 'start' | 'end';
	call_num: number;
	sys_name: string;
	talkgroup_alpha_tag: string;
	talkgroup_description: string;
	freq: number;
	emergency: boolean;
	encrypted: boolean;
	timestamp: number;
}

export interface SystemCallQuality {
	sys_name: string;
	sys_num: number;
	callCount: number;
	// Running averages
	avgLength: number;
	avgErrors: number;
	avgSpikes: number;
	avgFreqError: number;
	// Signal/noise use separate sample counts since 999 = unknown
	avgSignal: number | null;
	signalCount: number;
	avgNoise: number | null;
	noiseCount: number;
	// Derived counts
	callsWithErrors: number;
	callsWithSpikes: number;
}
