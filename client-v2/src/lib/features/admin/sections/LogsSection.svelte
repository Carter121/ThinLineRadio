<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { DateTime } from 'luxon';
	import { getLocalTimeZone, type DateValue } from '@internationalized/date';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import { cn } from '$lib/utils/shadcn.ts';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { fetchLogCategories, searchLogs } from './monitoring/monitoring-api.ts';
	import { logLevelLabel, type LogCategory, type LogEntry, type LogLevel, type LogsSearchRequest } from './monitoring/monitoring-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PAGE_SIZE = 50;
	const AUTO_REFRESH_MS = 15000;

	//* Filters
	let level = $state<'' | LogLevel>('');
	let sort = $state<'-1' | '1'>('-1');
	let search = $state('');
	let appliedSearch = $state('');
	let selectedCategories = $state<string[]>([]);
	let date = $state<DateValue | undefined>(undefined);
	let time = $state('');
	let datePickerOpen = $state(false);

	//* Results
	let categories = $state<LogCategory[]>([]);
	let logs = $state.raw<LogEntry[]>([]);
	let hasMore = $state(false);
	let offset = $state(0);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lastLoaded = $state<DateTime | null>(null);
	let autoRefresh = $state(false);

	const filtersActive = $derived(level !== '' || appliedSearch !== '' || selectedCategories.length > 0 || !!date || sort !== '-1');
	const categoryLabels = $derived(new Map(categories.map((c) => [c.key, c.label])));
	const levelLabel = $derived(level === '' ? 'All levels' : logLevelLabel(level));
	const sortLabel = $derived(sort === '-1' ? 'Newest first' : 'Oldest first');
	const dateLabel = $derived(date ? DateTime.fromJSDate(date.toDate(getLocalTimeZone())).toFormat('MMM d, yyyy') : 'Any date');
	const pageStart = $derived(logs.length === 0 ? 0 : offset + 1);
	const pageEnd = $derived(offset + logs.length);

	//* Server expects RFC3339; time defaults to midnight local on the chosen date.
	function buildDate(): string | undefined {
		if (!date) return undefined;
		const [hour, minute] = time ? time.split(':').map((part) => Number(part) || 0) : [0, 0];
		return DateTime.fromObject({ year: date.year, month: date.month, day: date.day, hour, minute }).toISO() ?? undefined;
	}

	function buildRequest(): LogsSearchRequest {
		const request: LogsSearchRequest = { limit: PAGE_SIZE, offset, sort: sort === '-1' ? -1 : 1 };
		if (level) request.level = level;
		if (appliedSearch) request.search = appliedSearch;
		if (selectedCategories.length > 0) request.categories = [...selectedCategories];
		const from = buildDate();
		if (from) request.date = from;
		return request;
	}

	let requestSeq = 0;

	async function load() {
		const seq = ++requestSeq;
		loading = true;
		error = null;
		try {
			const result = await searchLogs(session.client, buildRequest());
			if (seq !== requestSeq) return;
			logs = result.logs;
			hasMore = result.hasMore;
			lastLoaded = DateTime.now();
		} catch (err) {
			if (seq !== requestSeq) return;
			error = err instanceof Error ? err.message : 'Failed to load logs';
			logs = [];
			hasMore = false;
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	//* Any filter change restarts from the first page.
	function applyFilters() {
		offset = 0;
		void load();
	}

	function submitSearch() {
		appliedSearch = search.trim();
		applyFilters();
	}

	function toggleCategory(key: string) {
		selectedCategories = selectedCategories.includes(key) ? selectedCategories.filter((k) => k !== key) : [...selectedCategories, key];
		applyFilters();
	}

	function clearDate() {
		date = undefined;
		time = '';
		applyFilters();
	}

	function reset() {
		level = '';
		sort = '-1';
		search = '';
		appliedSearch = '';
		selectedCategories = [];
		date = undefined;
		time = '';
		applyFilters();
	}

	function goTo(nextOffset: number) {
		offset = Math.max(0, nextOffset);
		void load();
	}

	$effect(() => {
		if (!autoRefresh) return;
		const timer = setInterval(() => {
			if (!loading) void load();
		}, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	});

	function levelBadgeVariant(value: string): 'destructive' | 'secondary' | 'outline' {
		if (value === 'error') return 'destructive';
		if (value === 'warn') return 'secondary';
		return 'outline';
	}

	function formatTimestamp(value: string): string {
		const parsed = DateTime.fromISO(value);
		return parsed.isValid ? parsed.toFormat('yyyy-MM-dd HH:mm:ss') : value;
	}

	onMount(() => {
		void (async () => {
			try {
				categories = await fetchLogCategories(session.client);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to load log categories');
			}
		})();
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Logs</h2>
			<p class="text-sm text-muted-foreground">Server event log. Without a date, newest-first searches cover the last 24 hours.</p>
		</div>
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2">
				<Switch id="logs-auto-refresh" bind:checked={autoRefresh} aria-label="Auto-refresh" />
				<Label for="logs-auto-refresh" class="text-sm font-normal text-muted-foreground">Auto-refresh</Label>
			</div>
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" class={loading ? 'animate-spin' : undefined} />
				Refresh
			</Button>
		</div>
	</div>

	<Card class="py-0">
		<CardContent class="flex flex-col gap-3 px-4 py-4">
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="logs-sort" class="text-xs text-muted-foreground">Sort</Label>
					<Select type="single" value={sort} onValueChange={(v) => ((sort = v as '-1' | '1'), applyFilters())}>
						<SelectTrigger id="logs-sort" size="sm" class="w-36">{sortLabel}</SelectTrigger>
						<SelectContent>
							<SelectItem value="-1" label="Newest first" />
							<SelectItem value="1" label="Oldest first" />
						</SelectContent>
					</Select>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="logs-level" class="text-xs text-muted-foreground">Level</Label>
					<Select type="single" value={level || 'all'} onValueChange={(v) => ((level = v === 'all' ? '' : (v as LogLevel)), applyFilters())}>
						<SelectTrigger id="logs-level" size="sm" class="w-32">{levelLabel}</SelectTrigger>
						<SelectContent>
							<SelectItem value="all" label="All levels" />
							<SelectItem value="info" label="Info" />
							<SelectItem value="warn" label="Warn" />
							<SelectItem value="error" label="Error" />
						</SelectContent>
					</Select>
				</div>
				<div class="flex min-w-56 flex-1 flex-col gap-1.5">
					<Label for="logs-search" class="text-xs text-muted-foreground">Search message</Label>
					<div class="flex gap-1.5">
						<Input
							id="logs-search"
							class="h-8"
							placeholder="Text in message"
							bind:value={search}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') submitSearch();
							}}
						/>
						<Button variant="outline" size="sm" disabled={loading} onclick={submitSearch} aria-label="Search">
							<Search class="size-4" />
						</Button>
					</div>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs text-muted-foreground">From date</Label>
					<div class="flex items-center gap-1.5">
						<Popover.Root bind:open={datePickerOpen}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" size="sm" class={cn('w-36 justify-start gap-2 font-normal', !date && 'text-muted-foreground')}>
										<CalendarIcon class="size-3.5 shrink-0" />
										<span class="truncate">{dateLabel}</span>
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-auto overflow-hidden p-0" align="start">
								<Calendar
									type="single"
									bind:value={date}
									captionLayout="dropdown"
									onValueChange={() => {
										datePickerOpen = false;
										applyFilters();
									}}
								/>
							</Popover.Content>
						</Popover.Root>
						<Input type="time" class="h-8 w-28" aria-label="From time" disabled={!date} bind:value={time} onchange={applyFilters} />
						{#if date}
							<Button variant="ghost" size="icon-sm" aria-label="Clear date" onclick={clearDate}>
								<X class="size-3.5" />
							</Button>
						{/if}
					</div>
				</div>
				<Button variant="ghost" size="sm" disabled={loading || !filtersActive} onclick={reset}>Reset</Button>
			</div>

			{#if categories.length > 0}
				<div class="flex flex-wrap items-center gap-1.5">
					<span class="mr-1 text-xs text-muted-foreground">Categories</span>
					{#each categories as category (category.key)}
						{@const active = selectedCategories.includes(category.key)}
						<button
							type="button"
							class={cn(
								'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
								active
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
							)}
							aria-pressed={active}
							onclick={() => toggleCategory(category.key)}
						>
							{category.label}
						</button>
					{/each}
					{#if selectedCategories.length > 0}
						<Button
							variant="ghost"
							size="sm"
							class="h-6 px-2 text-xs"
							onclick={() => {
								selectedCategories = [];
								applyFilters();
							}}
						>
							Clear ({selectedCategories.length})
						</Button>
					{/if}
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card class="py-0">
		<CardContent class="px-0 py-0">
			<div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
				<span>
					{#if loading && logs.length === 0}
						Loading...
					{:else if logs.length === 0}
						No log entries match.
					{:else}
						Rows {pageStart.toLocaleString()}-{pageEnd.toLocaleString()}{hasMore ? ' (more available)' : ''}
					{/if}
					{#if lastLoaded}
						<span class="ml-2">Updated {lastLoaded.toFormat('HH:mm:ss')}</span>
					{/if}
				</span>
				<div class="flex items-center gap-1">
					<Button variant="ghost" size="icon-sm" aria-label="First page" disabled={loading || offset === 0} onclick={() => goTo(0)}>
						<ChevronsLeft class="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Previous page"
						disabled={loading || offset === 0}
						onclick={() => goTo(offset - PAGE_SIZE)}
					>
						<ChevronLeft class="size-3.5" />
					</Button>
					<span class="px-1 tabular-nums">Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
					<Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={loading || !hasMore} onclick={() => goTo(offset + PAGE_SIZE)}>
						<ChevronRight class="size-3.5" />
					</Button>
				</div>
			</div>

			{#if error}
				<p class="px-4 py-6 text-sm text-destructive">{error}</p>
			{:else if loading && logs.length === 0}
				<div class="flex min-h-40 items-center justify-center">
					<Spinner class="size-6" />
				</div>
			{:else if logs.length > 0}
				<div class={cn('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
					<Table class="text-xs">
						<TableHeader>
							<TableRow>
								<TableHead class="w-20">Level</TableHead>
								<TableHead class="w-36">Category</TableHead>
								<TableHead class="w-40">Time</TableHead>
								<TableHead>Message</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each logs as log (log.id)}
								<TableRow>
									<TableCell class="align-top">
										<Badge variant={levelBadgeVariant(log.level)} class="px-1.5 py-0 text-[10px] uppercase">{logLevelLabel(log.level)}</Badge>
									</TableCell>
									<TableCell class="align-top text-muted-foreground">{categoryLabels.get(log.category) ?? log.category}</TableCell>
									<TableCell class="align-top font-mono whitespace-nowrap tabular-nums">{formatTimestamp(log.dateTime)}</TableCell>
									<TableCell class="align-top font-mono break-all whitespace-pre-wrap">{log.message}</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
