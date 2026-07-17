//* HTTP + websocket client for the admin panel API.
//* Admin routes have no CORS headers, so this only works when the UI is served
//* same-origin by the Go server (the normal deployment; tlrOrigin() falls back
//* to window.location.origin when PUBLIC_TLR_URL is unset).

import { TlrApiError } from './tlr-client.ts';
import type {
	AdminConfigDocument,
	AdminConfigPayload,
	AdminLoginConfig,
	AdminLoginResponse,
	AdminOptionsPatch,
	AdminSocketEvent,
	AdminSocketStatus
} from './admin-types.ts';

const TOKEN_KEY = 'tlr-admin-token';
const WS_RECONNECT_DELAY_MS = 2000;

type AdminSocketListener = (event: AdminSocketEvent) => void;

export class AdminClient {
	private origin: string;
	private socket: WebSocket | null = null;
	private socketListeners = new Set<AdminSocketListener>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private shouldReconnect = false;
	private socketStatus: AdminSocketStatus = 'idle';
	private onUnauthorized: (() => void) | null = null;

	constructor(origin: string) {
		this.origin = origin.replace(/\/$/, '');
	}

	get token(): string | null {
		if (typeof window === 'undefined') return null;
		return sessionStorage.getItem(TOKEN_KEY);
	}

	get isAuthenticated(): boolean {
		return !!this.token;
	}

	setToken(token: string): void {
		if (typeof window === 'undefined') return;
		sessionStorage.setItem(TOKEN_KEY, token);
	}

	clearToken(): void {
		if (typeof window === 'undefined') return;
		sessionStorage.removeItem(TOKEN_KEY);
	}

	//* Called whenever a request comes back 401 (token expired or server restarted).
	setUnauthorizedHandler(handler: (() => void) | null): void {
		this.onUnauthorized = handler;
	}

	private async request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
		const headers = new Headers(init.headers);
		if (init.body) headers.set('Content-Type', 'application/json');
		//* The server reads the raw Authorization header (no Bearer prefix).
		if (auth && this.token) headers.set('Authorization', this.token);

		const response = await fetch(this.origin + path, { ...init, headers });

		if (!response.ok) {
			if (response.status === 401 && auth) {
				this.clearToken();
				this.onUnauthorized?.();
			}
			let message = `Request failed (${response.status})`;
			try {
				const body = await response.json();
				if (typeof body?.error === 'string') message = body.error;
				else if (typeof body?.message === 'string') message = body.message;
			} catch {
				//* Non-JSON error body; keep the generic message.
			}
			throw new TlrApiError(message, response.status);
		}

