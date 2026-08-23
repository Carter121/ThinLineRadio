<script lang="ts">
	import { onMount } from 'svelte';
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
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, getDownstreams, putDownstreams } from './access/access-api.ts';
	import ConfirmDialog from './access/ConfirmDialog.svelte';
	import SystemAccessDialog from './access/SystemAccessDialog.svelte';
	import { describeAccess, parseAccess, toPickerSystems, type AccessSystems, type DownstreamRecord } from './access/access-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	let downstreams = $state<DownstreamRecord[]>([]);
	let baseline = $state('');
	let loading = $state(true);
	let saving = $state(false);

	let accessOpen = $state(false);
	let accessIndex = $state(-1);
	let deleteOpen = $state(false);
	let deleteIndex = $state(-1);

	const systems = $derived(toPickerSystems(session.config?.systems));
	const dirty = $derived(!loading && JSON.stringify(downstreams) !== baseline);

	function normalize(list: DownstreamRecord[]): DownstreamRecord[] {
		return [...list]
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map((row, index) => ({
				id: row.id,
				apikey: row.apikey ?? '',
				disabled: !!row.disabled,
				name: row.name ?? '',
				order: index + 1,
				systems: parseAccess(row.systems, 'none'),
				url: row.url ?? ''
			}));
	}

	async function load() {
		loading = true;
		try {
			downstreams = normalize(await getDownstreams(session.client));
			baseline = JSON.stringify(downstreams);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load downstreams'));
		} finally {
			loading = false;
		}
	}

	function rowLabel(row: DownstreamRecord): string {
		return row.name.trim() || row.url.trim() || 'Unnamed downstream';
	}

	function urlValid(url: string): boolean {
		return /^https?:\/\/.+$/.test(url.trim());
	}

	function validationError(): string | null {
		const keys = new Set<string>();
		const urls = new Set<string>();
		for (const row of downstreams) {
			const url = row.url.trim();
			const apikey = row.apikey.trim();
			if (!url) return `${rowLabel(row)} needs a URL.`;
			if (!urlValid(url)) return `${rowLabel(row)} has an invalid URL (must start with http:// or https://).`;
			if (urls.has(url)) return `Duplicate URL: ${url}.`;
			urls.add(url);
			if (!apikey) return `${rowLabel(row)} needs an API key.`;
			if (keys.has(apikey)) return `Duplicate API key on ${rowLabel(row)}.`;
			keys.add(apikey);
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
			const payload = downstreams.map((row, index) => ({
				...row,
				name: row.name.trim(),
				url: row.url.trim(),
				apikey: row.apikey.trim(),
				order: index + 1
			}));
			downstreams = normalize(await putDownstreams(session.client, payload));
			baseline = JSON.stringify(downstreams);
			toast.success('Downstreams saved');
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to save downstreams'));
		} finally {
			saving = false;
		}
	}

	function add() {
		downstreams.unshift({ apikey: '', disabled: false, name: '', order: 0, systems: '*', url: '' });
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= downstreams.length) return;
		const [row] = downstreams.splice(index, 1);
		downstreams.splice(target, 0, row);
	}

	function openAccess(index: number) {
		accessIndex = index;
		accessOpen = true;
	}

	function applyAccess(value: AccessSystems) {
		if (accessIndex >= 0 && accessIndex < downstreams.length) downstreams[accessIndex].systems = value;
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Downstreams</h2>
			<p class="text-sm text-muted-foreground">
				Other ThinLine Radio / Rdio Scanner servers that calls are forwarded to. The API key must exist on the receiving server.
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
				New downstream
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
				{#if downstreams.length === 0}
					<p class="px-5 py-8 text-center text-sm text-muted-foreground">No downstreams defined.</p>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-16">Order</TableHead>
									<TableHead class="w-20 text-center">Enabled</TableHead>
									<TableHead class="min-w-36">Name</TableHead>
									<TableHead class="min-w-64">URL</TableHead>
									<TableHead class="min-w-64">API Key</TableHead>
									<TableHead class="min-w-44">Access</TableHead>
									<TableHead class="w-12"></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each downstreams as downstream, index (downstream.id ?? `new-${index}`)}
									<TableRow class={[downstream.disabled && 'opacity-60']}>
										<TableCell>
											<div class="flex items-center gap-0.5">
												<Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onclick={() => move(index, -1)}>
													<ArrowUp class="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Move down"
													disabled={index === downstreams.length - 1}
													onclick={() => move(index, 1)}
												>
													<ArrowDown class="size-3.5" />
												</Button>
											</div>
										</TableCell>
										<TableCell class="text-center">
											<Switch
												checked={!downstream.disabled}
												onCheckedChange={(checked: boolean) => (downstream.disabled = !checked)}
												aria-label={`Enable ${rowLabel(downstream)}`}
											/>
										</TableCell>
										<TableCell>
											<Input
												class="h-8"
												placeholder="Name (optional)"
												value={downstream.name}
												oninput={(e: Event) => (downstream.name = (e.currentTarget as HTMLInputElement).value)}
											/>
										</TableCell>
										<TableCell>
											<Input
												class="h-8 font-mono text-xs"
												placeholder="https://example.com"
												aria-invalid={!urlValid(downstream.url)}
												value={downstream.url}
												oninput={(e: Event) => (downstream.url = (e.currentTarget as HTMLInputElement).value)}
											/>
										</TableCell>
										<TableCell>
											<Input
												class="h-8 font-mono text-xs"
												placeholder="API key on the remote server"
												aria-invalid={!downstream.apikey.trim()}
												value={downstream.apikey}
												oninput={(e: Event) => (downstream.apikey = (e.currentTarget as HTMLInputElement).value)}
											/>
										</TableCell>
										<TableCell>
											<Button variant="outline" size="sm" class="max-w-56 justify-start" onclick={() => openAccess(index)}>
												<KeyRound data-icon="inline-start" />
												<span class="truncate">{describeAccess(downstream.systems, systems)}</span>
											</Button>
											{#if downstream.id === undefined}
												<Badge variant="outline" class="ml-2">New</Badge>
											{/if}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon-sm"
												class="text-destructive"
												aria-label="Delete downstream"
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
		<p class="text-xs text-muted-foreground">Changes (including deletions and reordering) are not applied until you press Save.</p>
	{/if}
</div>

<SystemAccessDialog
	{session}
	bind:open={accessOpen}
	value={accessIndex >= 0 && accessIndex < downstreams.length ? downstreams[accessIndex].systems : '*'}
	title={`Access for ${accessIndex >= 0 && accessIndex < downstreams.length ? rowLabel(downstreams[accessIndex]) : 'downstream'}`}
	description="Only calls from the selected systems and talkgroups are forwarded to this downstream."
	onsave={applyAccess}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Remove this downstream?"
	description={deleteIndex >= 0 && deleteIndex < downstreams.length
		? `${rowLabel(downstreams[deleteIndex])} will be removed from the list. Press Save afterwards to apply the change.`
		: ''}
	confirmLabel="Remove"
	destructive
	onconfirm={() => {
		if (deleteIndex >= 0 && deleteIndex < downstreams.length) downstreams.splice(deleteIndex, 1);
		deleteOpen = false;
	}}
/>
