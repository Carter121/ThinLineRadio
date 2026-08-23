<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
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
	import { dateInputToRfc3339, formatRowTime, purgeData, searchLogs, type LogRow, type LogsSearchOptions } from './tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PAGE_SIZE = 100;
	const ALL = 'all';
	const LEVELS: Array<{ value: string; label: string }> = [
		{ value: ALL, label: 'All levels' },
		{ value: 'error', label: 'Error' },
		{ value: 'warn', label: 'Warning' },
		{ value: 'info', label: 'Info' }
	];

	let date = $state('');
	let level = $state(ALL);
	let search = $state('');
	let sort = $state<'-1' | '1'>('-1');
	let offset = $state(0);
	let rows = $state.raw<LogRow[]>([]);
	let hasMore = $state(false);
	let searched = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmOpen = $state(false);
	const selected = new SvelteSet<number>();

	const levelLabel = $derived(LEVELS.find((l) => l.value === level)?.label ?? 'All levels');
	const allOnPageSelected = $derived(rows.length > 0 && rows.every((row) => selected.has(row.id)));
	const someOnPageSelected = $derived(!allOnPageSelected && rows.some((row) => selected.has(row.id)));

	function levelVariant(value: string): 'destructive' | 'secondary' | 'outline' {
		if (value === 'error') return 'destructive';
		if (value === 'warn') return 'secondary';
		return 'outline';
	}

	async function load(nextOffset = 0) {
		loading = true;
		try {
			const options: LogsSearchOptions = {
				date: dateInputToRfc3339(date),
				limit: PAGE_SIZE,
				offset: nextOffset,
				sort: sort === '-1' ? -1 : 1
			};
			if (level !== ALL) options.level = level as LogsSearchOptions['level'];
			if (search.trim()) options.search = search.trim();
			const result = await searchLogs(session.client, options);
			rows = result.logs ?? [];
			hasMore = !!result.hasMore;
			offset = nextOffset;
			searched = true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to search logs');
		} finally {
			loading = false;
		}
	}

	function toggleRow(id: number, checked: boolean) {
		if (checked) selected.add(id);
		else selected.delete(id);
	}

	function togglePage(checked: boolean) {
		for (const row of rows) toggleRow(row.id, checked);
	}

	async function deleteSelected() {
		const ids = Array.from(selected);
		if (ids.length === 0) return;
		deleting = true;
		confirmOpen = false;
		try {
			const result = await purgeData(session.client, 'logs', ids);
			toast.success(result.message ?? `${ids.length} logs deleted`);
			selected.clear();
			await load(offset);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete logs');
		} finally {
			deleting = false;
		}
	}
</script>

<div class="flex flex-col gap-3">
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex flex-col gap-1.5">
			<Label for="purge-logs-date">From date</Label>
			<Input id="purge-logs-date" type="date" bind:value={date} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-logs-level">Level</Label>
			<Select type="single" value={level} onValueChange={(v) => (level = v)}>
				<SelectTrigger id="purge-logs-level" class="w-full">{levelLabel}</SelectTrigger>
				<SelectContent>
					{#each LEVELS as option (option.value)}
						<SelectItem value={option.value} label={option.label} />
					{/each}
				</SelectContent>
			</Select>
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-logs-search">Message contains</Label>
			<Input id="purge-logs-search" bind:value={search} placeholder="Search text" onkeydown={(e) => e.key === 'Enter' && void load(0)} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="purge-logs-sort">Order</Label>
			<Select type="single" value={sort} onValueChange={(v) => (sort = v === '1' ? '1' : '-1')}>
				<SelectTrigger id="purge-logs-sort" class="w-full">{sort === '-1' ? 'Newest first' : 'Oldest first'}</SelectTrigger>
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
			<Button size="sm" variant="ghost" onclick={() => selected.clear()}>Clear selection</Button>
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
								aria-label="Select all logs on this page"
								disabled={rows.length === 0}
							/>
						</TableHead>
						<TableHead>Time</TableHead>
						<TableHead>Level</TableHead>
						<TableHead>Category</TableHead>
						<TableHead>Message</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#if rows.length === 0}
						<TableRow>
							<TableCell colspan={5} class="py-6 text-center text-sm text-muted-foreground">No logs match these filters.</TableCell>
						</TableRow>
					{/if}
					{#each rows as row (row.id)}
						<TableRow data-state={selected.has(row.id) ? 'selected' : undefined}>
							<TableCell>
								<Checkbox
									checked={selected.has(row.id)}
									onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
									aria-label={`Select log ${row.id}`}
								/>
							</TableCell>
							<TableCell class="whitespace-nowrap tabular-nums">{formatRowTime(row.dateTime)}</TableCell>
							<TableCell><Badge variant={levelVariant(row.level)}>{row.level}</Badge></TableCell>
							<TableCell class="whitespace-nowrap text-muted-foreground">{row.category ?? '-'}</TableCell>
							<TableCell class="max-w-[32rem] truncate" title={row.message}>{row.message}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>
		<div class="flex items-center justify-between text-xs text-muted-foreground">
			<span>Showing {rows.length} logs starting at offset {offset}.</span>
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
			<AlertDialog.Title>Delete {selected.size} selected {selected.size === 1 ? 'log entry' : 'log entries'}?</AlertDialog.Title>
			<AlertDialog.Description>The selected log entries are permanently removed from the database. This cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} onclick={deleteSelected}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