		if (response.status === 204) return undefined as T;
		const text = await response.text();
		return (text ? JSON.parse(text) : undefined) as T;
	}

	getLoginConfig(): Promise<AdminLoginConfig> {
		return this.request<AdminLoginConfig>('/api/admin/login-config', {}, false);
	}

	async login(password: string): Promise<AdminLoginResponse> {
		const response = await this.request<AdminLoginResponse>(
			'/api/admin/login',
			{ method: 'POST', body: JSON.stringify({ password }) },
			false
		);
		this.setToken(response.token);
		return response;
	}

	//* SSO: exchanges the logged-in user's PIN for an admin token (system admins only).
	async ssoLogin(pin: string): Promise<AdminLoginResponse> {
		const response = await this.request<AdminLoginResponse>(
			'/api/admin/sso',
			{ method: 'POST', body: JSON.stringify({ pin }) },
			false
		);
		this.setToken(response.token);
		return response;
	}

	async logout(): Promise<void> {
		try {
			await this.request<void>('/api/admin/logout', { method: 'POST' });
		} finally {
			this.clearToken();
			this.disconnectConfigSocket();
		}
	}

	getConfig(): Promise<AdminConfigDocument> {
		return this.request<AdminConfigDocument>('/api/admin/config');
	}

	//* Partial options save; the server deep-merges nested objects and returns
	//* the full config document.
	patchOptions(patch: AdminOptionsPatch): Promise<AdminConfigDocument> {
		return this.request<AdminConfigDocument>('/api/admin/options', {
			method: 'PATCH',
			body: JSON.stringify(patch)
		});
	}

	//* Per-system overrides (separate endpoints, not part of the Options PATCH).
	saveSystemNoAudioSettings(systemId: number, enabled: boolean, thresholdMinutes: number): Promise<unknown> {
		return this.request('/api/admin/system-no-audio-settings', {
			method: 'POST',
			body: JSON.stringify({ systemId, noAudioAlertsEnabled: enabled, noAudioThresholdMinutes: thresholdMinutes })
		});
	}

	saveSystemRetentionSettings(systemId: number, retentionDays: number): Promise<unknown> {
		return this.request('/api/admin/system-retention-settings', {
			method: 'POST',
			body: JSON.stringify({ systemId, retentionDays })
		});
	}

	saveSystemDuplicateDetectionSettings(systemId: number, enabled: boolean): Promise<unknown> {
		return this.request('/api/admin/system-duplicate-detection-settings', {
			method: 'POST',
			body: JSON.stringify({ systemId, duplicateDetectionEnabled: enabled })
		});
	}

	//* Branding image uploads (multipart; not Options keys).
	private async upload(path: string, fieldName: string, file: File): Promise<unknown> {
		const body = new FormData();
		body.append(fieldName, file);
		const headers = new Headers();
		if (this.token) headers.set('Authorization', this.token);
		const response = await fetch(this.origin + path, { method: 'POST', body, headers });
		if (!response.ok) {
			if (response.status === 401) {
				this.clearToken();
				this.onUnauthorized?.();
			}
			throw new TlrApiError(`Upload failed (${response.status})`, response.status);
		}
		return response.json();
	}

	uploadFavicon(file: File): Promise<unknown> {
		return this.upload('/api/admin/favicon', 'favicon', file);
	}

	deleteFavicon(): Promise<unknown> {
		return this.request('/api/admin/favicon/delete', { method: 'DELETE' });
	}

	uploadEmailLogo(file: File): Promise<unknown> {
		return this.upload('/api/admin/email-logo', 'logo', file);
	}

	deleteEmailLogo(): Promise<unknown> {
		return this.request('/api/admin/email-logo/delete', { method: 'DELETE' });
	}

	//* Sends a test email through the configured provider.
	emailTest(toEmail: string): Promise<{ success?: boolean; message?: string; error?: string }> {
		return this.request('/api/admin/email-test', { method: 'POST', body: JSON.stringify({ toEmail }) });
	}

	subscribe(listener: AdminSocketListener): () => void {
		this.socketListeners.add(listener);
		listener({ type: 'status', status: this.socketStatus });
		return () => {
			this.socketListeners.delete(listener);
		};
	}

	private emit(event: AdminSocketEvent) {
		if (event.type === 'status') this.socketStatus = event.status;
		for (const listener of this.socketListeners) listener(event);
	}

	//* Live config push channel: the server broadcasts the bare config payload
	//* on every config change. The first client message must be the token.
	connectConfigSocket(): void {
		if (typeof window === 'undefined' || !this.token) return;
		if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

		this.shouldReconnect = true;
		const socketUrl = new URL(this.origin + '/api/admin/config');
		socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
		const socket = new WebSocket(socketUrl.toString());
		this.socket = socket;
		this.emit({ type: 'status', status: 'connecting' });

		socket.onopen = () => {
			const token = this.token;
			if (!token) {
				socket.close();
				return;
			}
			socket.send(token);
			this.emit({ type: 'status', status: 'open' });
		};

		socket.onmessage = (message) => {
			try {
				const parsed = JSON.parse(message.data as string);
				//* HTTP responses wrap the payload in {config}; the socket does not.
				const payload = (parsed?.config ?? parsed) as AdminConfigPayload;
				const document: AdminConfigDocument = parsed?.config ? parsed : { config: payload };
				this.emit({ type: 'config', payload: document });
			} catch {
				//* Ignore non-JSON frames.
			}
		};

		socket.onclose = (event) => {
			if (this.socket !== socket) return;
			this.socket = null;
			//* A normal close (1000) means the server invalidated the session.
			if (event.code === 1000) {
				this.shouldReconnect = false;
				this.clearToken();
				this.emit({ type: 'status', status: 'logged-out' });
				this.onUnauthorized?.();
				return;
			}
			this.emit({ type: 'status', status: 'closed' });
			if (this.shouldReconnect) {
				this.reconnectTimer = setTimeout(() => this.connectConfigSocket(), WS_RECONNECT_DELAY_MS);
			}
		};
	}

	disconnectConfigSocket(): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		const socket = this.socket;
		this.socket = null;
		socket?.close();
	}
}
