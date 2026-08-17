<script lang="ts">
	import { TIME_WINDOWS, type MapPageState } from './MapPageState.svelte.ts';
	import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';

	let { pageState }: { pageState: MapPageState } = $props();
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between gap-2">
		<ToggleGroup
			type="single"
			size="sm"
			variant="outline"
			bind:value={
				() => pageState.timeWindow,
				(v) => {
					if (v) pageState.timeWindow = v as typeof pageState.timeWindow;
				}
			}
		>
			{#each TIME_WINDOWS as w (w.value)}
				<ToggleGroupItem value={w.value} class="h-7 px-2.5 text-xs">{w.label}</ToggleGroupItem>
			{/each}
		</ToggleGroup>
		<Badge variant="secondary" class="text-[11px] whitespace-nowrap">
			{pageState.filteredIncidents.length} / {pageState.incidents.length}
		</Badge>
	</div>

	{#if pageState.incidentTypes.length > 1}
		<div class="overflow-x-auto">
			<ToggleGroup
				type="multiple"
				size="sm"
				variant="outline"
				class="w-max justify-start"
				bind:value={() => pageState.typeFilter, (v) => (pageState.typeFilter = v)}
			>
				{#each pageState.incidentTypes as type (type)}
					<ToggleGroupItem value={type} class="h-7 px-2.5 text-xs whitespace-nowrap">{type}</ToggleGroupItem>
				{/each}
			</ToggleGroup>
		</div>
	{/if}
</div>
