<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { TranscriptSearchState } from './TranscriptSearchState.svelte.ts';
	import TranscriptCard from './TranscriptCard.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select/index.ts';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Search from '@lucide/svelte/icons/search';
	import { getAudioCoordinator, getTlrClient, getTlrAlertFeed } from '$lib/core/context.ts';
	import { systemRef, talkgroupRef } from '$lib/core/directory.ts';

	const state = new TranscriptSearchState(getTlrClient(), getAudioCoordinator(), getTlrAlertFeed());

	onMount(() => state.start());
	onDestroy(() => state.destroy());

	function changePage(page: number) {
		state.setPage(page);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	const selectedSystemLabel = $derived(state.systemFilter != null ? state.directory.systemLabel(state.systemFilter) : 'All Systems');
	const selectedTalkgroupLabel = $derived(
		state.systemFilter != null && state.talkgroupFilter != null
			? state.directory.talkgroupLabel(state.systemFilter, state.talkgroupFilter)
			: 'All Talkgroups'
	);
</script>

{#snippet pagination()}
	<div class="flex items-center gap-1.5">
		<span class="text-xs text-muted-foreground">Page {state.page}</span>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={state.page <= 1 || state.isLoading}
			onclick={() => changePage(state.page - 1)}
			aria-label="Previous page"
		>
			<ChevronLeft class="size-3.5" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={!state.hasMore || state.isLoading}
			onclick={() => changePage(state.page + 1)}
			aria-label="Next page"
		>
			<ChevronRight class="size-3.5" />
		</Button>
	</div>
{/snippet}

<div class="space-y-4 pb-6">
	<!-- Filter bar -->
	<Card class="gap-0 border-border/60 py-0">
		<CardHeader class="px-3.5 pt-3 pb-2">
			<CardTitle class="flex items-center justify-between text-sm">
				<div class="flex items-center gap-2">
					<FileText class="size-3.5" />
					Transcripts
					{#if state.isLoading}
						<Loader2 class="size-3.5 animate-spin text-muted-foreground" />
					{/if}
				</div>
				{@render pagination()}
			</CardTitle>
		</CardHeader>
		<CardContent class="px-3.5 pt-0 pb-3.5">
			<div class="flex flex-wrap items-center gap-2">
				<!-- System Select -->
				<Select type="single" bind:value={state.systemFilterValue}>
					<SelectTrigger size="sm" class="w-40">
						{selectedSystemLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all" label="All Systems" />
						{#each state.directory.systems as sys (systemRef(sys))}
							<SelectItem value={String(systemRef(sys))} label={sys.label ?? String(systemRef(sys))} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Talkgroup Select -->
				<Select type="single" bind:value={state.talkgroupFilterValue} disabled={state.systemFilter == null}>
					<SelectTrigger size="sm" class="w-44">
						{selectedTalkgroupLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all" label="All Talkgroups" />
						{#each state.talkgroupsForSystem as tg (talkgroupRef(tg))}
							<SelectItem value={String(talkgroupRef(tg))} label={tg.label ?? tg.name ?? String(talkgroupRef(tg))} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Text search (server-side, full history) -->
				<div class="relative ml-auto w-1/3">
					<Search class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input type="text" placeholder="Search all transcripts..." class="h-8 w-full pl-8 text-sm" bind:value={state.searchQuery} />
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Results -->
	{#if state.error}
		<Card class="gap-0 border-border/60 py-0">
			<CardContent class="px-3.5 py-8 text-center text-sm text-destructive">{state.error}</CardContent>
		</Card>
	{:else if state.results.length > 0}
		<div class="space-y-3">
			{#each state.results as transcript (transcript.callId)}
				<TranscriptCard {transcript} alertFeed={state.alertFeed} query={state.searchQuery.trim()} />
			{/each}
		</div>
	{:else if state.isLoading || !state.hasSearched}
		<Card class="gap-0 border-border/60 py-0">
			<CardContent class="px-3.5 py-8 text-center text-sm text-muted-foreground">Loading transcripts…</CardContent>
		</Card>
	{:else}
		<Card class="gap-0 border-border/60 py-0">
			<CardContent class="px-3.5 py-8 text-center text-sm text-muted-foreground">No transcripts match your filters.</CardContent>
		</Card>
	{/if}

	<!-- Bottom pagination -->
	{#if state.results.length > 0}
		<div class="flex justify-end">
			{@render pagination()}
		</div>
	{/if}
</div>
