import {
	PUBLIC_MQTT_SERVER,
	PUBLIC_MQTT_WS_PORT,
	PUBLIC_MQTT_SECURE,
	PUBLIC_MQTT_USERNAME,
	PUBLIC_MQTT_PASSWORD,
	PUBLIC_TOPIC,
	PUBLIC_UNIT_TOPIC
} from '$lib/tlr-config.ts';
import { MqttClient } from '$lib/apps/tlr/mqtt-client.ts';
import { formatAbsoluteTime, formatDuration } from '$lib/apps/tlr/format.ts';
import type {
	ActiveCall,
	CallEndMessage,
	CallEventEntry,
	CallStartMessage,
	ConsoleMessage,
	MqttConnectionState,
	MqttParsedEvent,
	Recorder,
	SystemCallQuality,
	SystemInfo,
	SystemRate,
	TrunkingMessage,
	UnitEventEntry,
	UnitEventType
} from '$lib/apps/tlr/mqtt-types.ts';

const MAX_FEED = 150;

/** Number of decode-rate samples to keep per system for the rolling average. */
const DECODE_RATE_WINDOW = 5;

let _seq = 0;
function nextId(): string {
	return String(++_seq);
}

function pushCapped<T>(arr: T[], item: T, max = MAX_FEED): T[] {
	const next = [item, ...arr];
	return next.length > max ? next.slice(0, max) : next;
}

// Insert into a descending-timestamp-sorted array, maintaining order
function insertSortedDesc<T extends { timestamp: number }>(arr: T[], item: T, max = MAX_FEED): T[] {
	const idx = arr.findIndex((a) => a.timestamp <= item.timestamp);
	const next = idx === -1 ? [...arr, item] : [...arr.slice(0, idx), item, ...arr.slice(idx)];
	return next.length > max ? next.slice(0, max) : next;
}

export class MqttDashboardState {
	connection = $state<MqttConnectionState>('disconnected');
	errorMessage = $state<string | null>(null);

	// Latest snapshots
	activeCalls = $state.raw<ActiveCall[]>([]);
	recorders = $state.raw<Recorder[]>([]);
	systems = $state.raw<SystemInfo[]>([]);
	rates = $state.raw<SystemRate[]>([]);

	// Rolling feeds (newest first)
	callStartEvents = $state.raw<CallStartMessage[]>([]);
	callEndEvents = $state.raw<CallEndMessage[]>([]);
	callFeed = $state.raw<CallEventEntry[]>([]);
	unitEvents = $state.raw<UnitEventEntry[]>([]);
	consoleMessages = $state.raw<ConsoleMessage[]>([]);
	trunkingMessages = $state.raw<TrunkingMessage[]>([]);

	// Derived
	activeCallCount = $derived(this.activeCalls.length);
	emergencyCallCount = $derived(this.activeCalls.filter((c) => c.emergency).length);
	recorderBreakdown = $derived(
		this.recorders.reduce<Record<string, number>>((acc, r) => {
			acc[r.rec_state_type] = (acc[r.rec_state_type] ?? 0) + 1;
			return acc;
		}, {})
	);
	totalMessageCount = $state(0);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	callQuality = $state.raw<Map<string, SystemCallQuality>>(new Map());

	// Recording state
	recordingStartTime = $state<number | null>(null);
	recordingElapsed = $state(0); // seconds
	isRecording = $derived(this.recordingStartTime !== null);
	showStatsDialog = $state(false);
	statsReport = $state('');

	private client: MqttClient;
	private unsubscribeMessages: (() => void) | null = null;
	private unsubscribeConnection: (() => void) | null = null;
	private started = false;
	private recordingInterval: ReturnType<typeof setInterval> | null = null;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private decodeRateSamples = new Map<string, number[]>();

