<script lang="ts">
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Alert, Incident } from '$lib/core/types';
	import { incidentManagement as management } from '../incidents/incident-management.svelte';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { AlertHistoryState } from './AlertHistoryState.svelte.ts';
	import IncidentGroupCard from './IncidentGroupCard.svelte';
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
		history.setPage(page);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	const client = getTlrClient();
	const feed = getTlrAlertFeed();
	const history = new AlertHistoryState(feed, getAudioCoordinator(), client);
	const selected = new SvelteMap<number, Alert>();
	let selecting = $state(false);
	let destination = $state<Incident | null>(null);
	let destinationError = $state('');
	const canManage = $derived(feed.allAlerts.some((alert) => alert.canManageIncidents));
	function selectAlert(alert: Alert, checked: boolean) {
		if (checked) selected.set(alert.callId, alert);
		else selected.delete(alert.callId);
	}
	$effect(() => {
		void history.systemFilter;
		void history.talkgroupFilter;
		void history.searchQuery;
		void history.battalionOnly;
		untrack(() => selected.clear());
	});
	$effect(() => {
		const id = page.url.searchParams.get('incident');
		destination = null;
		destinationError = '';
		if (id) {
			selecting = true;
			let active = true;
			client
				.getIncident(id)
				.then((value) => {
					if (active) destination = value;
				})
				.catch(() => {
					if (active) destinationError = 'Destination incident is unavailable.';
				});
			return () => {
				active = false;
			};
		}
	});
	const clearSelection = () => selected.clear();
	onMount(() => {
		window.addEventListener('tlr-incidents-changed', clearSelection);
		return () => window.removeEventListener('tlr-incidents-changed', clearSelection);
	});

	onMount(() => history.start());
	onDestroy(() => history.destroy());

	const selectedSystemLabel = $derived(history.systems.find((s) => s.value === history.systemFilter)?.label ?? history.systemFilter);

	const selectedTalkgroupLabel = $derived(
		history.talkgroupsForSystem.find((t) => t.value === history.talkgroupFilter)?.label ?? history.talkgroupFilter
	);

	$effect.pre(() => {
		if (history.systems.length === 1) history.systemFilter = history.systems[0].value;
	});
</script>

{#snippet pagination()}
	<div class="flex items-center gap-1.5">
		<span class="text-xs text-muted-foreground">
			{history.currentPage} / {history.pageCount}
		</span>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={history.currentPage <= 1}
			onclick={() => changePage(history.currentPage - 1)}
			aria-label="Previous page"
		>
			<ChevronLeft class="size-3.5" />
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="size-7 p-0"
			disabled={history.currentPage >= history.pageCount}
			onclick={() => changePage(history.currentPage + 1)}
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
					<Badge variant="secondary" class="ml-1 text-[11px]">{history.filteredGroups.length}</Badge>
				</div>
				{#if history.pageCount > 1}
					{@render pagination()}
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="px-3.5 pt-0 pb-3.5">
			<div class="flex flex-wrap items-center gap-2">
				<!-- System Select -->
				<Select type="single" bind:value={history.systemFilter}>
					<SelectTrigger size="sm" class="w-40">
						{selectedSystemLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="All Systems" label="All Systems" />
						{#each history.systems as sys (sys.value)}
							<SelectItem value={sys.value} label={sys.label} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Talkgroup Select -->
				<Select type="single" bind:value={history.talkgroupFilter} disabled={history.systemFilter === 'All Systems'}>
					<SelectTrigger size="sm" class="w-44">
						{selectedTalkgroupLabel}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="All Talkgroups" label="All Talkgroups" />
						{#each history.talkgroupsForSystem as tg (tg.value)}
							<SelectItem value={tg.value} label={tg.label} />
						{/each}
					</SelectContent>
				</Select>

				<!-- Battalion Only toggle -->
				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					<Switch bind:checked={history.battalionOnly} />
					Battalion
				</label>

				<!-- Text search -->
				<div class="relative ml-auto w-1/3">
					<Search class="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input type="text" placeholder="Search transcripts..." class="h-8 w-full pl-8 text-sm" bind:value={history.searchQuery} />
				</div>
			</div>
		</CardContent>
	</Card>

	{#if canManage}
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				onclick={() => {
					selecting = !selecting;
					selected.clear();
				}}>{selecting ? 'Cancel selection' : 'Select alerts'}</Button
			>
			{#if selecting}
				<span class="text-sm text-muted-foreground">{selected.size} unique calls selected</span>
				<Button disabled={!selected.size} onclick={() => management.show(client, 'create', [...selected.values()])}>Create incident</Button>
				<Button variant="outline" disabled={!selected.size} onclick={() => management.show(client, 'assign', [...selected.values()], destination)}
					>{destination ? `Add to #${destination.incidentId}` : 'Add to incident'}</Button
				>
			{/if}
			{#if destinationError}<p role="alert" class="text-sm text-destructive">{destinationError}</p>{/if}
		</div>
	{/if}

	<!-- Alert cards list -->
	<div>
		{#if history.pagedGroups.length > 0}
			<div class="space-y-3">
				{#each history.pagedGroups as group (group.key)}
					<IncidentGroupCard
						{group}
						alertFeed={history.alertFeed}
						nowMs={history.nowMs}
						query={history.searchQuery}
						{selecting}
						selectedIds={[...selected.keys()]}
						onselect={selectAlert}
					/>
				{/each}
			</div>
		{:else}
			<Card class="gap-0 border-border/60 py-0">
				<CardContent class="px-3.5 py-8 text-center text-sm text-muted-foreground">No alerts match your filters.</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Bottom pagination -->
	{#if history.pageCount > 1}
		<div class="flex justify-end">
			{@render pagination()}
		</div>
	{/if}
</div>
