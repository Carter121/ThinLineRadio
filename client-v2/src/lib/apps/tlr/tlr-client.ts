import type {
	Alert,
	AlertPreference,
	KeywordList,
	LclFilters,
	LclResponse,
	LivefeedMap,
	LoginResponse,
	RegisterPayload,
	RegisterResponse,
	RegistrationSettings,
	ServerStatus,
	SocketAlertNotification,
	SocketCall,
	StatsResponse,
	SystemAlertsResponse,
	TlrConfig,
	TlrConnectionState,
	TlrSocketEvent,
	Transcript,
	TranscriptQuery,
	VersionInfo,
	WebsocketCommand
} from './types.ts';

const PIN_KEY = 'tlr-pin';
const MAX_RECONNECT_DELAY_MS = 30_000;
// On resume, treat an OPEN socket as dead if nothing has arrived in this window
const STALE_SOCKET_MS = 45_000;

export class TlrApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'TlrApiError';
		this.status = status;
	}
}

function toQueryString(params: Record<string, string | number | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) search.set(key, String(value));
	}
	const text = search.toString();
	return text ? `?${text}` : '';
}

function encodePin(pin: string): string {
	if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
		return window.btoa(pin);
	}
	return Buffer.from(pin, 'utf8').toString('base64');
}

type SocketListener = (event: TlrSocketEvent) => void;

export class TlrClient {
	private baseUrl: string;
	private socketBaseUrl: string | null;
	private socket: WebSocket | null = null;
	private socketListeners = new Set<SocketListener>();
	private connectionState: TlrConnectionState = { status: 'idle', attempt: 0 };
	private lastConfig: TlrConfig | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectAttempt = 0;
	private shouldReconnect = false;
	private lastVersionRequested = false;
	private livefeedMap: LivefeedMap = {};
	private lastMessageAt = 0;

	constructor(baseUrl: string, socketBaseUrl?: string | null) {
		this.baseUrl = baseUrl.replace(/\/$/, '');
		this.socketBaseUrl = socketBaseUrl?.replace(/\/$/, '') ?? null;
	}

	get isAuthenticated(): boolean {
		return !!this.getPin();
	}

	get currentConnectionState(): TlrConnectionState {
		return this.connectionState;
	}

	getPin(): string | null {
		if (typeof window === 'undefined') return null;
		return localStorage.getItem(PIN_KEY);
	}

	setPin(pin: string): void {
		if (typeof window === 'undefined') return;
		localStorage.setItem(PIN_KEY, pin);
	}

	clearPin(): void {
		if (typeof window === 'undefined') return;
		localStorage.removeItem(PIN_KEY);
	}

	setSocketBaseUrl(socketBaseUrl: string | null | undefined): void {
		this.socketBaseUrl = socketBaseUrl?.replace(/\/$/, '') ?? null;
	}

	subscribe(listener: SocketListener): () => void {
		this.socketListeners.add(listener);
		listener({ type: 'connection', state: this.connectionState });
		if (this.lastConfig) listener({ type: 'config', payload: this.lastConfig });
		return () => {
			this.socketListeners.delete(listener);
		};
	}

	private emit(event: TlrSocketEvent) {
		if (event.type === 'connection') this.connectionState = event.state;
		for (const listener of this.socketListeners) listener(event);
	}

	private setConnectionState(status: TlrConnectionState['status'], overrides: Omit<Partial<TlrConnectionState>, 'status'> = {}) {
		this.emit({
			type: 'connection',
			state: {
				status,
				attempt: this.reconnectAttempt,
				...overrides
			}
		});
	}

