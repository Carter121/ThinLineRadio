<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { AlertHistoryState } from './AlertHistoryState.svelte.ts';
	import AlertCard from './AlertCard.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Search from '@lucide/svelte/icons/search';
	import { getAudioCoordinator, getTlrClient, getTlrAlertFeed } from '$lib/core/context.ts';

	function changePage(page: number) {
		state.setPage(page);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	const state = new AlertHistoryState(getTlrAlertFeed(), getAudioCoordinator(), getTlrClient());

	onMount(() => state.start());
	onDestroy(() => state.destroy());

	const selectedSystemLabel = $derived(state.systems.find((s) => s.value === state.systemFilter)?.label ?? state.systemFilter);

	const selectedTalkgroupLabel = $derived(state.talkgroupsForSystem.find((t) => t.value === state.talkgroupFilter)?.label ?? state.talkgroupFilter);

	$effect.pre(() => {
		if (state.systems.length === 1) state.systemFilter = state.systems[0].value;
	});
</script>

{#snippet pagination()}
	<div class="flex items-center gap-1.5">
		<span class="text-xs text-muted-foreground">
			{state.currentPage} / {state.pageCount}
		</span>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={state.currentPage <= 1}
			onclick={() => changePage(state.currentPage - 1)}
			aria-label="Previous page"
		>
			<ChevronLeft class="size-3.5" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={state.currentPage >= state.pageCount}
			onclick={() => changePage(state.currentPage + 1)}
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
					<ClipboardList class="size-3.5" />
					Alert Log
					<Badge variant="secondary" class="ml-1 text-[11px]">{state.filteredAlerts.length}</Badge>
				</div>
				{#if state.pageCount > 1}
					{@render pagination()}
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="px-3.5 pt-0 pb-3.5">
			<div class="flex flex-wrap items-center gap-2">
				<!-- System Select -->
				<Select type="single" bind:value={state.systemFilter}>
					<SelectTrigger size="sm" class="w-40">
						{selectedSystemLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="All Systems" label="All Systems" />
						{#each state.systems as sys (sys.value)}
							<SelectItem value={sys.value} label={sys.label} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Talkgroup Select -->
				<Select type="single" bind:value={state.talkgroupFilter} disabled={state.systemFilter === 'All Systems'}>
					<SelectTrigger size="sm" class="w-44">
						{selectedTalkgroupLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="All Talkgroups" label="All Talkgroups" />
						{#each state.talkgroupsForSystem as tg (tg.value)}
							<SelectItem value={tg.value} label={tg.label} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Battalion Only toggle -->
				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					<Switch bind:checked={state.battalionOnly} />
					Battalion
				</label>

				<!-- Text search -->
				<div class="relative ml-auto w-1/3">
					<Search class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input type="text" placeholder="Search transcripts..." class="h-8 w-full pl-8 text-sm" bind:value={state.searchQuery} />
				</div>
			</div>
		</CardContent>
	</Card>

	<!-- Alert cards list -->
	<div>
		{#if state.pagedAlerts.length > 0}
			<div class="space-y-3">
				{#each state.pagedAlerts as alert (alert.alertId)}
					<AlertCard {alert} alertFeed={state.alertFeed} nowMs={state.nowMs} query={state.searchQuery} />
				{/each}
			</div>
		{:else}
			<Card class="gap-0 border-border/60 py-0">
				<CardContent class="px-3.5 py-8 text-center text-sm text-muted-foreground">No alerts match your filters.</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Bottom pagination -->
	{#if state.pageCount > 1}
		<div class="flex justify-end">
			{@render pagination()}
		</div>
	{/if}
</div>
