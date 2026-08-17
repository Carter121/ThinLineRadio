<script lang="ts">
	import type { GeocodedIncident, MapPageState } from './MapPageState.svelte.ts';
	import { ageBand } from './age-bands.ts';
	import { formatAbsoluteTime, formatDuration, formatRelativeTime, formatUnitName } from '$lib/core/format.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';

	let { incident, pageState, onselect }: { incident: GeocodedIncident; pageState: MapPageState; onselect?: (incident: GeocodedIncident) => void } =
		$props();

	const alertFeed = $derived(pageState.alertFeed);
	const band = $derived(ageBand(incident.alert.createdAt, pageState.nowMs));
	const isActive = $derived(alertFeed.alertPlaybackCallId === incident.alert.callId);
	const isSelected = $derived(pageState.selectedAlertId === incident.alert.alertId);

	function handleSelect() {
		pageState.select(incident.alert.alertId, 'list');
		onselect?.(incident);
	}
</script>

<div
	role="button"
	tabindex="0"
	onclick={handleSelect}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleSelect();
		}
	}}
	class={[
		'w-full cursor-pointer space-y-1 rounded-md border px-3 py-2 text-left transition-colors',
		isSelected ? 'border-primary/50 bg-accent' : 'border-transparent hover:bg-accent/50'
	]}
>
	<div class="flex items-start gap-2">
		<span class="mt-1 size-2.5 shrink-0 rounded-full" style:background-color={band.color} style:opacity={band.opacity}></span>
		<div class="min-w-0 flex-1">
			<div class="flex items-baseline justify-between gap-2">
				<span class="truncate text-sm font-medium text-foreground">{incident.incidentType ?? 'Unknown incident'}</span>
				<span class="shrink-0 text-[11px] text-muted-foreground" title={formatAbsoluteTime(incident.alert.createdAt)}>
					{formatRelativeTime(incident.alert.createdAt, pageState.nowMs)}
				</span>
			</div>
			<p class="truncate text-xs text-muted-foreground">{incident.address}</p>
		</div>
	</div>

	{#if incident.units.length > 0}
		<div class="flex flex-wrap gap-1 pl-4.5">
			{#each incident.units.slice(0, 6) as unit (`${unit.apparatus}-${unit.number}`)}
				<Badge variant="outline" class="text-[10px]">{formatUnitName(unit)}</Badge>
			{/each}
			{#if incident.units.length > 6}
				<Badge variant="secondary" class="text-[10px]">+{incident.units.length - 6}</Badge>
			{/if}
		</div>
	{/if}

	<!--* stopPropagation keeps audio taps from also selecting/flying. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="flex items-center gap-1 pl-4.5" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
		{#if isActive}
			<Button
				variant="ghost"
				size="sm"
				class="size-6 p-0"
				onclick={() => alertFeed.toggleAlertPlayPause()}
				disabled={alertFeed.alertPlaybackLoading || !!alertFeed.alertPlaybackError}
			>
				{#if alertFeed.alertPlaybackLoading}
					<Loader2 class="size-3 animate-spin" />
				{:else if alertFeed.alertIsPlaying}
					<Pause class="size-3" />
				{:else}
					<Play class="size-3" />
				{/if}
			</Button>
			<span class="font-mono text-[11px] text-muted-foreground tabular-nums">
				{formatDuration(alertFeed.alertCurrentTime)} / {formatDuration(alertFeed.alertDuration)}
			</span>
			{#if alertFeed.alertPlaybackError}
				<span class="text-[11px] text-destructive">{alertFeed.alertPlaybackError}</span>
			{/if}
			<Button variant="ghost" size="sm" class="size-6 p-0 text-muted-foreground hover:text-foreground" onclick={() => alertFeed.stopAlertPlayback()}>
				<Square class="size-3" />
			</Button>
		{:else}
			<Button
				variant="ghost"
				size="sm"
				class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
				onclick={() => alertFeed.playAlertCall(incident.alert.callId)}
			>
				<Play class="size-3" />
				Play
			</Button>
		{/if}
	</div>
</div>
