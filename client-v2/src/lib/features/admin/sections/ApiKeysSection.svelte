<script lang="ts">
	import { onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Copy from '@lucide/svelte/icons/copy';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, getApikeys, putApikeys } from './access/access-api.ts';
	import ConfirmDialog from './access/ConfirmDialog.svelte';
	import SystemAccessDialog from './access/SystemAccessDialog.svelte';
	import { describeAccess, generateApiKey, parseAccess, toPickerSystems, type AccessSystems, type ApikeyRecord } from './access/access-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	let apikeys = $state<ApikeyRecord[]>([]);
	let baseline = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let revealed = $state<Record<number, boolean>>({});

	let accessOpen = $state(false);
	let accessIndex = $state(-1);
	let deleteOpen = $state(false);
	let deleteIndex = $state(-1);

	const systems = $derived(toPickerSystems(session.config?.systems));
	const dirty = $derived(!loading && JSON.stringify(apikeys) !== baseline);

	//* Server rows without an explicit order sort first (matches the old admin).
	function normalize(list: ApikeyRecord[]): ApikeyRecord[] {
		return [...list]
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map((row, index) => ({
				id: row.id,
				disabled: !!row.disabled,
				ident: row.ident ?? '',
				key: row.key ?? '',
				order: index + 1,
				systems: parseAccess(row.systems, 'none'),
				lastCallAt: row.lastCallAt ?? 0,
				noAudioAlertsEnabled: !!row.noAudioAlertsEnabled,
				noAudioThresholdMinutes: row.noAudioThresholdMinutes && row.noAudioThresholdMinutes > 0 ? row.noAudioThresholdMinutes : 10
			}));
	}

	async function load() {
		loading = true;
		try {
			apikeys = normalize(await getApikeys(session.client));
			baseline = JSON.stringify(apikeys);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load API keys'));
		} finally {
			loading = false;
		}
	}

	function validationError(): string | null {
		const seen = new Set<string>();
		for (const row of apikeys) {
			if (!row.ident.trim()) return 'Every API key needs a name.';
			if (!row.key.trim()) return `"${row.ident}" has no key value.`;
			if (seen.has(row.key)) return `Duplicate key value on "${row.ident}".`;
			seen.add(row.key);
			if (row.noAudioAlertsEnabled && (!Number.isFinite(row.noAudioThresholdMinutes) || row.noAudioThresholdMinutes < 1)) {
				return `No-audio threshold for "${row.ident}" must be at least 1 minute.`;
			}
		}
		return null;
	}

	async function save() {
		const problem = validationError();
		if (problem) {
			toast.error(problem);
			return;
		}
		saving = true;
		try {
			const payload = apikeys.map((row, index) => ({ ...row, ident: row.ident.trim(), key: row.key.trim(), order: index + 1 }));
			apikeys = normalize(await putApikeys(session.client, payload));
			baseline = JSON.stringify(apikeys);
			toast.success('API keys saved');
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to save API keys'));
		} finally {
			saving = false;
		}
	}

	function add() {
		apikeys.unshift({
			disabled: false,
			ident: '',
			key: generateApiKey(),
			order: 0,
			systems: '*',
			lastCallAt: 0,
			noAudioAlertsEnabled: false,
			noAudioThresholdMinutes: 10
		});
		revealed = { ...revealed, [0]: true };
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= apikeys.length) return;
		const [row] = apikeys.splice(index, 1);
		apikeys.splice(target, 0, row);
	}

	function maskKey(key: string): string {
		if (!key) return '';
		const parts = key.split('-');
		if (parts.length === 5) return `${parts[0]}-****-****-****-************`;
		return key.slice(0, 8) + '****************';
	}

	async function copyKey(key: string) {
		try {
			await navigator.clipboard.writeText(key);
			toast.success('API key copied');
		} catch {
			toast.error('Could not copy. Reveal the key and copy it manually.');
		}
	}

	function openAccess(index: number) {
		accessIndex = index;
		accessOpen = true;
	}

	function applyAccess(value: AccessSystems) {
		if (accessIndex >= 0 && accessIndex < apikeys.length) apikeys[accessIndex].systems = value;
	}

	function formatLastCall(ms: number): string {
		if (!ms) return 'Never';
		//* lastCallAt is epoch milliseconds.
		return DateTime.fromMillis(ms).toRelative() ?? 'Never';
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">API Keys</h2>
			<p class="text-sm text-muted-foreground">
				Keys that trunk-recorder (and other uploaders) use to push calls. Each key can be limited to specific systems and talkgroups.
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if dirty}
				<span class="text-sm text-muted-foreground">Unsaved changes</span>
			{/if}
			<Button variant="outline" size="sm" disabled={loading || saving} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" />
				Reload
			</Button>
			<Button variant="outline" size="sm" disabled={loading || saving} onclick={add}>
				<Plus data-icon="inline-start" />
				New key
			</Button>
			<Button size="sm" disabled={!dirty || saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{:else}
					<Save data-icon="inline-start" />
				{/if}
				Save
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex min-h-40 items-center justify-center">
			<Spinner class="size-6" />
		</div>
	{:else}
		<Card class="py-0">
			<CardContent class="px-0">
				{#if apikeys.length === 0}
					<p class="px-5 py-8 text-center text-sm text-muted-foreground">No API keys defined. Add one to let uploaders push calls.</p>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-16">Order</TableHead>
									<TableHead class="w-20 text-center">Enabled</TableHead>
									<TableHead class="min-w-40">Name</TableHead>
									<TableHead class="min-w-72">Key</TableHead>
									<TableHead class="min-w-44">Access</TableHead>
									<TableHead class="min-w-44">No-Upload Alerts</TableHead>
									<TableHead class="min-w-28">Last Upload</TableHead>
									<TableHead class="w-12"></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each apikeys as apikey, index (apikey.id ?? `new-${apikey.key}`)}
									<TableRow class={[apikey.disabled && 'opacity-60']}>
										<TableCell>
											<div class="flex items-center gap-0.5">
												<Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onclick={() => move(index, -1)}>
													<ArrowUp class="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Move down"
													disabled={index === apikeys.length - 1}
													onclick={() => move(index, 1)}
												>
													<ArrowDown class="size-3.5" />
												</Button>
											</div>
										</TableCell>
										<TableCell class="text-center">
											<Switch
												checked={!apikey.disabled}
												onCheckedChange={(checked: boolean) => (apikey.disabled = !checked)}
												aria-label={`Enable ${apikey.ident || 'API key'}`}
											/>
										</TableCell>
										<TableCell>
											<Input
												class="h-8"
												placeholder="e.g. recorder-1"
												aria-invalid={!apikey.ident.trim()}
												value={apikey.ident}
												oninput={(e: Event) => (apikey.ident = (e.currentTarget as HTMLInputElement).value)}
											/>
										</TableCell>
										<TableCell>
											<div class="flex items-center gap-1">
												{#if revealed[index]}
													<Input
														class="h-8 font-mono text-xs"
														aria-invalid={!apikey.key.trim()}
														value={apikey.key}
														oninput={(e: Event) => (apikey.key = (e.currentTarget as HTMLInputElement).value)}
													/>
												{:else}
													<span class="flex h-8 min-w-0 flex-1 items-center truncate font-mono text-xs text-muted-foreground">
														{maskKey(apikey.key) || 'No key'}
													</span>
												{/if}
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={revealed[index] ? 'Hide key' : 'Show key'}
													onclick={() => (revealed = { ...revealed, [index]: !revealed[index] })}
												>
													{#if revealed[index]}
														<EyeOff class="size-4" />
													{:else}
														<Eye class="size-4" />
													{/if}
												</Button>
												<Button variant="ghost" size="icon-sm" aria-label="Copy key" onclick={() => copyKey(apikey.key)}>
													<Copy class="size-4" />
												</Button>
												<Button variant="ghost" size="icon-sm" aria-label="Generate new key" onclick={() => (apikey.key = generateApiKey())}>
													<RefreshCw class="size-4" />
												</Button>
											</div>
										</TableCell>
										<TableCell>
											<Button variant="outline" size="sm" class="max-w-56 justify-start" onclick={() => openAccess(index)}>
												<KeyRound data-icon="inline-start" />
												<span class="truncate">{describeAccess(apikey.systems, systems)}</span>
											</Button>
										</TableCell>
										<TableCell>
											<div class="flex items-center gap-2">
												<Switch
													checked={apikey.noAudioAlertsEnabled}
													onCheckedChange={(checked: boolean) => (apikey.noAudioAlertsEnabled = checked)}
													aria-label={`No-upload alerts for ${apikey.ident || 'API key'}`}
												/>
												<Input
													type="number"
													min={1}
													class="h-8 w-20"
													disabled={!apikey.noAudioAlertsEnabled}
													value={String(apikey.noAudioThresholdMinutes)}
													onchange={(e: Event) => {
														const parsed = Number((e.currentTarget as HTMLInputElement).value);
														apikey.noAudioThresholdMinutes = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 10;
													}}
												/>
												<span class="text-xs text-muted-foreground">min</span>
											</div>
										</TableCell>
										<TableCell class="text-sm text-muted-foreground">
											{#if apikey.id === undefined}
												<Badge variant="outline">New</Badge>
											{:else}
												{formatLastCall(apikey.lastCallAt)}
											{/if}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon-sm"
												class="text-destructive"
												aria-label="Delete API key"
												onclick={() => {
													deleteIndex = index;
													deleteOpen = true;
												}}
											>
												<Trash2 class="size-4" />
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>
		<p class="text-xs text-muted-foreground">
			Changes (including deletions and reordering) are not applied until you press Save. Keys are generated in the browser as UUIDs.
		</p>
	{/if}
</div>

<SystemAccessDialog
	{session}
	bind:open={accessOpen}
	value={accessIndex >= 0 && accessIndex < apikeys.length ? apikeys[accessIndex].systems : '*'}
	title={`Access for ${accessIndex >= 0 && accessIndex < apikeys.length ? apikeys[accessIndex].ident || 'API key' : 'API key'}`}
	description="Calls uploaded with this key are only accepted for the selected systems and talkgroups."
	onsave={applyAccess}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Remove this API key?"
	description={deleteIndex >= 0 && deleteIndex < apikeys.length
		? `"${apikeys[deleteIndex].ident || 'Unnamed key'}" will be removed from the list. Press Save afterwards to apply the change; uploaders using it will be rejected.`
		: ''}
	confirmLabel="Remove"
	destructive
	onconfirm={() => {
		if (deleteIndex >= 0 && deleteIndex < apikeys.length) apikeys.splice(deleteIndex, 1);
		deleteOpen = false;
	}}
/>
