<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { formatDuration } from '$lib/apps/tlr/format.ts';
	import { getTlrClient, getAudioCoordinator } from '$lib/apps/tlr/context.ts';
	import { CallHistoryState } from './CallHistoryState.svelte.ts';
	import { createCallHistoryColumns } from './CallHistoryColumns.ts';
	import type { EnrichedCallResult } from './CallHistoryState.svelte.ts';
	import { createSvelteTable, FlexRender } from '$lib/components/ui/data-table';
	import { getCoreRowModel } from '@tanstack/table-core';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Toggle } from '$lib/components/ui/toggle';
	import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '$lib/components/ui/select';
	import CallDatePicker from './CallDatePicker.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import { Slider } from '$lib/components/ui/slider';
	import Search from '@lucide/svelte/icons/search';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import X from '@lucide/svelte/icons/x';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Radio from '@lucide/svelte/icons/radio';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronsDown from '@lucide/svelte/icons/chevrons-down';
	import { MediaQuery } from 'svelte/reactivity';
	import { PersistedState } from 'runed';
	import FavoriteStar from '$lib/apps/tlr/ui/call-history/FavoriteStar.svelte';

	let { standalone = false }: { standalone?: boolean } = $props();

	const mobileScreen = new MediaQuery('(width >= 40rem)');

	const client = getTlrClient();
	const coordinator = getAudioCoordinator();
	const state = new CallHistoryState(client, coordinator);
	const showAdvancedPagination = new PersistedState<boolean>('tlr-call-history-advanced-pagination', false);
	const callHistoryColumns = createCallHistoryColumns(state);

	onMount(() => {
		state.start();
	});

	onDestroy(() => {
		state.destroy();
	});

	const table = createSvelteTable<EnrichedCallResult>({
		get data() {
			return state.enrichedResults;
		},
		columns: callHistoryColumns,
		manualPagination: true,
		get pageCount() {
			return state.pageCount;
		},
		getCoreRowModel: getCoreRowModel(),
		state: {
			get pagination() {
				return { pageIndex: state.currentPage - 1, pageSize: state.pageSize };
			},
			get columnVisibility() {
				return standalone || !mobileScreen.current ? { systemLabel: false, source: false } : ({} as Record<string, boolean>);
			}
		}
	});

	const selectedSystemLabel = $derived.by(() => {
		if (state.systemFilter == null) return 'All Systems';
		for (const sys of state.systems) {
			const ref = sys.systemRef ?? sys.id;
			if (ref === state.systemFilter) return sys.label ?? String(ref);
		}
		return String(state.systemFilter);
	});

	const selectedGroupLabel = $derived(state.groupFilter != null ? state.groupFilter : 'All Groups');
	const showFavoriteGroups = $derived(state.systemFilter != null && state.favoriteGroups.length > 0);

	const selectedTalkgroupLabel = $derived.by(() => {
		if (state.talkgroupFilter == null) return 'All Talkgroups';
		for (const tg of state.talkgroupsForSystem) {
			const ref = tg.talkgroupRef ?? tg.id;
			if (ref === state.talkgroupFilter) return tg.label ?? tg.name ?? String(ref);
		}
		return String(state.talkgroupFilter);
	});
	const showFavoriteTalkgroups = $derived(state.groupFilter == null && state.favoriteTalkgroups.length > 0);

	const nextPlaybackCall = $derived(state.nextAutoPlayCall());
	const playbackProgressPct = $derived(state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0);
	const lastLoadedPage = $derived(Math.max(1, Math.ceil(state.totalCount / state.pageSize)));
	const canGoBackFive = $derived(state.currentPage > 1 && !state.isLoading);
	const canGoForwardFive = $derived((state.currentPage < lastLoadedPage || state.hasMore) && !state.isLoading);
</script>

