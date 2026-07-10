import mqtt, { type MqttClient as MqttJsClient } from 'mqtt';
import type { MqttConnectionState, MqttParsedEvent } from './mqtt-types.ts';

export interface MqttClientOptions {
	server: string;
	port?: string | number;
	username: string;
	password: string;
	topic: string;
	unitTopic: string;
	secure?: boolean;
}

type MqttListener = (event: MqttParsedEvent) => void;
type ConnectionListener = (state: MqttConnectionState, error?: string) => void;

export class MqttClient {
	private client: MqttJsClient | null = null;
	private listeners = new Set<MqttListener>();
	private connectionListeners = new Set<ConnectionListener>();
	private options: MqttClientOptions;
	private _connectionState: MqttConnectionState = 'disconnected';

	constructor(options: MqttClientOptions) {
		this.options = options;
	}

	get connectionState(): MqttConnectionState {
		return this._connectionState;
	}

	connect() {
		if (typeof window === 'undefined') return;
		if (this.client) return;

		const { server, port, username, password, topic, unitTopic, secure } = this.options;
		const scheme = secure ? 'wss' : 'ws';
		const url = port ? `${scheme}://${server}:${port}/mqtt` : `${scheme}://${server}/mqtt`;

		this.setConnectionState('connecting');

		this.client = mqtt.connect(url, {
			username,
			password,
			reconnectPeriod: 5000,
			connectTimeout: 10_000
		});

		this.client.on('connect', () => {
			this.setConnectionState('connected');
			this.client!.subscribe(`${topic}/#`);
			this.client!.subscribe(`${unitTopic}/#`);
		});

		this.client.on('message', (topic, payload) => {
			this.handleMessage(topic, payload);
		});

		this.client.on('error', (err) => {
			this.setConnectionState('error', err.message);
		});

		this.client.on('close', () => {
			if (this._connectionState !== 'error') {
				this.setConnectionState('disconnected');
			}
		});

		this.client.on('reconnect', () => {
			this.setConnectionState('connecting');
		});
	}

	disconnect() {
		if (this.client) {
			this.client.end(true);
			this.client = null;
		}
		this.setConnectionState('disconnected');
	}

	subscribe(listener: MqttListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onConnectionChange(listener: ConnectionListener): () => void {
		this.connectionListeners.add(listener);
		listener(this._connectionState);
		return () => this.connectionListeners.delete(listener);
	}

	private setConnectionState(state: MqttConnectionState, error?: string) {
		this._connectionState = state;
		for (const listener of this.connectionListeners) {
			listener(state, error);
		}
	}

	private handleMessage(topic: string, payload: Buffer) {
		let data: unknown;
		try {
			data = JSON.parse(payload.toString());
		} catch {
			return;
		}

		if (typeof data !== 'object' || data === null) return;

		const event = this.parseMessage(topic, data as Record<string, unknown>);
		if (!event) return;

		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private parseMessage(topic: string, data: Record<string, unknown>): MqttParsedEvent | null {
		const msgType = data.type as string | undefined;

		// Status messages are typed by the `type` field
		switch (msgType) {
			case 'rates':
			case 'config':
			case 'systems':
			case 'system':
			case 'calls_active':
			case 'recorders':
			case 'recorder':
			case 'call_start':
			case 'call_end':
			case 'audio':
			case 'console':
				return { topic, ...data } as MqttParsedEvent;

			case 'message':
				return { topic, ...data } as MqttParsedEvent;

			// Unit messages — type field is the event name
			case 'call':
			case 'end':
			case 'on':
			case 'off':
			case 'ackresp':
			case 'join':
			case 'data':
			case 'ans_req':
			case 'location':
				return { topic, ...data } as MqttParsedEvent;

			default:
				// plugin_status has no `type` field — check for `status` field
				if ('status' in data && 'client_id' in data) {
					return { topic, type: 'plugin_status' as never, ...data } as unknown as MqttParsedEvent;
				}
				return null;
		}
	}
}
