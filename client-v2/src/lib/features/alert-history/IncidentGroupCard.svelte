<script lang="ts">
	import type { IncidentGroup } from '$lib/core/incident-grouping.ts';
	import type { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
	import AlertCard from './AlertCard.svelte';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '$lib/components/ui/collapsible/index.ts';
	import { formatUnitName } from '$lib/core/format.ts';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Layers from '@lucide/svelte/icons/layers';

	let {
		group,
		alertFeed,
		nowMs,
		query = ''
	}: { group: IncidentGroup; alertFeed: AlertFeedCardState; nowMs: number; query?: string } = $props();

	let expanded = $state(false);
</script>

{#if group.alerts.length === 1}
	<AlertCard alert={group.newest} {alertFeed} {nowMs} {query} />
{:else}
	<div class="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-2">
		<!--* Incident header: type, call count, accumulated units, detail link -->
		<div class="flex flex-wrap items-center gap-1.5 px-1.5 pt-0.5">
			<Layers class="size-3.5 text-muted-foreground" />
			<span class="text-sm font-medium text-foreground">{group.incidentType ?? 'Incident'}</span>
			<Badge variant="secondary" class="text-[11px]">{group.alerts.length} calls</Badge>
			<span class="ml-1 flex flex-wrap items-center gap-1">
				{#each group.units.slice(0, 8) as unit (`${unit.apparatus}-${unit.number}`)}
					<Badge variant="outline" class="text-[10px]">{formatUnitName(unit)}</Badge>
				{/each}
				{#if group.units.length > 8}
					<Badge variant="secondary" class="text-[10px]">+{group.units.length - 8}</Badge>
				{/if}
			</span>
			{#if group.incidentId != null}
				<a href={`/incident/${group.incidentId}`} class="ml-auto">
					<Button variant="ghost" size="sm" class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground">
						Incident
						<ExternalLink class="size-3" />
					</Button>
				</a>
			{/if}
		</div>

		<AlertCard alert={group.newest} {alertFeed} {nowMs} {query} />

		<Collapsible bind:open={expanded}>
			<CollapsibleTrigger
				class="flex w-full cursor-pointer items-center justify-center gap-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
			>
				<ChevronDown class={['size-3.5 transition-transform', expanded && 'rotate-180']} />
				{expanded ? 'Hide' : 'Show'} {group.alerts.length - 1} earlier {group.alerts.length === 2 ? 'call' : 'calls'}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div class="space-y-2 pt-1">
					{#each group.alerts.slice(1) as alert (alert.alertId)}
						<AlertCard {alert} {alertFeed} {nowMs} {query} />
					{/each}
				</div>
			</CollapsibleContent>
		</Collapsible>
	</div>
{/if}