	private async request<T>(path: string, options?: RequestInit): Promise<T> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(options?.headers as Record<string, string>)
		};

		const pin = this.getPin();
		let url = `${this.baseUrl}${path}`;
		if (pin) {
			const separator = url.includes('?') ? '&' : '?';
			url += `${separator}pin=${encodeURIComponent(pin)}`;
		}

		const res = await fetch(url, {
			...options,
			headers
		});

		if (!res.ok) {
			const body = await res.text();
			let message: string;
			try {
				const json = JSON.parse(body);
				message = json.error ?? json.message ?? body;
			} catch {
				message = body || res.statusText;
			}
			throw new TlrApiError(message, res.status);
		}

		return res.json() as Promise<T>;
	}

	async getServerStatus(): Promise<ServerStatus> {
		return this.request<ServerStatus>('/status/performance');
	}

	async login(email: string, password: string): Promise<LoginResponse> {
		const response = await this.request<LoginResponse>('/user/login', {
			method: 'POST',
			body: JSON.stringify({ email, password })
		});

		if (!response.user.pin) throw new TlrApiError('No pin in login response', 500);

		this.setPin(response.user.pin);
		return response;
	}

	async getRegistrationSettings(): Promise<RegistrationSettings> {
		return this.request<RegistrationSettings>('/registration-settings');
	}

	//* Sends a signup verification code to the email (only when the server requires it)
	async requestSignupVerification(email: string): Promise<{ verificationRequired?: boolean; message?: string }> {
		return this.request('/user/request-signup-verification', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	}

	async register(payload: RegisterPayload): Promise<RegisterResponse> {
		const response = await this.request<RegisterResponse>('/user/register', {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		if (response.verified && response.pin) this.setPin(response.pin);
		return response;
	}

	//* Consumes the token from verification email links (GET /verify redirects to /?verify=token)
	async verifyEmailToken(token: string): Promise<void> {
		await this.request<unknown>('/user/verify', {
			method: 'POST',
			body: JSON.stringify({ token })
		});
	}

	async resendVerification(email: string): Promise<void> {
		await this.request<unknown>('/user/resend-verification', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	}

	async requestPasswordReset(email: string): Promise<void> {
		await this.request<unknown>('/user/forgot-password', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	}

	async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
		await this.request<unknown>('/user/reset-password', {
			method: 'POST',
			body: JSON.stringify({ email, code, newPassword })
		});
	}

	async getAlerts(options: { since?: number; limit?: number } = {}): Promise<Alert[]> {
		return this.request<Alert[]>(`/alerts${toQueryString({ since: options.since, limit: options.limit })}`);
	}

	async getTranscripts(options: TranscriptQuery = {}): Promise<Transcript[]> {
		return this.request<Transcript[]>(
			`/transcripts${toQueryString({
				limit: options.limit,
				offset: options.offset,
				systemId: options.systemId,
				talkgroupId: options.talkgroupId,
				status: options.status,
				dateFrom: options.dateFrom,
				dateTo: options.dateTo,
				search: options.search
			})}`
		);
	}

	async getStats(systemId?: number): Promise<StatsResponse> {
		return this.request<StatsResponse>(`/stats${toQueryString({ systemId })}`);
	}

	async getVapidPublicKey(): Promise<string> {
		const res = await fetch(`${this.baseUrl}/webpush/vapid-public-key`);
		if (!res.ok) throw new TlrApiError('Failed to fetch VAPID public key', res.status);
		const data = (await res.json()) as { publicKey: string };
		return data.publicKey;
	}

	async registerWebPushSubscription(sub: PushSubscriptionJSON): Promise<void> {
		const pin = this.getPin();
		const url = pin ? `${this.baseUrl}/webpush/subscribe?pin=${encodeURIComponent(pin)}` : `${this.baseUrl}/webpush/subscribe`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sub)
		});
		if (!res.ok) throw new TlrApiError('Failed to register Web Push subscription', res.status);
	}

	async unregisterWebPushSubscription(endpoint: string): Promise<void> {
		const pin = this.getPin();
		const url = pin ? `${this.baseUrl}/webpush/subscribe?pin=${encodeURIComponent(pin)}` : `${this.baseUrl}/webpush/subscribe`;
		const res = await fetch(url, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint })
		});
		if (!res.ok) throw new TlrApiError('Failed to unregister Web Push subscription', res.status);
	}

	//* User settings are one opaque JSON blob on the server (users.settings); POST replaces
	//* the whole blob, so writers must read-modify-write to preserve other clients' keys
	async getSettings(): Promise<Record<string, unknown>> {
		return this.request<Record<string, unknown>>('/settings');
	}

	async saveSettings(settings: Record<string, unknown>): Promise<void> {
		await this.request<{ message: string }>('/settings', {
			method: 'POST',
			body: JSON.stringify(settings)
		});
	}

	async getAlertPreferences(): Promise<AlertPreference[]> {
		return this.request<AlertPreference[]>('/alerts/preferences');
	}

	//* PUT upserts only the rows provided; untouched talkgroups keep their stored prefs
	async saveAlertPreferences(preferences: AlertPreference[]): Promise<void> {
		await this.request<unknown>('/alerts/preferences', {
			method: 'PUT',
			body: JSON.stringify(preferences)
		});
	}

	async getKeywordLists(): Promise<KeywordList[]> {
		return this.request<KeywordList[]>('/keyword-lists');
	}

	async getSystemAlerts(
		options: {
			limit?: number;
			includeDismissed?: boolean;
		} = {}
	): Promise<SystemAlertsResponse> {
		return this.request<SystemAlertsResponse>(
			`/system-alerts${toQueryString({
				limit: options.limit,
				includeDismissed: options.includeDismissed ? 'true' : undefined
			})}`
		);
	}

	connectSocket() {
		if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
		if (!this.socketBaseUrl) {
			this.setConnectionState('error', { message: 'WebSocket URL not configured' });
			return;
		}
		if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
			return;
		}

		this.shouldReconnect = true;
		this.lastVersionRequested = false;
		this.openSocket();
	}

	/**
	 * Called when the page becomes visible again (PWA resumed from background,
	 * tab refocused, network restored). Backgrounded pages have throttled timers
	 * and frozen sockets, so the normal reconnect loop can't be trusted here:
	 * cancel any stalled backoff and reconnect immediately. With `force` (or when
	 * no message has arrived recently) an OPEN socket is also replaced, since
	 * after device sleep the TCP connection is often dead while the socket still
	 * reports OPEN.
	 */
	resumeSocket(options: { force?: boolean } = {}) {
		if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
		if (!this.shouldReconnect) {
			this.connectSocket();
			return;
		}

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
			this.reconnectAttempt = 0;
			this.openSocket();
			return;
		}

		const socket = this.socket;
		if (!socket || socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
			this.reconnectAttempt = 0;
			this.openSocket();
			return;
		}

		if (socket.readyState === WebSocket.OPEN && (options.force || Date.now() - this.lastMessageAt > STALE_SOCKET_MS)) {
			// Detach before closing so the close handler ignores this socket
			this.socket = null;
			socket.close();
			this.reconnectAttempt = 0;
			this.openSocket();
		}
	}

	disconnectSocket() {
		this.shouldReconnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.socket) {
			const socket = this.socket;
			this.socket = null;
			socket.close();
		}
		this.setConnectionState('disconnected');
	}

	authenticateSocket() {
		const pin = this.getPin();
		if (!pin) return;
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
		this.setConnectionState('authenticating');
		this.send(['PIN', encodePin(pin)]);
	}

	setLivefeedMap(map: LivefeedMap) {
		this.livefeedMap = map;
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.send(['LFM', map]);
		}
	}

	requestVersion() {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.lastVersionRequested) return;
		this.lastVersionRequested = true;
		this.send(['VER']);
	}

	requestCallList(filters: LclFilters) {
		this.send(['LCL', filters]);
	}

	requestCallPlayback(callId: number) {
		this.send(['CAL', callId, 'playback']);
	}

	requestCallDownload(callId: number) {
		this.send(['CAL', callId, 'd']);
	}

	requestCall(callId: number, flag?: string) {
		if (flag) {
			this.send(['CAL', callId, flag]);
		} else {
			this.send(['CAL', callId]);
		}
	}

	private openSocket() {
		if (!this.socketBaseUrl) return;
		this.setConnectionState('connecting', { attempt: this.reconnectAttempt });

		const socketUrl = new URL(this.socketBaseUrl);
		socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
		socketUrl.pathname = '/';
		socketUrl.search = '';
		socketUrl.hash = '';

		const socket = new WebSocket(socketUrl.toString());
		this.socket = socket;

		socket.addEventListener('open', () => {
			this.reconnectAttempt = 0;
			this.lastMessageAt = Date.now();
			this.setConnectionState('connected');
			this.requestVersion();
			if (this.getPin()) this.authenticateSocket();
		});

		socket.addEventListener('message', (event) => {
			this.lastMessageAt = Date.now();
			this.handleSocketMessage(event.data);
		});

		socket.addEventListener('error', () => {
			this.setConnectionState('error', { message: 'WebSocket error' });
		});

		socket.addEventListener('close', () => {
			if (this.socket !== socket) {
				// This socket was superseded: either disconnectSocket() already cleaned up and
				// updated state, or a new socket was intentionally opened. Either way, ignore.
				return;
			}
			this.socket = null;
			this.setConnectionState('disconnected');
			if (!this.shouldReconnect) return;

			this.reconnectAttempt += 1;
			const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
			this.reconnectTimer = setTimeout(() => {
				this.openSocket();
			}, delay);
		});
	}

	private send(payload: [WebsocketCommand] | [WebsocketCommand, unknown] | [WebsocketCommand, unknown, unknown]) {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(payload));
	}

	private handleSocketMessage(rawData: unknown) {
		let data: unknown;
		try {
			data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
		} catch {
			this.emit({ type: 'error', message: 'Invalid WebSocket payload' });
			return;
		}

		if (!Array.isArray(data) || typeof data[0] !== 'string') {
			this.emit({ type: 'error', message: 'Unexpected WebSocket message shape' });
			return;
		}

		const command = data[0] as WebsocketCommand;
		const payload = data[1];

		switch (command) {
			case 'PIN':
				this.emit({ type: 'pin-required' });
				if (this.getPin()) this.authenticateSocket();
				break;
			case 'PNS':
				if (typeof payload === 'string') {
					this.setPin(payload);
					this.setConnectionState('authenticated');
					this.emit({ type: 'pin-set', pin: payload });
				}
				break;
			case 'CFG':
				this.lastConfig = (payload ?? {}) as TlrConfig;
				this.emit({ type: 'config', payload: this.lastConfig });
				if (Object.keys(this.livefeedMap).length > 0) this.setLivefeedMap(this.livefeedMap);
				break;
			case 'LFM':
				this.emit({ type: 'livefeed', active: payload === true });
				break;
			case 'CAL':
				if (data[2] === 'playback') {
					this.emit({ type: 'call-playback', payload: payload as SocketCall });
				} else if (data[2] === 'alias') {
					this.emit({ type: 'call-alias', payload: payload as SocketCall });
				} else if (data[2] === 'd') {
					this.emit({ type: 'call-download', payload: payload as SocketCall });
				} else {
					this.emit({ type: 'call', payload: payload as SocketCall });
				}
				break;
			case 'LCL':
				this.emit({ type: 'call-list', payload: payload as LclResponse });
				break;
			case 'ALT':
				this.emit({ type: 'alert', payload: payload as SocketAlertNotification });
				break;
			case 'LSC':
				if (typeof payload === 'number') this.emit({ type: 'listeners', count: payload });
				break;
			case 'VER':
				this.emit({ type: 'version', payload: (payload ?? {}) as VersionInfo });
				break;
			case 'XPR':
				this.setConnectionState('expired', { message: 'PIN expired' });
				this.emit({ type: 'expired' });
				break;
			case 'MAX':
				if (typeof payload === 'number') {
					this.setConnectionState('limited', { limit: payload, message: 'Connection limit reached' });
					this.emit({ type: 'limited', limit: payload });
				}
				break;
			case 'ERR':
				this.emit({
					type: 'error',
					message: typeof payload === 'string' ? payload : 'WebSocket error'
				});
				break;
			default:
				break;
		}
	}
}
