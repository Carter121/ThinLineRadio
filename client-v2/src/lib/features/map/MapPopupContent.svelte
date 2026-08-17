<script lang="ts">
	import type { GeocodedIncident, MapPageState } from './MapPageState.svelte.ts';
	import { formatAbsoluteTime, formatDuration, formatRelativeTime, formatUnitName } from '$lib/core/format.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let { incident, pageState }: { incident: GeocodedIncident; pageState: MapPageState } = $props();

	const alertFeed = $derived(pageState.alertFeed);
	const isActive = $derived(alertFeed.alertPlaybackCallId === incident.alert.callId);
</script>

<div class="w-56 space-y-1.5 text-[13px] leading-snug">
	<!--* pr-4 keeps the timestamp clear of Leaflet's absolutely positioned close button. -->
	<div class="flex items-start justify-between gap-2 pr-4">
		<span class="font-semibold text-foreground">{incident.incidentType ?? 'Unknown incident'}</span>
		<span class="shrink-0 text-[11px] text-muted-foreground" title={formatAbsoluteTime(incident.alert.createdAt)}>
			{formatRelativeTime(incident.alert.createdAt, pageState.nowMs)}
		</span>
	</div>

	<p class="text-muted-foreground">{incident.address}</p>

	{#if incident.units.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each incident.units as unit (`${unit.apparatus}-${unit.number}`)}
				<Badge variant="outline" class="text-[10px]">{formatUnitName(unit)}</Badge>
			{/each}
		</div>
	{/if}

	<div class="flex items-center gap-1 pt-0.5">
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
		<a
			href={`/alert/${incident.alert.callId}`}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline"
		>
			Details
			<ExternalLink class="size-3" />
		</a>
	</div>
</div>
