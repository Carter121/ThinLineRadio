//* Admin panel session lifecycle: login state, the live config document,
//* and options saves. One instance is created by the /admin route shell.

import { AdminClient } from './admin-client.ts';
import { TlrApiError } from './tlr-client.ts';
import type { TlrClient } from './tlr-client.ts';
import type { AdminConfigDocument, AdminConfigPayload, AdminLoginConfig, AdminOptionsPatch, AdminSocketStatus } from './admin-types.ts';

export class AdminSessionState {
	authenticated = $state(false);
	isStarting = $state(true);
	isLoggingIn = $state(false);
	passwordNeedChange = $state(false);

	loginConfig = $state<AdminLoginConfig | null>(null);
	config = $state.raw<AdminConfigPayload | null>(null);
	options = $derived(this.config?.options ?? null);
	socketStatus = $state<AdminSocketStatus>('idle');

	authError = $state<string | null>(null);
	loadError = $state<string | null>(null);

	readonly client: AdminClient;
	private tlrClient: TlrClient;
	private unsubscribeSocket: (() => void) | null = null;

	constructor(client: AdminClient, tlrClient: TlrClient) {
		this.client = client;
		this.tlrClient = tlrClient;
	}

	//* SSO is offered when the user is signed into the main UI (their PIN is
	//* stored); the server still requires the account to be a system admin.
	get ssoAvailable(): boolean {
		return !!this.tlrClient.getPin();
	}

	async start(): Promise<void> {
		this.isStarting = true;

		this.client.setUnauthorizedHandler(() => {
			this.authenticated = false;
			this.config = null;
		});

		this.unsubscribeSocket = this.client.subscribe((event) => {
			if (event.type === 'status') this.socketStatus = event.status;
			else if (event.type === 'config') this.applyConfigDocument(event.payload);
		});

		try {
			this.loginConfig = await this.client.getLoginConfig();
		} catch {
			//* Non-fatal: the login screen just can't hide the password form.
		}

		if (this.client.isAuthenticated) {
			await this.hydrate();
		}

		this.isStarting = false;
	}

	async loginWithPassword(password: string): Promise<void> {
		await this.runLogin(() => this.client.login(password));
	}

	async loginWithSso(): Promise<void> {
		const pin = this.tlrClient.getPin();
		if (!pin) {
			this.authError = 'Sign in to the main UI first to use SSO.';
			return;
		}
		await this.runLogin(() => this.client.ssoLogin(pin));
	}

	private async runLogin(attempt: () => Promise<unknown>): Promise<void> {
		this.isLoggingIn = true;
		this.authError = null;
		try {
			await attempt();
			await this.hydrate();
		} catch (error) {
			if (error instanceof TlrApiError && error.status === 401) {
				this.authError = 'Invalid credentials, or too many attempts (wait 10 minutes).';
			} else {
				this.authError = error instanceof Error ? error.message : 'Login failed';
			}
		} finally {
			this.isLoggingIn = false;
		}
	}

	async logout(): Promise<void> {
		try {
			await this.client.logout();
		} catch {
			//* The token is cleared locally either way.
		}
		this.authenticated = false;
		this.config = null;
	}

	async refreshConfig(): Promise<void> {
		try {
			this.applyConfigDocument(await this.client.getConfig());
			this.loadError = null;
		} catch (error) {
			this.loadError = error instanceof Error ? error.message : 'Failed to load config';
		}
	}

	//* Sends a partial options save and adopts the returned config document.
	async saveOptions(patch: AdminOptionsPatch): Promise<void> {
		this.applyConfigDocument(await this.client.patchOptions(patch));
	}

	destroy(): void {
		this.unsubscribeSocket?.();
		this.unsubscribeSocket = null;
		this.client.setUnauthorizedHandler(null);
		this.client.disconnectConfigSocket();
	}

	private async hydrate(): Promise<void> {
		this.authenticated = true;
		await this.refreshConfig();
		//* A 401 during refresh clears the token via the unauthorized handler.
		if (this.client.isAuthenticated) this.client.connectConfigSocket();
	}

	private applyConfigDocument(document: AdminConfigDocument): void {
		this.config = document.config;
		if (typeof document.passwordNeedChange === 'boolean') {
			this.passwordNeedChange = document.passwordNeedChange;
		}
	}
}
