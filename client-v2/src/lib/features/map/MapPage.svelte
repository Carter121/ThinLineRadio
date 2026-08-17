<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getAudioCoordinator, getTlrAlertFeed, getTlrClient } from '$lib/core/context.ts';
	import { MapPageState } from './MapPageState.svelte.ts';
	import IncidentMap from './IncidentMap.svelte';
	import MapIncidentList from './MapIncidentList.svelte';
	import { Sheet, SheetContent, SheetHeader, SheetTitle } from '$lib/components/ui/sheet/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import List from '@lucide/svelte/icons/list';

	const feed = getTlrAlertFeed();
	const coordinator = getAudioCoordinator();
	const client = getTlrClient();

	const pageState = new MapPageState(feed, coordinator, client);

	onMount(() => pageState.start());
	onDestroy(() => pageState.destroy());

	let sheetOpen = $state(false);
</script>

<div class="flex h-full w-full">
	<!--* isolate traps Leaflet's internal z-indexes so app chrome renders above the map. -->
	<div class="min-w-0 flex-1 sm:p-2">
		<div class="relative isolate h-full w-full overflow-hidden sm:rounded-lg sm:border sm:border-border">
			<IncidentMap {pageState} />

			<div class="absolute bottom-3 left-1/2 z-[1000] -translate-x-1/2 lg:hidden">
				<Button variant="outline" size="sm" class="bg-background/90 shadow-md backdrop-blur" onclick={() => (sheetOpen = true)}>
					<List class="size-4" />
					Incidents ({pageState.filteredIncidents.length})
				</Button>
			</div>
		</div>
	</div>

	<div class="hidden w-96 shrink-0 py-2 pr-2 lg:flex">
		<div class="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-background">
			<MapIncidentList {pageState} />
		</div>
	</div>
</div>

<Sheet bind:open={sheetOpen}>
	<SheetContent side="bottom" class="flex h-[65dvh] flex-col gap-0 p-0 pb-[env(safe-area-inset-bottom)]">
		<SheetHeader class="shrink-0 border-b border-border px-4 py-2.5">
			<SheetTitle class="text-sm">Incidents</SheetTitle>
		</SheetHeader>
		<div class="min-h-0 flex-1">
			<MapIncidentList {pageState} onRowSelect={() => (sheetOpen = false)} />
		</div>
	</SheetContent>
</Sheet>
