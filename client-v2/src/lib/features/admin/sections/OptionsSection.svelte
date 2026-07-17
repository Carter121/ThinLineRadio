<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Plug from '@lucide/svelte/icons/plug';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import BrandingImages from './BrandingImages.svelte';
	import OptionField from './OptionField.svelte';
	import { OPTION_PANELS, buildPatch, getOptionValue, toDraftValue, toWireValue, type OptionFieldSpec } from './options-spec.ts';

	interface Props {
		session: AdminSessionState;
		//* Which options panel this page renders (an OPTION_PANELS id).
		panelId?: string;
	}

	let { session, panelId }: Props = $props();

	const panel = $derived(OPTION_PANELS.find((p) => p.id === panelId) ?? OPTION_PANELS[0]);

	//* Draft and baseline are keyed by dot-path; a field is dirty when they differ.
	let draft = $state<Record<string, unknown>>({});
	let baseline: Record<string, unknown> = {};
	let saving = $state(false);
	let testEmailAddress = $state('');
	let sendingTestEmail = $state(false);

	//* Sync from every incoming config document (initial load, websocket pushes,
	//* save responses), preserving unsaved local edits.
	$effect(() => {
		const options = session.options;
		const fields = panel.fields;
		if (!options) return;
		untrack(() => {
			const nextBaseline: Record<string, unknown> = {};
			for (const field of fields) {
				nextBaseline[field.key] = toDraftValue(field, getOptionValue(options, field.key));
			}
			for (const [key, value] of Object.entries(nextBaseline)) {
				if (!(key in draft) || draft[key] === baseline[key]) draft[key] = value;
			}
			baseline = nextBaseline;
		});
	});

	function isDirty(field: OptionFieldSpec): boolean {
		return field.type !== 'toggle' && draft[field.key] !== baseline[field.key];
	}

	const visibleFields = $derived(panel.fields.filter((field) => !field.showIf || field.showIf(draft)));
	const dirtyFields = $derived(visibleFields.filter(isDirty));

	//* Toggles save immediately with a single-key patch (like the old admin).
	async function handleToggle(field: OptionFieldSpec, checked: boolean) {
		const previous = draft[field.key];
		draft[field.key] = checked;
		const entries: Record<string, unknown> = { [field.key]: checked };
		try {
			await session.saveOptions(buildPatch(entries));
		} catch (error) {
			draft[field.key] = previous;
			toast.error(error instanceof Error ? error.message : `Failed to save ${field.label}`);
		}
	}

	async function savePanel() {
		if (dirtyFields.length === 0) return;
		saving = true;
		const entries: Record<string, unknown> = {};
		for (const field of dirtyFields) entries[field.key] = toWireValue(field, draft[field.key]);
		try {
			await session.saveOptions(buildPatch(entries));
			toast.success(`${panel.label} saved`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to save ${panel.label}`);
		} finally {
			saving = false;
		}
	}

	//* Relay suspension status, loaded when the Integrations page opens.
	interface RelaySuspensionStatus {
		fully_suspended?: boolean;
		suspend_message?: string;
		relay_owner_unlocked_public?: boolean;
		public_listener_blocked?: boolean;
		push_notifications_blocked?: boolean;
	}
	let relayStatus = $state<RelaySuspensionStatus | null>(null);
	let unlockingRelay = $state(false);
	let testingCentral = $state(false);

	$effect(() => {
		if (panel.id !== 'integrations') return;
		void session.client
			.request<RelaySuspensionStatus>('/api/admin/relay-suspension')
			.then((status) => (relayStatus = status))
			.catch(() => (relayStatus = null));
	});

	//* Restores the public web listener while the relay suspension stands.
	async function unlockPublicListener() {
		unlockingRelay = true;
		try {
			await session.client.request('/api/admin/relay-unlock-public-client', { method: 'POST' });
			relayStatus = await session.client.request<RelaySuspensionStatus>('/api/admin/relay-suspension');
			toast.success('Public web listener unlocked');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to unlock public listener');
		} finally {
			unlockingRelay = false;
		}
	}

	//* Tests the CM connection with the CURRENT draft values (may be unsaved).
	async function testCentralConnection() {
		testingCentral = true;
		try {
			const result = await session.client.request<{ status?: string; error?: string }>('/api/admin/test-central-connection', {
				method: 'POST',
				body: JSON.stringify({
					central_management_url: String(draft['centralManagementURL'] ?? ''),
					api_key: String(draft['centralManagementAPIKey'] ?? ''),
					server_name: String(draft['centralManagementServerName'] ?? ''),
					server_url: String(getOptionValue(session.options ?? ({} as never), 'baseUrl') ?? '')
				})
			});
			if (result?.error) toast.error(result.error);
			else toast.success('Central Management connection OK');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Connection test failed');
		} finally {
			testingCentral = false;
		}
	}

	let backfillingAddresses = $state(false);

	//* Geocodes historical calls that are missing address data via Nominatim.
	async function backfillAddresses() {
		backfillingAddresses = true;
		try {
			const result = await session.client.request<{ processed?: number; geocoded?: number; skipped?: number }>('/api/admin/backfill-addresses', {
				method: 'POST'
			});
			toast.success(`Backfill complete: ${result?.processed ?? 0} processed, ${result?.geocoded ?? 0} geocoded, ${result?.skipped ?? 0} skipped`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Address backfill failed');
		} finally {
			backfillingAddresses = false;
		}
	}

	async function sendTestEmail() {
		if (!testEmailAddress) return;
		sendingTestEmail = true;
		try {
			const result = await session.client.emailTest(testEmailAddress);
			if (result?.error) toast.error(result.error);
			else toast.success(result?.message ?? 'Test email sent');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send test email');
		} finally {
			sendingTestEmail = false;
		}
	}

	//* Toggles render first so master switches sit at the top of the page; the
	//* grid otherwise keeps spec order.
	const toggleFields = $derived(visibleFields.filter((field) => field.type === 'toggle'));
	const inputFields = $derived(visibleFields.filter((field) => field.type !== 'toggle'));
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">{panel.label}</h2>
			{#if panel.description}
				<p class="text-sm text-muted-foreground">{panel.description}</p>
			{/if}
		</div>
		{#if dirtyFields.length > 0}
			<div class="flex items-center gap-3">
				<span class="text-sm text-muted-foreground">{dirtyFields.length} unsaved {dirtyFields.length === 1 ? 'change' : 'changes'}</span>
				<Button size="sm" disabled={saving} onclick={savePanel}>
					{#if saving}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Save data-icon="inline-start" />
					{/if}
					Save
				</Button>
			</div>
		{/if}
	</div>

	{#if toggleFields.length > 0}
		<Card class="py-0">
			<CardContent class="grid gap-x-10 gap-y-4 px-5 py-4 md:grid-cols-2 2xl:grid-cols-3">
				{#each toggleFields as field (field.key)}
					<OptionField {field} value={draft[field.key]} dirty={false} onchange={(value) => void handleToggle(field, value === true)} />
				{/each}
			</CardContent>
		</Card>
	{/if}

	{#if inputFields.length > 0}
		<Card class="py-0">
			<CardContent class="grid items-start gap-x-10 gap-y-5 px-5 py-5 md:grid-cols-2 2xl:grid-cols-3">
				{#each inputFields as field (field.key)}
					<OptionField {field} value={draft[field.key]} dirty={isDirty(field)} onchange={(value) => (draft[field.key] = value)} />
				{/each}
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'branding'}
		<Card class="py-0">
			<CardContent class="px-5 py-4">
				<BrandingImages {session} />
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'integrations'}
		{#if relayStatus?.fully_suspended || relayStatus?.public_listener_blocked || relayStatus?.push_notifications_blocked}
			<Card class="border-destructive/50 py-0">
				<CardContent class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
					<div>
						<p class="text-sm font-medium text-destructive">Relay suspension active</p>
						<p class="text-xs text-muted-foreground">
							{relayStatus?.suspend_message || 'This server is suspended by the ThinLine relay.'}
							{#if relayStatus?.push_notifications_blocked}
								Push notifications stay disabled until the relay clears the suspension.
							{/if}
						</p>
					</div>
					{#if relayStatus?.public_listener_blocked && !relayStatus?.relay_owner_unlocked_public}
						<Button variant="outline" size="sm" disabled={unlockingRelay} onclick={unlockPublicListener}>
							{#if unlockingRelay}
								<Loader2 data-icon="inline-start" class="animate-spin" />
							{/if}
							Unlock public web listener
						</Button>
					{/if}
				</CardContent>
			</Card>
		{/if}

		{#if draft['centralManagementEnabled'] === true}
			<Card class="py-0">
				<CardContent class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
					<div>
						<p class="text-sm font-medium">Test Central Management connection</p>
						<p class="text-xs text-muted-foreground">Uses the URL and API key entered above, even before saving.</p>
					</div>
					<Button variant="outline" size="sm" disabled={testingCentral || !draft['centralManagementURL'] || !draft['centralManagementAPIKey']} onclick={testCentralConnection}>
						{#if testingCentral}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<Plug data-icon="inline-start" />
						{/if}
						Test connection
					</Button>
				</CardContent>
			</Card>
		{/if}
	{/if}

	{#if panel.id === 'transcription' && draft['transcriptionConfig.enabled'] === true}
		<Card class="py-0">
			<CardContent class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
				<div>
					<p class="text-sm font-medium">Backfill Past Addresses</p>
					<p class="text-xs text-muted-foreground">Geocode addresses in historical transcripts using the Nominatim server above. Can take a while on large call databases.</p>
				</div>
				<Button variant="outline" size="sm" disabled={backfillingAddresses || !draft['nominatimUrl']} onclick={backfillAddresses}>
					{#if backfillingAddresses}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<MapPin data-icon="inline-start" />
					{/if}
					Backfill
				</Button>
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'email' && draft['emailServiceEnabled'] === true}
		<Card class="py-0">
			<CardContent class="flex items-end gap-2 px-5 py-4">
				<div class="max-w-xs flex-1 flex flex-col gap-1.5">
					<label for="admin-test-email" class="text-sm font-medium">Send a test email</label>
					<Input id="admin-test-email" type="email" placeholder="you@example.com" bind:value={testEmailAddress} />
				</div>
				<Button variant="outline" size="sm" disabled={sendingTestEmail || !testEmailAddress} onclick={sendTestEmail}>
					{#if sendingTestEmail}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Send data-icon="inline-start" />
					{/if}
					Send
				</Button>
			</CardContent>
		</Card>
	{/if}
</div>