<div class={['space-y-4', state.playbackCall ? 'pb-24' : 'pb-6']}>
	<!-- Filter bar -->
	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-2">
			<CardTitle class="flex items-center gap-2 text-sm">
				<Radio class="size-3.5" />
				Call History
			</CardTitle>
		</CardHeader>
		<CardContent class="px-3.5 pt-0 pb-3.5">
			<div class="flex flex-wrap items-center gap-2">
				<Select
					type="single"
					value={state.systemFilter != null ? String(state.systemFilter) : undefined}
					onValueChange={(v) => {
						state.systemFilter = v ? Number(v) : undefined;
						state.talkgroupFilter = undefined;
					}}
				>
					<SelectTrigger size="sm" class="w-40">
						{selectedSystemLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="" label="All Systems" />
						{#each state.systems as sys (sys.systemRef ?? sys.id)}
							<SelectItem value={String(sys.systemRef ?? sys.id)} label={sys.label ?? String(sys.systemRef ?? sys.id)} />
						{/each}
					</SelectContent>
				</Select>

				<Select
					type="single"
					value={state.groupFilter ?? undefined}
					onValueChange={(v) => {
						state.groupFilter = v || undefined;
						state.talkgroupFilter = undefined;
					}}
				>
					<SelectTrigger size="sm" class="w-36">
						{selectedGroupLabel}
					</SelectTrigger>

					<SelectContent>
						<SelectItem value="" label="All Groups" />

						{#if showFavoriteGroups}
							<SelectGroup>
								<SelectLabel>Favorites</SelectLabel>

								{#each state.favoriteGroups as group (group)}
									<SelectItem value={group}><FavoriteStar /> {group}</SelectItem>
								{/each}
							</SelectGroup>
						{/if}

						<SelectGroup>
							{#if showFavoriteGroups}<SelectLabel>All</SelectLabel>{/if}

							{#each state.groups as group (group)}
								<SelectItem value={group} label={group} />
							{/each}
						</SelectGroup>
					</SelectContent>
				</Select>

				<Select
					type="single"
					value={state.talkgroupFilter != null ? String(state.talkgroupFilter) : undefined}
					onValueChange={(v) => {
						state.talkgroupFilter = v ? Number(v) : undefined;
					}}
					disabled={state.systemFilter == null}
				>
					<SelectTrigger size="sm" class="w-44">
						{selectedTalkgroupLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="" label="All Talkgroups" />

						{#if showFavoriteTalkgroups}
							<SelectGroup>
								<SelectLabel>Favorites</SelectLabel>
								{#each state.favoriteTalkgroups as tg (tg.talkgroupRef ?? tg.id)}
									<SelectItem value={String(tg.talkgroupRef ?? tg.id)}
										><FavoriteStar /> {tg.label ?? tg.name ?? String(tg.talkgroupRef ?? tg.id)}</SelectItem
									>
								{/each}
							</SelectGroup>
						{/if}

						<SelectGroup>
							{#if showFavoriteTalkgroups}<SelectLabel>All</SelectLabel>{/if}

							{#each state.talkgroupsForSystem as tg (tg.talkgroupRef ?? tg.id)}
								<SelectItem value={String(tg.talkgroupRef ?? tg.id)} label={tg.label ?? tg.name ?? String(tg.talkgroupRef ?? tg.id)} />
							{/each}
						</SelectGroup>
					</SelectContent>
				</Select>

				<CallDatePicker bind:value={state.selectedDate} onSelect={() => state.search()} />

				<Button variant="default" size="sm" class="gap-1.5" onclick={() => state.search()} disabled={state.isLoading}>
					{#if state.isLoading}
						<Loader2 class="size-3.5 animate-spin" />
					{:else}
						<Search class="size-3.5" />
					{/if}
					Search
				</Button>

				<div class="ml-auto">
					<Button
						variant={state.isLoadingAll ? 'destructive' : 'outline'}
						size="sm"
						class="gap-1.5"
						onclick={() => (state.isLoadingAll ? state.cancelLoadAll() : state.loadAll())}
						disabled={state.isLoading && !state.isLoadingAll}
					>
						{#if state.isLoadingAll}
							<X class="size-3.5" />
							Cancel
						{:else}
							<ChevronsDown class="size-3.5" />
							Load all
						{/if}
					</Button>

					<Button variant="outline" size="sm" class="gap-1.5" onclick={() => state.search()} disabled={state.isLoading}>
						{#if state.isLoading}
							<Loader2 class="size-3.5 animate-spin" />
						{:else}
							<RefreshCw class="size-3.5" />
						{/if}
						Refresh
					</Button>
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Data table -->
	<Card class="gap-0 border-border/60 py-0">
		<CardContent class="p-0">
			<Table class="table-fixed">
				<TableHeader>
					{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
						<TableRow>
							{#each headerGroup.headers as header (header.id)}
								{@const hasSize = header.column.columnDef.size != null}
								<TableHead style={hasSize ? `width: ${header.column.getSize()}px` : undefined}>
									{#if !header.isPlaceholder}
										<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
									{/if}
								</TableHead>
							{/each}
						</TableRow>
					{/each}
				</TableHeader>
				<TableBody>
					{#if !state.isLoading && table.getRowModel().rows.length > 0}
						{#each table.getRowModel().rows as row (row.id)}
							<TableRow
								class={['cursor-pointer', state.playbackCallId === row.original.id && 'bg-accent']}
								onclick={() => state.playCall(row.original.id)}
							>
								{#each row.getVisibleCells() as cell (cell.id)}
									<TableCell>
										<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
									</TableCell>
								{/each}
							</TableRow>
						{/each}
					{:else}
						<TableRow>
							<TableCell colspan={table.getVisibleLeafColumns().length} class="text-center text-sm text-muted-foreground">
								{#if state.isLoading}
									<div class="flex items-center justify-center gap-2">
										<Loader2 class="size-4 animate-spin" />
										<span>Loading calls...</span>
									</div>
								{:else}
									No calls found.
								{/if}
							</TableCell>
						</TableRow>
					{/if}
					{@const emptyRows = state.pageSize - (state.isLoading || table.getRowModel().rows.length === 0 ? 1 : table.getRowModel().rows.length)}
					{#each Array.from({ length: emptyRows }, (__, i) => i) as i (`pad-${i}`)}
						<TableRow>
							<TableCell colspan={table.getVisibleLeafColumns().length}>&nbsp;</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</CardContent>
	</Card>

	<!-- Pagination -->
	<Card class="gap-0 border-border/60 py-0">
		<CardContent class="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
			<div class="flex items-center gap-2">
				<Toggle
					size="sm"
					variant="outline"
					pressed={showAdvancedPagination.current}
					onPressedChange={(v) => (showAdvancedPagination.current = v)}
					class="h-8 gap-1.5 px-2 text-xs text-muted-foreground data-[state=on]:border-primary/40 data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
					aria-label={showAdvancedPagination.current ? 'Hide advanced pagination' : 'Show advanced pagination'}
				>
					<Settings2 class="size-3.5" />
					Pages
				</Toggle>

				<span class="text-xs text-muted-foreground">
					Page {state.currentPage}
					<span class="hidden sm:inline"
						>· Showing
						{(state.currentPage - 1) * state.pageSize} -
						{state.currentPage * state.pageSize} of
						{state.totalCount}{state.hasMore ? '+' : ''}</span
					>
				</span>
			</div>
			<div class="flex flex-wrap items-center justify-end gap-1">
				{#if showAdvancedPagination.current}
					<Button
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs"
						disabled={state.currentPage === 1 || state.isLoading}
						onclick={() => state.setPage(1)}
					>
						Start
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs"
						disabled={!canGoBackFive}
						onclick={() => state.setPage(Math.max(1, state.currentPage - 5))}
					>
						-5
					</Button>
				{/if}

				<Button
					variant="outline"
					size="sm"
					class="size-8 p-0"
					disabled={state.offset === 0 || state.isLoading}
					onclick={() => state.setPage(state.currentPage - 1)}
					aria-label="Previous page"
				>
					<ChevronLeft class="size-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="size-8 p-0"
					disabled={state.currentPage >= state.pageCount || state.isLoading}
					onclick={() => state.setPage(state.currentPage + 1)}
					aria-label="Next page"
				>
					<ChevronRight class="size-4" />
				</Button>

				{#if showAdvancedPagination.current}
					<Button
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs"
						disabled={!canGoForwardFive}
						onclick={() => state.setPage(Math.min(state.pageCount, state.currentPage + 5))}
					>
						+5
					</Button>
					<Button
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs"
						disabled={state.currentPage >= lastLoadedPage || state.isLoading}
						onclick={() => state.setPage(lastLoadedPage)}
					>
						End
					</Button>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>

<!-- Sticky playback bar -->
{#if state.playbackCall}
	<div class={['border-t border-border bg-background', standalone ? 'sticky bottom-0 -mx-3' : 'fixed right-0 bottom-0 left-0 z-50']}>
		<div class="h-0.5 bg-muted">
			<div class="h-full bg-primary" style={`width: ${playbackProgressPct}%`}></div>
		</div>
		<div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
			<!-- Call metadata -->
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium text-foreground">
					{state.resolveCallLabel(state.playbackCall)}
				</p>
				{#if state.playbackError}
					<p class="truncate text-xs text-destructive">{state.playbackError}</p>
				{:else if nextPlaybackCall}
					<p class="truncate text-xs text-muted-foreground">Up next: {state.resolveCallLabel(nextPlaybackCall)}</p>
				{/if}
			</div>

			<Button
				variant="ghost"
				size="sm"
				class="size-8 p-0"
				onclick={() => state.skipToOlder()}
				disabled={!state.hasOlder}
				aria-label="Skip to older call"
			>
				<SkipBack class="size-4" />
			</Button>

			<!-- Play/Pause -->
			<Button
				variant="ghost"
				size="sm"
				class="size-8 p-0"
				onclick={() => state.togglePlayPause()}
				disabled={state.playbackLoading || !!state.playbackError}
				aria-label={state.isPlaying ? 'Pause' : 'Play'}
			>
				{#if state.playbackLoading}
					<Loader2 class="size-4 animate-spin" />
				{:else if state.isPlaying}
					<Pause class="size-4" />
				{:else}
					<Play class="size-4" />
				{/if}
			</Button>

			<Button
				variant="ghost"
				size="sm"
				class="size-8 p-0"
				onclick={() => state.skipToNewer()}
				disabled={!state.hasNewer}
				aria-label="Skip to newer call"
			>
				<SkipForward class="size-4" />
			</Button>

			<!-- Progress -->
			<span class="min-w-20 text-center font-mono text-xs text-muted-foreground tabular-nums">
				{formatDuration(state.currentTime)} / {formatDuration(state.duration)}
			</span>

			<!-- Volume -->
			<div class="flex items-center gap-1.5">
				<Volume2 class="size-3.5 text-muted-foreground" />
				<Slider type="single" value={state.volume} onValueChange={(v) => state.setVolume(v)} max={1} step={0.05} class="w-20" />
			</div>

			<!-- Close -->
			<Button
				variant="ghost"
				size="sm"
				class="size-8 p-0 text-muted-foreground hover:text-foreground"
				onclick={() => state.stopPlayback()}
				aria-label="Close playback"
			>
				<X class="size-4" />
			</Button>
		</div>
	</div>
{/if}
