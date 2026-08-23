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
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ArrowDownAZ from '@lucide/svelte/icons/arrow-down-a-z';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { TalkgroupBulkPatch } from './systems-api.ts';
	import type { AdminSystemFull, AdminTalkgroup } from './systems-types.ts';
	import TalkgroupDialog from './TalkgroupDialog.svelte';
	import MultiSelect from './MultiSelect.svelte';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
	}

	let { page, system }: Props = $props();

	type SortKey = 'order' | 'ref' | 'label' | 'name' | 'tag';
	const PAGE_SIZES = [25, 50, 100, 250];

	let search = $state('');
	let tagFilter = $state('all');
	let groupFilter = $state('all');
	let sortKey = $state<SortKey>('order');
	let pageSize = $state(50);
	let pageIndex = $state(0);
	const selected = new SvelteSet<number>();

	let editing = $state<AdminTalkgroup | null>(null);
	let dialogOpen = $state(false);
	let deleteIds = $state<number[]>([]);
	let deleteOpen = $state(false);
	let busy = $state(false);

	//* Bulk action inputs.
	let bulkTag = $state('');
	let bulkGroups = $state<number[]>([]);

	const tagLabel = (id: number | undefined) => (id ? (page.tagLabels.get(id) ?? `Tag ${id}`) : '');
	const groupLabel = (id: number) => page.groupLabels.get(id) ?? `Group ${id}`;

	const filtered = $derived.by(() => {
		const term = search.trim().toLowerCase();
		const tagId = tagFilter === 'all' ? null : Number(tagFilter);
		const groupId = groupFilter === 'all' ? null : Number(groupFilter);
		let rows = system.talkgroups;
		if (term) {
			rows = rows.filter(
				(tg) =>
					String(tg.talkgroupRef).includes(term) ||
					tg.label.toLowerCase().includes(term) ||
					(tg.name ?? '').toLowerCase().includes(term) ||
					tagLabel(tg.tagId).toLowerCase().includes(term) ||
					tg.groupIds.some((g) => groupLabel(g).toLowerCase().includes(term))
			);
		}
		if (tagId !== null) rows = rows.filter((tg) => (tagId === 0 ? !tg.tagId : tg.tagId === tagId));
		if (groupId !== null) rows = rows.filter((tg) => (groupId === 0 ? tg.groupIds.length === 0 : tg.groupIds.includes(groupId)));
		return rows;
	});

	const sorted = $derived.by(() => {
		const rows = [...filtered];
		const byOrder = (a: AdminTalkgroup, b: AdminTalkgroup) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;
		switch (sortKey) {
			case 'ref':
				return rows.sort((a, b) => a.talkgroupRef - b.talkgroupRef);
			case 'label':
				return rows.sort((a, b) => a.label.localeCompare(b.label) || a.talkgroupRef - b.talkgroupRef);
			case 'name':
				return rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '') || a.talkgroupRef - b.talkgroupRef);
			case 'tag':
				return rows.sort((a, b) => tagLabel(a.tagId).localeCompare(tagLabel(b.tagId)) || byOrder(a, b));
			default:
				return rows.sort(byOrder);
		}
	});

	const pageCount = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
	const clampedPage = $derived(Math.min(pageIndex, pageCount - 1));
	const pageRows = $derived(sorted.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize));

	//* Reset paging when the filters change.
	$effect(() => {
		void search;
		void tagFilter;
		void groupFilter;
		void sortKey;
		void pageSize;
		pageIndex = 0;
	});

	//* Drop selections for talkgroups that no longer exist.
	$effect(() => {
		const ids = new Set(system.talkgroups.map((tg) => tg.id));
		for (const id of selected) if (!ids.has(id)) selected.delete(id);
	});

	const allPageSelected = $derived(pageRows.length > 0 && pageRows.every((tg) => selected.has(tg.id)));
	const someSelected = $derived(selected.size > 0);

	function togglePage(checked: boolean) {
		for (const tg of pageRows) {
			if (checked) selected.add(tg.id);
			else selected.delete(tg.id);
		}
	}

	function selectAllFiltered() {
		for (const tg of sorted) selected.add(tg.id);
	}

	function openCreate() {
		editing = null;
		dialogOpen = true;
	}

	function openEdit(tg: AdminTalkgroup) {
		editing = tg;
		dialogOpen = true;
	}

	async function toggleAlerts(tg: AdminTalkgroup, enabled: boolean) {
		page.applyTalkgroup(system.id, { ...tg, alertsEnabled: enabled });
		try {
			page.applyTalkgroup(system.id, await page.api.patchTalkgroup(system.id, tg.id, { alertsEnabled: enabled }));
		} catch (error) {
			page.applyTalkgroup(system.id, tg);
			toast.error(error instanceof Error ? error.message : 'Failed to update talkgroup');
		}
	}

	async function runBulk(label: string, body: Omit<TalkgroupBulkPatch, 'ids'>, local: (tg: AdminTalkgroup) => AdminTalkgroup) {
		if (!someSelected) return;
		busy = true;
		const ids = [...selected];
		try {
			const count = await page.api.bulkPatchTalkgroups(system.id, { ...body, ids });
			page.applyTalkgroupPatches(system.id, ids, local);
			toast.success(`${label} on ${count} talkgroups`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to ${label.toLowerCase()}`);
		} finally {
			busy = false;
		}
	}

	function bulkAssignTag() {
		const tagId = Number(bulkTag);
		if (!tagId) return;
		void runBulk('Assigned tag', { set: { tagId } }, (tg) => ({ ...tg, tagId }));
	}

	function bulkAddGroups() {
		if (bulkGroups.length === 0) return;
		const add = [...bulkGroups];
		void runBulk('Added groups', { addGroupIds: add }, (tg) => ({ ...tg, groupIds: [...new Set([...tg.groupIds, ...add])] }));
	}

	function bulkRemoveGroups() {
		if (bulkGroups.length === 0) return;
		const remove = new Set(bulkGroups);
		void runBulk('Removed groups', { removeGroupIds: [...remove] }, (tg) => ({ ...tg, groupIds: tg.groupIds.filter((g) => !remove.has(g)) }));
	}

	function bulkAlerts(enabled: boolean) {
		void runBulk(enabled ? 'Enabled alerts' : 'Disabled alerts', { set: { alertsEnabled: enabled } }, (tg) => ({ ...tg, alertsEnabled: enabled }));
	}

	function bulkToneDetection(enabled: boolean) {
		void runBulk(enabled ? 'Enabled tone detection' : 'Disabled tone detection', { set: { toneDetectionEnabled: enabled } }, (tg) => ({
			...tg,
			toneDetectionEnabled: enabled
		}));
	}

	function askDelete(ids: number[]) {
		deleteIds = ids;
		deleteOpen = true;
	}

	async function confirmDelete() {
		busy = true;
		try {
			const count = await page.api.deleteTalkgroups(system.id, deleteIds);
			page.removeTalkgroups(system.id, deleteIds);
			for (const id of deleteIds) selected.delete(id);
			toast.success(`Deleted ${count} talkgroups`);
			deleteOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete talkgroups');
		} finally {
			busy = false;
		}
	}

	//* Persists a sort as the stored display order for the whole system.
	async function persistOrder(by: 'label' | 'ref') {
		busy = true;
		try {
			const ordered = [...system.talkgroups].sort((a, b) =>
				by === 'label' ? a.label.localeCompare(b.label) || a.talkgroupRef - b.talkgroupRef : a.talkgroupRef - b.talkgroupRef
			);
			await page.api.reorderTalkgroups(
				system.id,
				ordered.map((tg) => tg.id)
			);
			const orderById = new Map(ordered.map((tg, index) => [tg.id, index + 1]));
			page.applyTalkgroupPatches(
				system.id,
				ordered.map((tg) => tg.id),
				(tg) => ({ ...tg, order: orderById.get(tg.id) })
			);
			sortKey = 'order';
			toast.success(by === 'label' ? 'Talkgroups ordered A to Z' : 'Talkgroups ordered by ID');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to reorder talkgroups');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-3 pt-2">
	<div class="flex flex-wrap items-center gap-2">
		<Input placeholder="Search ID, label, name, tag, group" bind:value={search} class="h-8 w-full sm:w-64" />
		<Select type="single" value={tagFilter} onValueChange={(v) => (tagFilter = v)}>
			<SelectTrigger size="sm" class="w-36"
				>{tagFilter === 'all' ? 'All tags' : tagFilter === '0' ? 'No tag' : tagLabel(Number(tagFilter))}</SelectTrigger
			>
			<SelectContent>
				<SelectItem value="all" label="All tags" />
				<SelectItem value="0" label="No tag" />
				{#each page.tags as tag (tag.id)}
					<SelectItem value={String(tag.id)} label={tag.label} />
				{/each}
			</SelectContent>
		</Select>
		<Select type="single" value={groupFilter} onValueChange={(v) => (groupFilter = v)}>
			<SelectTrigger size="sm" class="w-40"
				>{groupFilter === 'all' ? 'All groups' : groupFilter === '0' ? 'No group' : groupLabel(Number(groupFilter))}</SelectTrigger
			>
			<SelectContent>
				<SelectItem value="all" label="All groups" />
				<SelectItem value="0" label="No group" />
				{#each page.groups as group (group.id)}
					<SelectItem value={String(group.id)} label={group.label} />
				{/each}
			</SelectContent>
		</Select>
		<Select type="single" value={sortKey} onValueChange={(v) => (sortKey = v as SortKey)}>
			<SelectTrigger size="sm" class="w-36">
				Sort: {sortKey === 'order' ? 'Order' : sortKey === 'ref' ? 'ID' : sortKey === 'label' ? 'Label' : sortKey === 'name' ? 'Name' : 'Tag'}
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="order" label="Order" />
				<SelectItem value="ref" label="ID" />
				<SelectItem value="label" label="Label" />
				<SelectItem value="name" label="Name" />
				<SelectItem value="tag" label="Tag" />
			</SelectContent>
		</Select>
		<div class="ml-auto flex items-center gap-2">
			<Button size="sm" onclick={openCreate}>
				<Plus data-icon="inline-start" />
				Add talkgroup
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon-sm" aria-label="More actions" {...props}>
							<MoreHorizontal />
						</Button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Stored order</DropdownMenuLabel>
					<DropdownMenuItem onclick={() => persistOrder('label')} disabled={busy}>
						<ArrowDownAZ />
						Order A to Z
					</DropdownMenuItem>
					<DropdownMenuItem onclick={() => persistOrder('ref')} disabled={busy}>Order by talkgroup ID</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onclick={selectAllFiltered}>Select all {sorted.length} matching</DropdownMenuItem>
					<DropdownMenuItem onclick={() => selected.clear()} disabled={!someSelected}>Clear selection</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>

	{#if someSelected}
		<div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
			<span class="text-sm font-medium">{selected.size} selected</span>
			<div class="flex items-center gap-1">
				<Select type="single" value={bulkTag} onValueChange={(v) => (bulkTag = v)}>
					<SelectTrigger size="sm" class="w-36">{bulkTag ? tagLabel(Number(bulkTag)) : 'Tag'}</SelectTrigger>
					<SelectContent>
						{#each page.tags as tag (tag.id)}
							<SelectItem value={String(tag.id)} label={tag.label} />
						{/each}
					</SelectContent>
				</Select>
				<Button variant="outline" size="sm" onclick={bulkAssignTag} disabled={!bulkTag || busy}>Assign tag</Button>
			</div>
			<div class="flex items-center gap-1">
				<MultiSelect
					items={page.groups}
					value={bulkGroups}
					onchange={(ids) => {
						bulkGroups = ids;
					}}
					placeholder="Groups"
					class="w-48"
				/>
				<Button variant="outline" size="sm" onclick={bulkAddGroups} disabled={bulkGroups.length === 0 || busy}>Add</Button>
				<Button variant="outline" size="sm" onclick={bulkRemoveGroups} disabled={bulkGroups.length === 0 || busy}>Remove</Button>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button variant="outline" size="sm" {...props}>More</Button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onclick={() => bulkAlerts(true)} disabled={busy}>Enable alerts</DropdownMenuItem>
					<DropdownMenuItem onclick={() => bulkAlerts(false)} disabled={busy}>Disable alerts</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onclick={() => bulkToneDetection(true)} disabled={busy}>Enable tone detection</DropdownMenuItem>
					<DropdownMenuItem onclick={() => bulkToneDetection(false)} disabled={busy}>Disable tone detection</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button variant="destructive" size="sm" class="ml-auto" onclick={() => askDelete([...selected])} disabled={busy}>
				<Trash2 data-icon="inline-start" />
				Delete
			</Button>
		</div>
	{/if}

	{#if system.talkgroups.length === 0}
		<p class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
			No talkgroups yet. Add one, or enable auto-populate in Settings.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="w-8"><Checkbox checked={allPageSelected} onCheckedChange={(v) => togglePage(!!v)} aria-label="Select page" /></TableHead
						>
						<TableHead class="w-24">ID</TableHead>
						<TableHead>Label</TableHead>
						<TableHead class="hidden md:table-cell">Name</TableHead>
						<TableHead class="hidden lg:table-cell">Tag</TableHead>
						<TableHead class="hidden xl:table-cell">Groups</TableHead>
						<TableHead class="w-20 text-center">Alerts</TableHead>
						<TableHead class="w-20"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each pageRows as tg (tg.id)}
						<TableRow class="cursor-pointer" onclick={() => openEdit(tg)}>
							<TableCell onclick={(e: MouseEvent) => e.stopPropagation()}>
								<Checkbox
									checked={selected.has(tg.id)}
									onCheckedChange={(v) => (v ? selected.add(tg.id) : selected.delete(tg.id))}
									aria-label="Select {tg.label}"
								/>
							</TableCell>
							<TableCell class="font-mono text-xs">{tg.talkgroupRef}</TableCell>
							<TableCell>
								<div class="flex items-center gap-1.5">
									<span class="font-medium">{tg.label}</span>
									{#if tg.toneDetectionEnabled}
										<Badge variant="outline" class="text-[10px]">Tones{tg.toneSets?.length ? ` ${tg.toneSets.length}` : ''}</Badge>
									{/if}
									{#if tg.alertingTalkgroup}
										<Badge variant="outline" class="text-[10px]">Alerting</Badge>
									{/if}
								</div>
								<div class="text-xs text-muted-foreground md:hidden">{tg.name}</div>
							</TableCell>
							<TableCell class="hidden text-sm text-muted-foreground md:table-cell">{tg.name}</TableCell>
							<TableCell class="hidden text-sm lg:table-cell">{tagLabel(tg.tagId) || '-'}</TableCell>
							<TableCell class="hidden xl:table-cell">
								<div class="flex flex-wrap gap-1">
									{#each tg.groupIds as id (id)}
										<Badge variant="secondary" class="text-[10px]">{groupLabel(id)}</Badge>
									{:else}
										<span class="text-sm text-muted-foreground">-</span>
									{/each}
								</div>
							</TableCell>
							<TableCell class="text-center" onclick={(e: MouseEvent) => e.stopPropagation()}>
								<Switch checked={tg.alertsEnabled} onCheckedChange={(v) => toggleAlerts(tg, v)} aria-label="Alerts for {tg.label}" />
							</TableCell>
							<TableCell onclick={(e: MouseEvent) => e.stopPropagation()}>
								<div class="flex justify-end gap-1">
									<Button variant="ghost" size="icon-sm" aria-label="Edit {tg.label}" onclick={() => openEdit(tg)}><Pencil /></Button>
									<Button variant="ghost" size="icon-sm" aria-label="Delete {tg.label}" onclick={() => askDelete([tg.id])}><Trash2 /></Button>
								</div>
							</TableCell>
						</TableRow>
					{:else}
						<TableRow>
							<TableCell colspan={8} class="py-6 text-center text-sm text-muted-foreground">No talkgroups match the current filters.</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<span>
				{sorted.length === system.talkgroups.length ? `${sorted.length} talkgroups` : `${sorted.length} of ${system.talkgroups.length} talkgroups`}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Select type="single" value={String(pageSize)} onValueChange={(v) => (pageSize = Number(v))}>
					<SelectTrigger size="sm" class="w-28">{pageSize} per page</SelectTrigger>
					<SelectContent>
						{#each PAGE_SIZES as size (size)}
							<SelectItem value={String(size)} label={`${size} per page`} />
						{/each}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Previous page"
					disabled={clampedPage === 0}
					onclick={() => (pageIndex = clampedPage - 1)}
				>
					<ChevronLeft />
				</Button>
				<span class="tabular-nums">Page {clampedPage + 1} of {pageCount}</span>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Next page"
					disabled={clampedPage >= pageCount - 1}
					onclick={() => (pageIndex = clampedPage + 1)}
				>
					<ChevronRight />
				</Button>
			</div>
		</div>
	{/if}
</div>

{#if dialogOpen}
	<TalkgroupDialog {page} {system} talkgroup={editing} bind:open={dialogOpen} />
{/if}

<AlertDialog bind:open={deleteOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete {deleteIds.length === 1 ? 'talkgroup' : `${deleteIds.length} talkgroups`}?</AlertDialogTitle>
			<AlertDialogDescription>
				Every call recorded on {deleteIds.length === 1 ? 'this talkgroup' : 'these talkgroups'} is permanently deleted with it. This cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<AlertDialogAction onclick={confirmDelete} disabled={busy}>Delete</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
