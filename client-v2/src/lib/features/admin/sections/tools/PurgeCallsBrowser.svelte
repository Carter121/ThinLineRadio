<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { formatFrequency } from '$lib/core/format.ts';
	import { dateInputToRfc3339, formatRowTime, purgeData, searchCalls, type CallSearchRow } from './tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PAGE_SIZE = 100;
	const ALL = 'all';

	let date = $state('');
	let systemValue = $state(ALL);
	let talkgroupValue = $state(ALL);
	let sort = $state<'-1' | '1'>('-1');
	let offset = $state(0);
	let rows = $state.raw<CallSearchRow[]>([]);
	let hasMore = $state(false);
	let searched = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmOpen = $state(false);
	let selected = $state<Set<number>>(new Set());

	const systems = $derived(session.config?.systems ?? []);
	const selectedSystem = $derived(systems.find((s) => String(s.systemRef ?? s.id) === systemValue));
	const talkgroups = $derived(selectedSystem?.talkgroups ?? []);
	const systemLabel = $derived(selectedSystem?.label ?? 'All systems');
	const talkgroupLabel = $derived(
		talkgroupValue === ALL ? 'All talkgroups' : (talkgroups.find((tg) => String(tg.talkgroupRef) === talkgroupValue)?.label ?? talkgroupValue)
	);
	const allOnPageSelected = $derived(rows.length > 0 && rows.every((row) => selected.has(row.id)));
	const someOnPageSelected = $derived(!allOnPageSelected && rows.some((row) => selected.has(row.id)));

	function labelFor(systemRef: number, talkgroupRef: number): { system: string; talkgroup: string } {
		const system = systems.find((s) => s.systemRef === systemRef);
		const talkgroup = system?.talkgroups?.find((tg) => tg.talkgroupRef === talkgroupRef);
		return { system: system?.label ?? String(systemRef), talkgroup: talkgroup?.label ?? String(talkgroupRef) };
	}

	async function load(nextOffset = 0) {
		loading = true;
		try {
			const result = await searchCalls(session.client, {
				date: dateInputToRfc3339(date),
				limit: PAGE_SIZE,
				offset: nextOffset,
				sort: sort === '-1' ? -1 : 1,
				system: systemValue === ALL ? undefined : Number(systemValue),
				talkgroup: talkgroupValue === ALL ? undefined : Number(talkgroupValue)
			});
			rows = result.results ?? [];
			hasMore = !!result.hasMore;
			offset = nextOffset;
			searched = true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to search calls');
		} finally {
			loading = false;
		}
	}

	function onSystemChange(value: string) {
		systemValue = value;
		talkgroupValue = ALL;
	}

	function toggleRow(id: number, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(id);
		else next.delete(id);
		selected = next;
	}

	function togglePage(checked: boolean) {
		const next = new Set(selected);
		for (const row of rows) {
			if (checked) next.add(row.id);
			else next.delete(row.id);
		}
		selected = next;
	}

	async function deleteSelected() {
		const ids = Array.from(selected);
		if (ids.length === 0) return;
		deleting = true;
		confirmOpen = false;
		try {
			const result = await purgeData(session.client, 'calls', ids);
			toast.success(result.message ?? `${ids.length} calls deleted`);
			selected = new Set();
			await load(offset);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete calls');
		} finally {
			deleting = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex flex-col gap-1.5">
			<Label for="purge-calls-date">From date</Label>
			<Input id="purge-calls-date" type="date" bind:value={date} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-calls-system">System</Label>
			<Select type="single" value={systemValue} onValueChange={onSystemChange}>
				<SelectTrigger id="purge-calls-system" class="w-full">{systemLabel}</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL} label="All systems" />
					{#each systems as system (system.id)}
						<SelectItem value={String(system.systemRef ?? system.id)} label={system.label} />
					{/each}
				</SelectContent>
			</Select>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-calls-talkgroup">Talkgroup</Label>
			<Select type="single" value={talkgroupValue} onValueChange={(v) => (talkgroupValue = v)} disabled={!selectedSystem}>
				<SelectTrigger id="purge-calls-talkgroup" class="w-full">{talkgroupLabel}</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL} label="All talkgroups" />
					{#each talkgroups as talkgroup (talkgroup.id)}
						<SelectItem value={String(talkgroup.talkgroupRef)} label={talkgroup.label ?? String(talkgroup.talkgroupRef)} />
					{/each}
				</SelectContent>
			</Select>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-calls-sort">Order</Label>
			<Select type="single" value={sort} onValueChange={(v) => (sort = v === '1' ? '1' : '-1')}>
				<SelectTrigger id="purge-calls-sort" class="w-full">{sort === '-1' ? 'Newest first' : 'Oldest first'}</SelectTrigger>
				<SelectContent>
					<SelectItem value="-1" label="Newest first" />
					<SelectItem value="1" label="Oldest first" />
				</SelectContent>
			</Select>
		</div>
	</div>
	<p class="text-xs text-muted-foreground">
		Results start at the chosen date and run forward in the selected order. Without a date, newest-first only covers the last 24 hours.
	</p>
	<div class="flex flex-wrap items-center gap-2">
		<Button size="sm" variant="outline" disabled={loading} onclick={() => void load(0)}>
			{#if loading}
				<Loader2 data-icon="inline-start" class="animate-spin" />
			{:else}
				<Search data-icon="inline-start" />
			{/if}
			Search
		</Button>
		<Button size="sm" variant="destructive" disabled={selected.size === 0 || deleting} onclick={() => (confirmOpen = true)}>
			{#if deleting}
				<Loader2 data-icon="inline-start" class="animate-spin" />
			{:else}
				<Trash2 data-icon="inline-start" />
			{/if}
			Delete selected ({selected.size})
		</Button>
		{#if selected.size > 0}
			<Button size="sm" variant="ghost" onclick={() => (selected = new Set())}>Clear selection</Button>
		{/if}
	</div>

	{#if loading && !searched}
		<div class="flex min-h-24 items-center justify-center">
			<Spinner class="size-5" />
		</div>
	{:else if searched}
		<div class="overflow-x-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="w-10">
							<Checkbox
								checked={allOnPageSelected}
								indeterminate={someOnPageSelected}
								onCheckedChange={(checked) => togglePage(checked === true)}
								aria-label="Select all calls on this page"
								disabled={rows.length === 0}
							/>
						</TableHead>
						<TableHead>Time</TableHead>
						<TableHead>System</TableHead>
						<TableHead>Talkgroup</TableHead>
						<TableHead>Frequency</TableHead>
						<TableHead class="text-right">Call ID</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#if rows.length === 0}
						<TableRow>
							<TableCell colspan={6} class="py-6 text-center text-sm text-muted-foreground">No calls match these filters.</TableCell>
						</TableRow>
					{/if}
					{#each rows as row (row.id)}
						{@const labels = labelFor(row.system, row.talkgroup)}
						<TableRow data-state={selected.has(row.id) ? 'selected' : undefined}>
							<TableCell>
								<Checkbox checked={selected.has(row.id)} onCheckedChange={(checked) => toggleRow(row.id, checked === true)} aria-label={`Select call ${row.id}`} />
							</TableCell>
							<TableCell class="tabular-nums whitespace-nowrap">{formatRowTime(row.dateTime)}</TableCell>
							<TableCell>{labels.system}</TableCell>
							<TableCell>{labels.talkgroup}</TableCell>
							<TableCell class="tabular-nums">{formatFrequency(row.frequency) ?? '-'}</TableCell>
							<TableCell class="text-right tabular-nums text-muted-foreground">{row.id}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>
		<div class="flex items-center justify-between text-xs text-muted-foreground">
			<span>Showing {rows.length} calls starting at offset {offset}.</span>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" disabled={loading || offset === 0} onclick={() => void load(Math.max(0, offset - PAGE_SIZE))}>
					<ChevronLeft data-icon="inline-start" />
					Previous
				</Button>
				<Button size="sm" variant="outline" disabled={loading || !hasMore} onclick={() => void load(offset + PAGE_SIZE)}>
					Next
					<ChevronRight data-icon="inline-end" />
				</Button>
			</div>
		</div>
	{/if}
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {selected.size} selected {selected.size === 1 ? 'call' : 'calls'}?</AlertDialog.Title>
			<AlertDialog.Description>
				The audio, transcript and metadata of the selected calls are permanently removed from the database. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={deleteSelected}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
