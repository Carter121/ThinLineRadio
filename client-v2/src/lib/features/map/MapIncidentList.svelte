<script lang="ts">
	import type { GeocodedIncident, MapPageState } from './MapPageState.svelte.ts';
	import MapFilters from './MapFilters.svelte';
	import MapIncidentRow from './MapIncidentRow.svelte';
	import MapPinOff from '@lucide/svelte/icons/map-pin-off';

	let { pageState, onRowSelect }: { pageState: MapPageState; onRowSelect?: (incident: GeocodedIncident) => void } = $props();

	//* Row elements by alertId so marker clicks can scroll the list.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const rowElements = new Map<number, HTMLElement>();

	$effect(() => {
		const id = pageState.selectedAlertId;
		if (id == null || pageState.selectionSource !== 'map') return;
		rowElements.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="shrink-0 border-b border-border px-3 py-2">
		<MapFilters {pageState} />
	</div>

	<div class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
		{#each pageState.filteredIncidents as incident (incident.alert.alertId)}
			<div
				bind:this={
					() => rowElements.get(incident.alert.alertId),
					(el) => {
						if (el) rowElements.set(incident.alert.alertId, el);
						else rowElements.delete(incident.alert.alertId);
					}
				}
			>
				<MapIncidentRow {incident} {pageState} onselect={onRowSelect} />
			</div>
		{:else}
			<div class="flex flex-col items-center gap-2 py-10 text-muted-foreground/60">
				<MapPinOff class="size-6" />
				<p class="text-sm">No incidents match the current filters</p>
			</div>
		{/each}
	</div>
</div>