	constructor() {
		this.client = new MqttClient({
			server: PUBLIC_MQTT_SERVER,
			port: PUBLIC_MQTT_WS_PORT || undefined,
			username: PUBLIC_MQTT_USERNAME,
			password: PUBLIC_MQTT_PASSWORD,
			topic: PUBLIC_TOPIC,
			unitTopic: PUBLIC_UNIT_TOPIC,
			secure: PUBLIC_MQTT_SECURE === 'true'
		});
	}

	start() {
		if (this.started) return;
		this.started = true;

		this.unsubscribeConnection = this.client.onConnectionChange((state, error) => {
			this.connection = state;
			this.errorMessage = error ?? null;
		});

		this.unsubscribeMessages = this.client.subscribe((event) => this.handleEvent(event));
		this.client.connect();
	}

	startRecording() {
		if (this.recordingInterval) clearInterval(this.recordingInterval);
		this.resetAccumulatedState();
		this.recordingStartTime = Date.now();
		this.recordingElapsed = 0;
		this.showStatsDialog = false;
		this.recordingInterval = setInterval(() => {
			this.recordingElapsed++;
		}, 1000);
	}

	stopRecording() {
		if (!this.recordingStartTime) return;
		if (this.recordingInterval) {
			clearInterval(this.recordingInterval);
			this.recordingInterval = null;
		}
		const startTime = this.recordingStartTime;
		const duration = this.recordingElapsed;
		this.statsReport = this.generateStatsReport(startTime, duration);
		this.recordingStartTime = null;
		this.showStatsDialog = true;
	}

