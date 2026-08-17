<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Plug from '@lucide/svelte/icons/plug';
	import Plus from '@lucide/svelte/icons/plus';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import type { AdminCountyHint, AdminFireIncidentType } from '$lib/core/admin-types.ts';
	import { UTAH_COUNTIES, countyName } from '../utah-counties.ts';
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

	//* County priority rows, managed outside the spec-driven draft (array option).
	let countyHints = $state<AdminCountyHint[]>([]);
	let countyHintsBaseline = '[]';
	let savingCountyHints = $state(false);
	const countyHintsDirty = $derived(JSON.stringify(countyHints) !== countyHintsBaseline);

	//* Adopt server state on every config document unless there are unsaved edits.
	$effect(() => {
		const options = session.options;
		if (!options) return;
		untrack(() => {
			const incoming = JSON.stringify(options.addressCountyHints ?? []);
			if (JSON.stringify(countyHints) === countyHintsBaseline) {
				countyHints = (options.addressCountyHints ?? []).map((h) => ({ ...h }));
			}
			countyHintsBaseline = incoming;
		});
	});

	//* All talkgroups across systems, for the county priority selects.
	const talkgroupChoices = $derived(
		(session.config?.systems ?? []).flatMap((system) =>
			(system.talkgroups ?? []).map((tg) => ({
				value: `${system.systemRef ?? 0}:${tg.talkgroupRef}`,
				systemRef: system.systemRef ?? 0,
				talkgroupRef: tg.talkgroupRef,
				label: `${system.label}: ${tg.label ?? tg.name ?? tg.talkgroupRef}`
			}))
		)
	);

	//* Fire notification tier rows, managed outside the spec-driven draft (array option).
	let fireTiers = $state<AdminFireIncidentType[]>([]);
	let fireTiersBaseline = '[]';
	let savingFireTiers = $state(false);
	const fireTiersDirty = $derived(JSON.stringify(fireTiers) !== fireTiersBaseline);

	$effect(() => {
		const options = session.options;
		if (!options) return;
		untrack(() => {
			const incoming = JSON.stringify(options.fireIncidentTypes ?? []);
			if (JSON.stringify(fireTiers) === fireTiersBaseline) {
				fireTiers = (options.fireIncidentTypes ?? []).map((r) => ({ ...r }));
			}
			fireTiersBaseline = incoming;
		});
	});

	const FIRE_TIER_CHOICES: { value: AdminFireIncidentType['tier']; label: string }[] = [
		{ value: 'structure', label: 'Structure (priority 5)' },
		{ value: 'wildland', label: 'Wildland (priority 4)' },
		{ value: 'none', label: 'Do not notify' }
	];

	function addFireTier() {
		fireTiers = [...fireTiers, { pattern: '', tier: 'none' }];
	}

	function removeFireTier(index: number) {
		fireTiers = fireTiers.filter((_, i) => i !== index);
	}

	async function saveFireTiers() {
		savingFireTiers = true;
		try {
			const rows = fireTiers.filter((r) => r.pattern.trim() !== '');
			await session.saveOptions({ fireIncidentTypes: rows });
			fireTiers = rows.map((r) => ({ ...r }));
			toast.success('Fire notification tiers saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save fire notification tiers');
		} finally {
			savingFireTiers = false;
		}
	}

	function addCountyHint() {
		countyHints = [...countyHints, { systemRef: 0, talkgroupRef: 0, county: '' }];
	}

	function removeCountyHint(index: number) {
		countyHints = countyHints.filter((_, i) => i !== index);
	}

	async function saveCountyHints() {
		savingCountyHints = true;
		try {
			const rows = countyHints.filter((h) => h.talkgroupRef > 0 && h.county !== '');
			await session.saveOptions({ addressCountyHints: rows });
			countyHints = rows.map((h) => ({ ...h }));
			toast.success('County priority saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save county priority');
		} finally {
			savingCountyHints = false;
		}
	}

	//* Re-parses and geocodes historical calls. Force mode also erases stale
	//* matches so a stricter geocoder can clear previously wrong pins.
	async function backfillAddresses(force = false) {
		backfillingAddresses = true;
		try {
			const result = await session.client.request<{ processed?: number; geocoded?: number; skipped?: number }>(
				`/api/admin/backfill-addresses${force ? '?force=1' : ''}`,
				{ method: 'POST' }
			);
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
					<Button
						variant="outline"
						size="sm"
						disabled={testingCentral || !draft['centralManagementURL'] || !draft['centralManagementAPIKey']}
						onclick={testCentralConnection}
					>
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
					<p class="text-xs text-muted-foreground">
						Re-run address extraction and geocoding for historical transcripts using the address points database (Nominatim as fallback). Can take a while on large call databases.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" disabled={backfillingAddresses} onclick={() => backfillAddresses()}>
						{#if backfillingAddresses}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<MapPin data-icon="inline-start" />
						{/if}
						Backfill
					</Button>
					<Button variant="outline" size="sm" disabled={backfillingAddresses} onclick={() => backfillAddresses(true)}>
						Force re-geocode
					</Button>
				</div>
			</CardContent>
		</Card>

		<Card class="py-0">
			<CardContent class="space-y-3 px-5 py-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-sm font-medium">County Priority</p>
						<p class="text-xs text-muted-foreground">
							Restrict geocoding to a county for calls from a talkgroup. Addresses outside the county never match; unmatched calls keep their spoken address.
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if countyHintsDirty}
							<Button size="sm" disabled={savingCountyHints} onclick={saveCountyHints}>
								{#if savingCountyHints}
									<Loader2 data-icon="inline-start" class="animate-spin" />
								{:else}
									<Save data-icon="inline-start" />
								{/if}
								Save
							</Button>
						{/if}
						<Button variant="outline" size="sm" onclick={addCountyHint}>
							<Plus data-icon="inline-start" />
							Add
						</Button>
					</div>
				</div>
				{#if countyHints.length === 0}
					<p class="text-xs text-muted-foreground">No county priorities configured. All counties are searched equally.</p>
				{:else}
					<div class="space-y-2">
						{#each countyHints as hint (hint)}
							<div class="flex flex-wrap items-center gap-2">
								<Select
									type="single"
									value={hint.talkgroupRef > 0 ? `${hint.systemRef}:${hint.talkgroupRef}` : ''}
									onValueChange={(v) => {
										const choice = talkgroupChoices.find((c) => c.value === v);
										if (choice) {
											hint.systemRef = choice.systemRef;
											hint.talkgroupRef = choice.talkgroupRef;
										}
									}}
								>
									<SelectTrigger class="h-8 w-64 text-xs">
										{talkgroupChoices.find((c) => c.systemRef === hint.systemRef && c.talkgroupRef === hint.talkgroupRef)?.label ?? 'Select talkgroup...'}
									</SelectTrigger>
									<SelectContent>
										{#each talkgroupChoices as choice (choice.value)}
											<SelectItem value={choice.value}>{choice.label}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
								<Select type="single" value={hint.county} onValueChange={(v) => (hint.county = v)}>
									<SelectTrigger class="h-8 w-44 text-xs">
										{hint.county ? `${countyName(hint.county)} County` : 'Select county...'}
									</SelectTrigger>
									<SelectContent>
										{#each UTAH_COUNTIES as county (county.fips)}
											<SelectItem value={county.fips}>{county.name}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
								<Button variant="ghost" size="sm" class="size-8 p-0" onclick={() => removeCountyHint(countyHints.indexOf(hint))}>
									<Trash2 class="size-3.5" />
								</Button>
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'alerts'}
		<Card class="py-0">
			<CardContent class="space-y-3 px-5 py-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-sm font-medium">Fire Notification Tiers</p>
						<p class="text-xs text-muted-foreground">
							Send ntfy notifications for fire incidents by matched incident type. Patterns match as substrings and earlier rows win, so keep "do not notify" rows first. Requires the NTFY_FIRE_TOPIC environment variable.
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if fireTiersDirty}
							<Button size="sm" disabled={savingFireTiers} onclick={saveFireTiers}>
								{#if savingFireTiers}
									<Loader2 data-icon="inline-start" class="animate-spin" />
								{:else}
									<Save data-icon="inline-start" />
								{/if}
								Save
							</Button>
						{/if}
						<Button variant="outline" size="sm" onclick={addFireTier}>
							<Plus data-icon="inline-start" />
							Add
						</Button>
					</div>
				</div>
				{#if fireTiers.length === 0}
					<p class="text-xs text-muted-foreground">No tiers configured. Built-in defaults apply until rows are saved here.</p>
				{:else}
					<div class="space-y-2">
						{#each fireTiers as row (row)}
							<div class="flex flex-wrap items-center gap-2">
								<Input class="h-8 w-64 text-xs" placeholder="Incident type contains..." bind:value={row.pattern} />
								<Select type="single" value={row.tier} onValueChange={(v) => (row.tier = v as AdminFireIncidentType['tier'])}>
									<SelectTrigger class="h-8 w-44 text-xs">
										{FIRE_TIER_CHOICES.find((c) => c.value === row.tier)?.label ?? 'Select tier...'}
									</SelectTrigger>
									<SelectContent>
										{#each FIRE_TIER_CHOICES as choice (choice.value)}
											<SelectItem value={choice.value}>{choice.label}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
								<Button variant="ghost" size="sm" class="size-8 p-0" onclick={() => removeFireTier(fireTiers.indexOf(row))}>
									<Trash2 class="size-3.5" />
								</Button>
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'email' && draft['emailServiceEnabled'] === true}
		<Card class="py-0">
			<CardContent class="flex items-end gap-2 px-5 py-4">
				<div class="flex max-w-xs flex-1 flex-col gap-1.5">
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
