<script lang="ts">
	//* Shared editor for whole-list PUT resources made of {id, label, order}
	//* rows (tags, talkgroup groups). Edits are local until Save; the parent
	//* supplies load/save, usage counts, and the delete policy.
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import BrushCleaning from '@lucide/svelte/icons/brush-cleaning';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { sortByOrder } from './radio-api.ts';
	import { TAG_COLOR_OPTIONS, type AdminLabelRow } from './radio-types.ts';

	export interface DeletePolicy {
		mode: 'ok' | 'confirm' | 'block';
		message?: string;
	}

	interface Props {
		noun: string;
		nounPlural: string;
		load: () => Promise<AdminLabelRow[]>;
		save: (rows: AdminLabelRow[]) => Promise<AdminLabelRow[]>;
		//* Talkgroup counts keyed by row id, derived from the live config.
		usage: Map<number, number>;
		showColor?: boolean;
		deletePolicy: (row: AdminLabelRow, count: number) => DeletePolicy;
	}

	let { noun, nounPlural, load, save, usage, showColor = false, deletePolicy }: Props = $props();

	interface EditableRow {
		key: number;
		id?: number;
		label: string;
		color: string;
	}

	let nextKey = 1;
	let rows = $state<EditableRow[]>([]);
	let baseline = $state('');
	let baselineIds = $state<number[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let filter = $state('');

	let dragKey = $state<number | null>(null);
	let dragArmedKey = $state<number | null>(null);
	let dropKey = $state<number | null>(null);

	interface DialogState {
		title: string;
		message: string;
		confirmLabel?: string;
		onConfirm?: () => void;
	}
	let dialog = $state<DialogState | null>(null);

	//* Row sequence is part of the serialization, so reorders count as edits.
	const serialize = (list: EditableRow[]) => JSON.stringify(list.map((row) => [row.id ?? null, row.label, row.color]));
	const dirty = $derived(!loading && serialize(rows) !== baseline);

	const filterActive = $derived(filter.trim().length > 0);
	const visibleRows = $derived.by(() => {
		const needle = filter.trim().toLowerCase();
		return needle ? rows.filter((row) => row.label.toLowerCase().includes(needle)) : rows;
	});

	const removedIds = $derived.by(() => {
		const present = new Set(rows.map((row) => row.id).filter((id): id is number => id != null));
		return baselineIds.filter((id) => !present.has(id));
	});
	const addedCount = $derived(rows.filter((row) => row.id == null).length);
	const unusedRows = $derived(rows.filter((row) => row.id != null && (usage.get(row.id) ?? 0) === 0));

	const emptyCount = $derived(rows.filter((row) => row.label.trim().length === 0).length);
	const duplicateLabels = $derived.by(() => {
		const seen = new Set<string>();
		const dupes = new Set<string>();
		for (const row of rows) {
			const label = row.label.trim();
			if (!label) continue;
			if (seen.has(label)) dupes.add(label);
			seen.add(label);
		}
		return dupes;
	});
	const invalid = $derived(emptyCount > 0 || duplicateLabels.size > 0);

	function adopt(list: AdminLabelRow[]) {
		rows = sortByOrder(list).map((row) => ({ key: nextKey++, id: row.id, label: row.label ?? '', color: row.color ?? '' }));
		baseline = serialize(rows);
		baselineIds = rows.map((row) => row.id).filter((id): id is number => id != null);
	}

	async function reload() {
		loading = true;
		try {
			adopt(await load());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to load ${nounPlural}`);
		} finally {
			loading = false;
		}
	}

	//* Orders are rewritten 1..n from the displayed sequence so the server
	//* persists exactly what is shown. New rows are sent without an id.
	function payload(list: EditableRow[]): AdminLabelRow[] {
		return list.map((row, index) => {
			const out: AdminLabelRow = { label: row.label.trim(), order: index + 1 };
			if (row.id != null) out.id = row.id;
			if (showColor && row.color) out.color = row.color;
			return out;
		});
	}

	async function commit() {
		if (invalid) {
			toast.error(emptyCount > 0 ? `Every ${noun} needs a label.` : `Labels must be unique: ${[...duplicateLabels].join(', ')}`);
			return;
		}
		//* Re-check removals against the live usage counts at save time.
		const blocked = removedIds.filter((id) => deletePolicy({ id, label: '' }, usage.get(id) ?? 0).mode === 'block');
		if (blocked.length > 0) {
			toast.error(`Cannot delete ${blocked.length} ${blocked.length === 1 ? noun : nounPlural} still assigned to talkgroups. Reload to restore.`);
			return;
		}
		saving = true;
		try {
			const full = payload(rows);
			//* The server skips all deletions when any row in the PUT has no id,
			//* so removals go in a first PUT without the new rows.
			if (removedIds.length > 0 && addedCount > 0) {
				await save(full.filter((row) => row.id != null));
			}
			adopt(await save(full));
			toast.success(`${capitalize(nounPlural)} saved`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to save ${nounPlural}`);
		} finally {
			saving = false;
		}
	}

	function capitalize(text: string): string {
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	async function addRow() {
		filter = '';
		const key = nextKey++;
		rows.unshift({ key, label: '', color: '' });
		await tick();
		document.getElementById(`label-row-${key}`)?.focus();
	}

	function removeRow(row: EditableRow) {
		const index = rows.findIndex((r) => r.key === row.key);
		if (index >= 0) rows.splice(index, 1);
	}

	function requestDelete(row: EditableRow) {
		const count = row.id != null ? (usage.get(row.id) ?? 0) : 0;
		const policy = row.id == null ? { mode: 'ok' as const } : deletePolicy({ id: row.id, label: row.label }, count);
		if (policy.mode === 'block') {
			dialog = { title: `Cannot delete ${noun}`, message: policy.message ?? '' };
		} else if (policy.mode === 'confirm') {
			dialog = {
				title: `Remove ${noun} "${row.label}"?`,
				message: policy.message ?? '',
				confirmLabel: 'Remove',
				onConfirm: () => removeRow(row)
			};
		} else {
			removeRow(row);
		}
	}

	function cleanupUnused() {
		const targets = unusedRows;
		if (targets.length === 0) return;
		dialog = {
			title: `Remove ${targets.length} unused ${targets.length === 1 ? noun : nounPlural}?`,
			message: `${targets.map((row) => row.label || '(blank)').join(', ')}. They are deleted when you save.`,
			confirmLabel: 'Remove',
			onConfirm: () => {
				const keys = new Set(targets.map((row) => row.key));
				rows = rows.filter((row) => !keys.has(row.key));
			}
		};
	}

	function move(fromIndex: number, toIndex: number) {
		if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= rows.length) return;
		const [row] = rows.splice(fromIndex, 1);
		rows.splice(toIndex, 0, row);
	}

	function indexOfKey(key: number): number {
		return rows.findIndex((row) => row.key === key);
	}

	function onDrop(targetKey: number) {
		if (dragKey != null) move(indexOfKey(dragKey), indexOfKey(targetKey));
		dragKey = null;
		dropKey = null;
		dragArmedKey = null;
	}

	function colorLabel(value: string): string {
		return TAG_COLOR_OPTIONS.find((option) => option.value === value)?.label ?? value;
	}

	onMount(() => {
		void reload();
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<div class="relative">
			<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input class="h-8 w-56 pl-8" placeholder={`Filter ${nounPlural}`} bind:value={filter} />
		</div>
		<Button variant="outline" size="sm" disabled={loading} onclick={() => void addRow()}>
			<Plus data-icon="inline-start" />
			New {noun}
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={loading || unusedRows.length === 0}
			title={`Remove ${nounPlural} not assigned to any talkgroup`}
			onclick={cleanupUnused}
		>
			<BrushCleaning data-icon="inline-start" />
			Cleanup unused
			{#if unusedRows.length > 0}
				<Badge variant="secondary" class="ml-1">{unusedRows.length}</Badge>
			{/if}
		</Button>
		<div class="ml-auto flex items-center gap-2">
			{#if dirty}
				<span class="text-sm text-muted-foreground">
					Unsaved changes{#if removedIds.length > 0}, {removedIds.length} to delete{/if}{#if addedCount > 0}, {addedCount} new{/if}
				</span>
			{/if}
			<Button variant="outline" size="sm" disabled={loading || saving} onclick={() => void reload()}>
				<RotateCcw data-icon="inline-start" />
				{dirty ? 'Discard' : 'Reload'}
			</Button>
			<Button size="sm" disabled={!dirty || saving || invalid} onclick={() => void commit()}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{:else}
					<Save data-icon="inline-start" />
				{/if}
				Save
			</Button>
		</div>
	</div>

	{#if invalid && !loading}
		<p class="text-sm text-destructive">
			{#if emptyCount > 0}Every {noun} needs a label.{/if}
			{#if duplicateLabels.size > 0}Duplicate labels: {[...duplicateLabels].join(', ')}.{/if}
		</p>
	{/if}

	<Card class="py-0">
		<CardContent class="px-0">
			{#if loading}
				<div class="flex min-h-40 items-center justify-center">
					<Spinner class="size-6" />
				</div>
			{:else if rows.length === 0}
				<div class="flex flex-col items-center gap-2 py-10 text-center">
					<p class="text-sm text-muted-foreground">No {nounPlural} defined.</p>
					<Button size="sm" onclick={() => void addRow()}>
						<Plus data-icon="inline-start" />
						Add first {noun}
					</Button>
				</div>
			{:else if visibleRows.length === 0}
				<p class="py-10 text-center text-sm text-muted-foreground">No {nounPlural} match "{filter}".</p>
			{:else}
				<div class="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead class="w-20"></TableHead>
								{#if showColor}
									<TableHead class="w-36">Color</TableHead>
								{/if}
								<TableHead>Label</TableHead>
								<TableHead class="w-36">Usage</TableHead>
								<TableHead class="w-16 text-right">ID</TableHead>
								<TableHead class="w-12"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each visibleRows as row (row.key)}
								{@const index = indexOfKey(row.key)}
								{@const count = row.id != null ? (usage.get(row.id) ?? 0) : 0}
								<TableRow
									class={[dragKey === row.key && 'opacity-50', dropKey === row.key && dragKey !== row.key && 'border-t-2 border-t-primary']}
									draggable={dragArmedKey === row.key}
									ondragstart={(event) => {
										dragKey = row.key;
										if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
									}}
									ondragover={(event) => {
										if (dragKey == null) return;
										event.preventDefault();
										dropKey = row.key;
									}}
									ondragleave={() => {
										if (dropKey === row.key) dropKey = null;
									}}
									ondrop={(event) => {
										event.preventDefault();
										onDrop(row.key);
									}}
									ondragend={() => {
										dragKey = null;
										dropKey = null;
										dragArmedKey = null;
									}}
								>
									<TableCell class="py-1">
										<div class="flex items-center gap-0.5">
											<button
												type="button"
												tabindex={-1}
												class={[
													'inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground',
													filterActive ? 'opacity-30' : 'cursor-grab hover:bg-muted active:cursor-grabbing'
												]}
												title={filterActive ? 'Clear the filter to reorder' : 'Drag to reorder'}
												aria-label="Drag to reorder"
												onpointerdown={() => {
													if (!filterActive) dragArmedKey = row.key;
												}}
												onpointerup={() => {
													if (dragKey == null) dragArmedKey = null;
												}}
											>
												<GripVertical class="size-4" />
											</button>
											<Button
												variant="ghost"
												size="icon-sm"
												class="size-6"
												aria-label="Move up"
												disabled={filterActive || index <= 0}
												onclick={() => move(index, index - 1)}
											>
												<ArrowUp class="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												class="size-6"
												aria-label="Move down"
												disabled={filterActive || index >= rows.length - 1}
												onclick={() => move(index, index + 1)}
											>
												<ArrowDown class="size-3.5" />
											</Button>
										</div>
									</TableCell>
									{#if showColor}
										<TableCell class="py-1">
											<Select type="single" value={row.color} onValueChange={(value) => (row.color = value)}>
												<SelectTrigger size="sm" class="w-32">
													<span class="flex items-center gap-2">
														<span class="size-3 shrink-0 rounded-full border border-border" style:background-color={row.color || 'transparent'}></span>
														{colorLabel(row.color)}
													</span>
												</SelectTrigger>
												<SelectContent>
													{#each TAG_COLOR_OPTIONS as option (option.value)}
														<SelectItem value={option.value} label={option.label}>
															<span class="size-3 shrink-0 rounded-full border border-border" style:background-color={option.value || 'transparent'}></span>
															{option.label}
														</SelectItem>
													{/each}
												</SelectContent>
											</Select>
										</TableCell>
									{/if}
									<TableCell class="py-1">
										<Input
											id={`label-row-${row.key}`}
											class="h-8 max-w-sm"
											placeholder={`${capitalize(noun)} label`}
											aria-invalid={row.label.trim().length === 0 || duplicateLabels.has(row.label.trim()) ? true : undefined}
											bind:value={row.label}
										/>
									</TableCell>
									<TableCell class="py-1">
										{#if row.id == null}
											<Badge variant="outline">New</Badge>
										{:else if count === 0}
											<Badge variant="outline" class="text-muted-foreground">Unused</Badge>
										{:else}
											<Badge variant="secondary">{count} {count === 1 ? 'talkgroup' : 'talkgroups'}</Badge>
										{/if}
									</TableCell>
									<TableCell class="py-1 text-right font-mono text-xs text-muted-foreground">{row.id ?? ''}</TableCell>
									<TableCell class="py-1">
										<Button variant="ghost" size="icon-sm" class="text-destructive" aria-label={`Delete ${noun}`} onclick={() => requestDelete(row)}>
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
</div>

<AlertDialog.Root open={dialog != null} onOpenChange={(open) => !open && (dialog = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{dialog?.title}</AlertDialog.Title>
			<AlertDialog.Description>{dialog?.message}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			{#if dialog?.onConfirm}
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					onclick={() => {
						dialog?.onConfirm?.();
						dialog = null;
					}}
				>
					{dialog.confirmLabel ?? 'Confirm'}
				</AlertDialog.Action>
			{:else}
				<AlertDialog.Action onclick={() => (dialog = null)}>OK</AlertDialog.Action>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