	private resetAccumulatedState() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.callQuality = new Map();
		this.callFeed = [];
		this.callStartEvents = [];
		this.callEndEvents = [];
		this.unitEvents = [];
		this.consoleMessages = [];
		this.trunkingMessages = [];
		this.totalMessageCount = 0;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		this.decodeRateSamples = new Map();
		// activeCalls, recorders, systems, rates are live snapshots — leave them
	}

	private generateStatsReport(startTime: number, duration: number): string {
		const lines: string[] = [];
		const endTime = Date.now();

		const totalCalls = Array.from(this.callQuality.values()).reduce((sum, q) => sum + q.callCount, 0);
		const systemCount = this.callQuality.size;

		lines.push('=== Recording Summary ===');
		lines.push(`Duration:  ${formatDuration(duration)}`);
		lines.push(`Period:    ${formatAbsoluteTime(startTime)} – ${formatAbsoluteTime(endTime)}`);
		lines.push(`Systems:   ${systemCount}  |  Total Calls: ${totalCalls}`);

		for (const [sysName, q] of this.callQuality) {
			lines.push('');
			lines.push(`--- ${sysName} ---`);
			lines.push(`Calls:          ${q.callCount}`);
			lines.push(`Avg Length:      ${q.avgLength.toFixed(1)} s`);

			const samples = this.decodeRateSamples.get(sysName);
			if (samples && samples.length > 0) {
				const avgRate = samples.reduce((a, b) => a + b, 0) / samples.length;
				lines.push(`Decode Rate:    ${avgRate.toFixed(1)} msg/s (avg of last ${samples.length} sample${samples.length !== 1 ? 's' : ''})`);
			}

			const errorRate = q.callCount > 0 ? (q.callsWithErrors / q.callCount) * 100 : 0;
			lines.push(`Error Rate:      ${errorRate.toFixed(1)}%  (avg ${q.avgErrors.toFixed(2)} errors/call)`);

			const spikeRate = q.callCount > 0 ? (q.callsWithSpikes / q.callCount) * 100 : 0;
			lines.push(`Spike Rate:      ${spikeRate.toFixed(1)}%  (avg ${q.avgSpikes.toFixed(2)} spikes/call)`);

			lines.push(`Avg Freq Error: ${q.avgFreqError.toFixed(0)} Hz`);

			if (q.avgSignal !== null) {
				lines.push(`Avg Signal:    ${q.avgSignal.toFixed(1)} dBm  (n=${q.signalCount})`);
			}
			if (q.avgNoise !== null) {
				lines.push(`Avg Noise:    ${q.avgNoise.toFixed(1)} dBm  (n=${q.noiseCount})`);
			}
		}
		lines.push('=========================');

		return lines.join('\n');
	}

	private updateCallQuality(event: CallEndMessage) {
		const c = event.call;
		const key = c.sys_name;
		const existing = this.callQuality.get(key);
		const n = (existing?.callCount ?? 0) + 1;

		function runAvg(prev: number, val: number): number {
			return (prev * (n - 1) + val) / n;
		}

		const UNKNOWN_SIGNAL = 999;

		let avgSignal = existing?.avgSignal ?? null;
		let signalCount = existing?.signalCount ?? 0;
		if (c.signal !== UNKNOWN_SIGNAL) {
			signalCount++;
			avgSignal = avgSignal === null ? c.signal : (avgSignal * (signalCount - 1) + c.signal) / signalCount;
		}

		let avgNoise = existing?.avgNoise ?? null;
		let noiseCount = existing?.noiseCount ?? 0;
		if (c.noise !== UNKNOWN_SIGNAL) {
			noiseCount++;
			avgNoise = avgNoise === null ? c.noise : (avgNoise * (noiseCount - 1) + c.noise) / noiseCount;
		}

		const updated: SystemCallQuality = {
			sys_name: c.sys_name,
			sys_num: c.sys_num,
			callCount: n,
			avgLength: runAvg(existing?.avgLength ?? 0, c.length),
			avgErrors: runAvg(existing?.avgErrors ?? 0, c.error_count),
			avgSpikes: runAvg(existing?.avgSpikes ?? 0, c.spike_count),
			avgFreqError: runAvg(existing?.avgFreqError ?? 0, c.freq_error),
			avgSignal,
			signalCount,
			avgNoise,
			noiseCount,
			callsWithErrors: (existing?.callsWithErrors ?? 0) + (c.error_count > 0 ? 1 : 0),
			callsWithSpikes: (existing?.callsWithSpikes ?? 0) + (c.spike_count > 0 ? 1 : 0)
		};

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new Map(this.callQuality);
		next.set(key, updated);
		this.callQuality = next;
	}

	destroy() {
		this.started = false;
		this.unsubscribeMessages?.();
		this.unsubscribeConnection?.();
		this.client.disconnect();
		if (this.recordingInterval) clearInterval(this.recordingInterval);
	}

	private handleEvent(event: MqttParsedEvent) {
		this.totalMessageCount++;

		switch (event.type) {
			case 'rates':
				this.rates = event.rates;
				for (const r of event.rates) {
					const existing = this.decodeRateSamples.get(r.sys_name) ?? [];
					const next = [...existing, r.decoderate];
					this.decodeRateSamples.set(r.sys_name, next.length > DECODE_RATE_WINDOW ? next.slice(-DECODE_RATE_WINDOW) : next);
				}
				break;

			case 'systems':
				this.systems = event.systems;
				break;

			case 'system': {
				const idx = this.systems.findIndex((s) => s.sys_num === event.system.sys_num);
				if (idx >= 0) {
					const updated = [...this.systems];
					updated[idx] = event.system;
					this.systems = updated;
				} else {
					this.systems = [...this.systems, event.system];
				}
				break;
			}

			case 'calls_active': {
				if (!event.calls) break;

				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const seen = new Set<string>();
				this.activeCalls = event.calls.toReversed().filter((c) => {
					if (seen.has(c.id)) return false;
					seen.add(c.id);
					return true;
				});
				break;
			}

			case 'recorders':
				this.recorders = event.recorders;
				break;

			case 'recorder': {
				const idx = this.recorders.findIndex((r) => r.id === event.recorder.id);
				if (idx >= 0) {
					const updated = [...this.recorders];
					updated[idx] = event.recorder;
					this.recorders = updated;
				} else {
					this.recorders = [...this.recorders, event.recorder];
				}
				break;
			}

			case 'call_start': {
				if (event.call.rec_num == -1) break;
				this.callStartEvents = pushCapped(this.callStartEvents, event);
				this.callFeed = insertSortedDesc(this.callFeed, {
					id: nextId(),
					kind: 'start',
					call_num: event.call.call_num,
					sys_name: event.call.sys_name,
					talkgroup_alpha_tag: event.call.talkgroup_alpha_tag,
					talkgroup_description: event.call.talkgroup_description,
					freq: event.call.freq,
					emergency: event.call.emergency,
					encrypted: event.call.encrypted,
					timestamp: event.timestamp * 1000
				});
				break;
			}

			case 'call_end': {
				this.callEndEvents = pushCapped(this.callEndEvents, event);
				this.callFeed = insertSortedDesc(this.callFeed, {
					id: nextId(),
					kind: 'end',
					call_num: event.call.call_num,
					sys_name: event.call.sys_name,
					talkgroup_alpha_tag: event.call.talkgroup_alpha_tag,
					talkgroup_description: event.call.talkgroup_description,
					freq: event.call.freq,
					emergency: event.call.emergency,
					encrypted: event.call.encrypted,
					timestamp: event.timestamp * 1000
				});
				this.updateCallQuality(event);
				break;
			}

			case 'call':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'call' as UnitEventType,
					unit: event.call.unit,
					unit_alpha_tag: event.call.unit_alpha_tag,
					sys_name: event.call.sys_name,
					talkgroup: event.call.talkgroup,
					talkgroup_alpha_tag: event.call.talkgroup_alpha_tag,
					timestamp: Number(event.timestamp) * 1000
				});
				break;

			case 'end':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'end' as UnitEventType,
					unit: event.end.unit,
					unit_alpha_tag: event.end.unit_alpha_tag,
					sys_name: event.end.sys_name,
					talkgroup: event.end.talkgroup,
					talkgroup_alpha_tag: event.end.talkgroup_alpha_tag,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'on':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'on' as UnitEventType,
					unit: event.on.unit,
					unit_alpha_tag: event.on.unit_alpha_tag,
					sys_name: event.on.sys_name,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'off':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'off' as UnitEventType,
					unit: event.off.unit,
					unit_alpha_tag: event.off.unit_alpha_tag,
					sys_name: event.off.sys_name,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'ackresp':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'ackresp' as UnitEventType,
					unit: event.ackresp.unit,
					unit_alpha_tag: event.ackresp.unit_alpha_tag,
					sys_name: event.ackresp.sys_name,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'join':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'join' as UnitEventType,
					unit: event.join.unit,
					unit_alpha_tag: event.join.unit_alpha_tag,
					sys_name: event.join.sys_name,
					talkgroup: event.join.talkgroup,
					talkgroup_alpha_tag: event.join.talkgroup_alpha_tag,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'data':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'data' as UnitEventType,
					unit: event.data.unit,
					unit_alpha_tag: event.data.unit_alpha_tag,
					sys_name: event.data.sys_name,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'ans_req':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'ans_req' as UnitEventType,
					unit: event.ans_req.unit,
					unit_alpha_tag: event.ans_req.unit_alpha_tag,
					sys_name: event.ans_req.sys_name,
					talkgroup: event.ans_req.talkgroup,
					talkgroup_alpha_tag: event.ans_req.talkgroup_alpha_tag,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'location':
				this.unitEvents = insertSortedDesc(this.unitEvents, {
					id: nextId(),
					eventType: 'location' as UnitEventType,
					unit: event.location.unit,
					unit_alpha_tag: event.location.unit_alpha_tag,
					sys_name: event.location.sys_name,
					talkgroup: event.location.talkgroup,
					talkgroup_alpha_tag: event.location.talkgroup_alpha_tag,
					timestamp: event.timestamp * 1000
				});
				break;

			case 'message':
				this.trunkingMessages = pushCapped(this.trunkingMessages, event);
				break;

			case 'console':
				this.consoleMessages = pushCapped(this.consoleMessages, event, 500);
				break;
		}
	}
}
