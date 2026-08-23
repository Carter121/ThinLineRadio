<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { AdminSystemFull, AdminUnit } from './systems-types.ts';
	import UnitDialog from './UnitDialog.svelte';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
	}

	let { page, system }: Props = $props();

	type SortKey = 'ref' | 'label' | 'order';
	const PAGE_SIZES = [25, 50, 100, 250];

	let search = $state('');
	let sortKey = $state<SortKey>('ref');
	let pageSize = $state(50);
	let pageIndex = $state(0);
	const selected = new SvelteSet<number>();

	let editing = $state<AdminUnit | null>(null);
	let dialogOpen = $state(false);
	let deleteIds = $state<number[]>([]);
	let deleteOpen = $state(false);
	let busy = $state(false);

	const filtered = $derived.by(() => {
		const term = search.trim().toLowerCase();
		if (!term) return system.units;
		return system.units.filter(
			(u) => String(u.unitRef ?? '').includes(term) || u.label.toLowerCase().includes(term) || (u.unitFrom && u.unitTo && `${u.unitFrom}-${u.unitTo}`.includes(term))
		);
	});

	const sorted = $derived.by(() => {
		const rows = [...filtered];
		switch (sortKey) {
			case 'label':
				return rows.sort((a, b) => a.label.localeCompare(b.label) || (a.unitRef ?? 0) - (b.unitRef ?? 0));
			case 'order':
				return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id);
			default:
				return rows.sort((a, b) => (a.unitRef ?? a.unitFrom ?? 0) - (b.unitRef ?? b.unitFrom ?? 0) || a.id - b.id);
		}
	});

	const pageCount = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
	const clampedPage = $derived(Math.min(pageIndex, pageCount - 1));
	const pageRows = $derived(sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize));

	$effect(() => {
		void search;
		void sortKey;
		void pageSize;
		pageIndex = 0;
	});

	$effect(() => {
		const ids = new Set(system.units.map((u) => u.id));
		for (const id of selected) if (!ids.has(id)) selected.delete(id);
	});

	const allPageSelected = $derived(pageRows.length > 0 && pageRows.every((u) => selected.has(u.id)));

	function togglePage(checked: boolean) {
		for (const u of pageRows) {
			if (checked) selected.add(u.id);
			else selected.delete(u.id);
		}
	}

	function openCreate() {
		editing = null;
		dialogOpen = true;
	}

	function openEdit(unit: AdminUnit) {
		editing = unit;
		dialogOpen = true;
	}

	function askDelete(ids: number[]) {
		deleteIds = ids;
		deleteOpen = true;
	}

	async function confirmDelete() {
		busy = true;
		try {
			const count = await page.api.deleteUnits(system.id, deleteIds);
			page.removeUnits(system.id, deleteIds);
			for (const id of deleteIds) selected.delete(id);
			toast.success(`Deleted ${count} units`);
			deleteOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete units');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-3 pt-2">
	<div class="flex flex-wrap items-center gap-2">
		<Input placeholder="Search unit ID or label" bind:value={search} class="h-8 w-full sm:w-64" />
		<Select type="single" value={sortKey} onValueChange={(v) => (sortKey = v as SortKey)}>
			<SelectTrigger size="sm" class="w-36">Sort: {sortKey === 'ref' ? 'Unit ID' : sortKey === 'label' ? 'Label' : 'Order'}</SelectTrigger>
			<SelectContent>
				<SelectItem value="ref" label="Unit ID" />
				<SelectItem value="label" label="Label" />
				<SelectItem value="order" label="Order" />
			</SelectContent>
		</Select>
		<div class="ml-auto flex items-center gap-2">
			{#if selected.size > 0}
				<span class="text-sm text-muted-foreground">{selected.size} selected</span>
				<Button variant="destructive" size="sm" onclick={() => askDelete([...selected])} disabled={busy}>
					<Trash2 data-icon="inline-start" />
					Delete
				</Button>
			{/if}
			<Button size="sm" onclick={openCreate}>
				<Plus data-icon="inline-start" />
				Add unit
			</Button>
		</div>
	</div>

	{#if system.units.length === 0}
		<p class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
			No units yet. Units map radio IDs to friendly labels; enable auto-populate units in Settings to collect them from traffic.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="w-8"><Checkbox checked={allPageSelected} onCheckedChange={(v) => togglePage(!!v)} aria-label="Select page" /></TableHead>
						<TableHead class="w-32">Unit ID</TableHead>
						<TableHead>Label</TableHead>
						<TableHead class="hidden w-40 sm:table-cell">Range</TableHead>
						<TableHead class="w-20"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each pageRows as unit (unit.id)}
						<TableRow class="cursor-pointer" onclick={() => openEdit(unit)}>
							<TableCell onclick={(e: MouseEvent) => e.stopPropagation()}>
								<Checkbox checked={selected.has(unit.id)} onCheckedChange={(v) => (v ? selected.add(unit.id) : selected.delete(unit.id))} aria-label="Select {unit.label}" />
							</TableCell>
							<TableCell class="font-mono text-xs">{unit.unitRef ?? '-'}</TableCell>
							<TableCell class="font-medium">{unit.label}</TableCell>
							<TableCell class="hidden text-sm text-muted-foreground sm:table-cell">{unit.unitFrom && unit.unitTo ? `${unit.unitFrom} to ${unit.unitTo}` : '-'}</TableCell>
							<TableCell onclick={(e: MouseEvent) => e.stopPropagation()}>
								<div class="flex justify-end gap-1">
									<Button variant="ghost" size="icon-sm" aria-label="Edit {unit.label}" onclick={() => openEdit(unit)}><Pencil /></Button>
									<Button variant="ghost" size="icon-sm" aria-label="Delete {unit.label}" onclick={() => askDelete([unit.id])}><Trash2 /></Button>
								</div>
							</TableCell>
						</TableRow>
					{:else}
						<TableRow>
							<TableCell colspan={5} class="py-6 text-center text-sm text-muted-foreground">No units match the search.</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<span>{sorted.length === system.units.length ? `${sorted.length} units` : `${sorted.length} of ${system.units.length} units`}</span>
			<div class="ml-auto flex items-center gap-2">
				<Select type="single" value={String(pageSize)} onValueChange={(v) => (pageSize = Number(v))}>
					<SelectTrigger size="sm" class="w-28">{pageSize} per page</SelectTrigger>
					<SelectContent>
						{#each PAGE_SIZES as size (size)}
							<SelectItem value={String(size)} label={`${size} per page`} />
						{/each}
					</SelectContent>
				</Select>
				<Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={clampedPage === 0} onclick={() => (pageIndex = clampedPage - 1)}>
					<ChevronLeft />
				</Button>
				<span class="tabular-nums">Page {clampedPage + 1} of {pageCount}</span>
				<Button variant="outline" size="icon-sm" aria-label="Next page" disabled={clampedPage >= pageCount - 1} onclick={() => (pageIndex = clampedPage + 1)}>
					<ChevronRight />
				</Button>
			</div>
		</div>
	{/if}
</div>

{#if dialogOpen}
	<UnitDialog {page} {system} unit={editing} bind:open={dialogOpen} />
{/if}

<AlertDialog bind:open={deleteOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete {deleteIds.length === 1 ? 'unit' : `${deleteIds.length} units`}?</AlertDialogTitle>
			<AlertDialogDescription>Calls keep their raw unit IDs; only the friendly labels are removed.</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={confirmDelete} disabled={busy}>Delete</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
