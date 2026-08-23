<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import FolderSearch from '@lucide/svelte/icons/folder-search';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import type { AdminSystem } from '$lib/core/admin-types.ts';
	import DirwatchEditor from './monitoring/DirwatchEditor.svelte';
	import { fetchDirwatch, saveDirwatch } from './monitoring/monitoring-api.ts';
	import {
		dirwatchShows,
		dirwatchTypeLabel,
		newDirwatchEntry,
		normalizeDirwatch,
		validateDirwatch,
		type DirwatchEntry
	} from './monitoring/monitoring-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	let list = $state<DirwatchEntry[]>([]);
	let baseline = $state('');
	let loading = $state(true);
	let saving = $state(false);

	let editorOpen = $state(false);
	let editorKey = $state(0);
	let editingIndex = $state<number | null>(null);
	let deletingIndex = $state<number | null>(null);

	const systems = $derived<AdminSystem[]>(session.config?.systems ?? []);
	const dirty = $derived(!loading && JSON.stringify(list) !== baseline);
	const editingEntry = $derived(editingIndex === null ? newDirwatchEntry() : (list[editingIndex] ?? null));
	const otherEntries = $derived(list.filter((_, index) => index !== editingIndex));
	//* Per-row validation so broken entries are flagged before Save is attempted.
	const rowErrors = $derived(
		list.map((entry, index) =>
			validateDirwatch(
				entry,
				list.filter((_, i) => i !== index)
			)
		)
	);
	const invalidCount = $derived(rowErrors.filter((errors) => Object.keys(errors).length > 0).length);

	function sortByOrder(entries: DirwatchEntry[]): DirwatchEntry[] {
		return [...entries].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}

	function adopt(entries: DirwatchEntry[]) {
		list = sortByOrder(entries).map((entry) => ({ ...entry }));
		baseline = JSON.stringify(list);
	}

	async function load() {
		loading = true;
		try {
			adopt(await fetchDirwatch(session.client));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to load dirwatch config');
		} finally {
			loading = false;
		}
	}

	//* The config socket pushes the list on every change; only adopt it while
	//* there are no local edits so a push never clobbers in-progress work.
	$effect(() => {
		const incoming = session.config?.dirwatch as DirwatchEntry[] | undefined;
		untrack(() => {
			if (incoming && !loading && !dirty) adopt(incoming);
		});
	});

	async function save() {
		if (invalidCount > 0) {
			toast.error('Fix the flagged entries before saving.');
			return;
		}
		saving = true;
		try {
			const payload = list.map((entry, index) => normalizeDirwatch(entry, index + 1));
			adopt(await saveDirwatch(session.client, payload));
			toast.success('Dirwatch saved; watchers restarted');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save dirwatch');
		} finally {
			saving = false;
		}
	}

	function openNew() {
		editingIndex = null;
		editorKey += 1;
		editorOpen = true;
	}

	function openEdit(index: number) {
		editingIndex = index;
		editorKey += 1;
		editorOpen = true;
	}

	function applyEdit(entry: DirwatchEntry) {
		if (editingIndex === null) list.push(entry);
		else list[editingIndex] = entry;
	}

	function move(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= list.length) return;
		const [entry] = list.splice(index, 1);
		list.splice(target, 0, entry);
	}

	function confirmDelete() {
		if (deletingIndex !== null) list.splice(deletingIndex, 1);
		deletingIndex = null;
	}

	function systemLabel(entry: DirwatchEntry): string {
		if (!entry.systemId) return '';
		return systems.find((s) => s.id === entry.systemId)?.label ?? `System #${entry.systemId}`;
	}

	function talkgroupLabel(entry: DirwatchEntry): string {
		if (!entry.talkgroupId) return '';
		const system = systems.find((s) => s.id === entry.systemId);
		const tg = system?.talkgroups?.find((t) => t.id === entry.talkgroupId);
		return tg?.label || tg?.name || `Talkgroup #${entry.talkgroupId}`;
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Dirwatch</h2>
			<p class="text-sm text-muted-foreground">
				Monitor local directories for new audio files and ingest them as calls. Edits apply to the list below; Save writes the whole list and restarts
				the watchers.
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
			<Button variant="outline" size="sm" disabled={loading} onclick={openNew}>
				<Plus data-icon="inline-start" />
				New dirwatch
			</Button>
			<Button size="sm" disabled={!dirty || saving || invalidCount > 0} onclick={save}>
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
	{:else if list.length === 0}
		<Card class="py-0">
			<CardContent class="flex flex-col items-center gap-3 px-5 py-10 text-center">
				<FolderSearch class="size-8 text-muted-foreground" />
				<div>
					<p class="text-sm font-medium">No directory watchers configured</p>
					<p class="text-xs text-muted-foreground">
						Add one to ingest recordings from trunk-recorder, SDR Trunk, DSDPlus or a custom file name mask.
					</p>
				</div>
				<Button size="sm" onclick={openNew}>
					<Plus data-icon="inline-start" />
					New dirwatch
				</Button>
			</CardContent>
		</Card>
	{:else}
		<Card class="py-0">
			<CardContent class="px-0 py-0">
				<div class="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead class="w-20">Order</TableHead>
								<TableHead>Directory</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Target</TableHead>
								<TableHead>Options</TableHead>
								<TableHead class="w-24 text-center">Enabled</TableHead>
								<TableHead class="w-24"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each list as entry, index (entry.id ?? `new-${index}`)}
								{@const errors = rowErrors[index] ?? {}}
								{@const hasErrors = Object.keys(errors).length > 0}
								<TableRow class={entry.disabled ? 'opacity-60' : undefined}>
									<TableCell>
										<div class="flex items-center gap-0.5">
											<Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onclick={() => move(index, -1)}>
												<ArrowUp class="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label="Move down"
												disabled={index === list.length - 1}
												onclick={() => move(index, 1)}
											>
												<ArrowDown class="size-3.5" />
											</Button>
										</div>
									</TableCell>
									<TableCell>
										<div class="flex items-center gap-2">
											{#if hasErrors}
												<TriangleAlert class="size-4 shrink-0 text-destructive" aria-label="Invalid entry" />
											{/if}
											<div class="min-w-0">
												<div class="font-mono text-xs break-all">{entry.directory || 'New dirwatch'}</div>
												{#if hasErrors}
													<div class="text-xs text-destructive">{Object.values(errors).join('. ')}</div>
												{/if}
											</div>
										</div>
									</TableCell>
									<TableCell><Badge variant="secondary">{dirwatchTypeLabel(entry.type)}</Badge></TableCell>
									<TableCell class="text-xs">
										{#if dirwatchShows(entry.type, 'system')}
											{#if entry.systemId || entry.talkgroupId}
												<div>{systemLabel(entry)}</div>
												<div class="text-muted-foreground">{talkgroupLabel(entry)}</div>
											{:else}
												<span class="text-muted-foreground">From mask</span>
											{/if}
										{:else}
											<span class="text-muted-foreground">From metadata</span>
										{/if}
									</TableCell>
									<TableCell class="text-xs text-muted-foreground">
										<div class="flex flex-wrap gap-x-3 gap-y-0.5">
											{#if dirwatchShows(entry.type, 'extension')}<span>.{entry.extension || 'wav'}</span>{/if}
											{#if dirwatchShows(entry.type, 'mask') && entry.mask}<span class="font-mono">{entry.mask}</span>{/if}
											{#if dirwatchShows(entry.type, 'delay')}<span>{entry.delay ?? 2000} ms</span>{/if}
											<span>{entry.deleteAfter ? 'Delete after ingest' : 'Keep files'}</span>
										</div>
									</TableCell>
									<TableCell class="text-center">
										<Switch
											checked={!entry.disabled}
											onCheckedChange={(checked: boolean) => (entry.disabled = !checked)}
											aria-label={`Enable ${entry.directory || 'dirwatch'}`}
										/>
									</TableCell>
									<TableCell>
										<div class="flex justify-end gap-0.5">
											<Button variant="ghost" size="icon-sm" aria-label="Edit dirwatch" onclick={() => openEdit(index)}>
												<Pencil class="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												class="text-destructive"
												aria-label="Delete dirwatch"
												onclick={() => (deletingIndex = index)}
											>
												<Trash2 class="size-3.5" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

{#key editorKey}
	<DirwatchEditor bind:open={editorOpen} entry={editingEntry} others={otherEntries} {systems} onsave={applyEdit} />
{/key}

<AlertDialog.Root open={deletingIndex !== null} onOpenChange={(isOpen) => (isOpen ? undefined : (deletingIndex = null))}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this dirwatch?</AlertDialog.Title>
			<AlertDialog.Description>
				{deletingIndex !== null ? list[deletingIndex]?.directory || 'This watcher' : 'This watcher'} is removed from the list. Nothing changes on the server
				until you Save.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={confirmDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
