<script lang="ts">
	import type { Alert, TranscriptAnnotationUnit, TranscriptAnnotationChannel } from '$lib/core/types.ts';
	import type { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
	import {
		formatRelativeTime,
		formatAbsoluteTime,
		formatDuration,
		formatUnitName,
		formatChannelName,
		formatMapsUrl,
		getTranscriptHTML,
		displayAddress,
		isExactMatch,
		sortUnits
	} from '$lib/core/format.ts';
	import AlertMiniMap from './AlertMiniMap.svelte';
	import { Card, CardContent } from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MapPin from '@lucide/svelte/icons/map-pin';

	let { alert, alertFeed, nowMs, query }: { alert: Alert; alertFeed: AlertFeedCardState; nowMs: number; query: string } = $props();

	const subtitle = $derived([alert.systemLabel, alert.talkgroupLabel ?? alert.talkgroupName].filter(Boolean).join(' / ') || 'Unknown');
	const units = $derived(
		sortUnits([
			...new Map(
				(alert.transcriptAnnotations ?? [])
					.filter((a): a is TranscriptAnnotationUnit => a.type === 'unit')
					.map((a) => [`${a.apparatus}-${a.number}`, a])
			).values()
		])
	);
	const channels = $derived([
		...new Map(
			(alert.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationChannel => a.type === 'channel')
				.map((a) => [`${a.dispatch}-${a.channel}`, a])
		).values()
	]);
	const hasBattalion = $derived(units.some((u) => u.apparatus === 'BATTALION'));
	const isFire = $derived(alert.fireTier === 'structure' || alert.fireTier === 'wildland');
	const geocodedMatch = $derived(alert.parsedAddress?.match ?? null);
	const addressText = $derived(displayAddress(alert.parsedAddress));
	const isApprox = $derived(!!geocodedMatch && !isExactMatch(geocodedMatch));
	const isUncertain = $derived(geocodedMatch?.precision === 'uncertain');
	const mapsUrl = $derived(alert.parsedAddress?.match ? formatMapsUrl(alert.parsedAddress.match) : null);
	const isActive = $derived(alertFeed.alertPlaybackCallId === alert.callId);
</script>

<!--* Battalion tint wins over the fire tint when both apply -->
<Card class={['h-56 gap-0 overflow-hidden border-border/60 py-0', hasBattalion ? 'bg-destructive/15' : isFire && 'bg-fire/15']}>
	<CardContent class="flex h-full gap-0 p-0">
		<!-- Left side: content -->
		<div class="flex flex-1 flex-col p-4">
			<!-- Top: header + transcript -->
			<div class="min-h-0 flex-1 space-y-2 overflow-y-auto">
				<!-- Row 1: Metadata header -->
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-foreground">
							{subtitle}
						</span>
					</div>
					<span class="shrink-0 text-xs text-muted-foreground" title={formatAbsoluteTime(alert.createdAt)}>
						{formatRelativeTime(alert.createdAt, nowMs)}
					</span>
				</div>

				<!-- Row 2: Transcript -->
				{#if alert.transcript}
					<p class="text-sm leading-relaxed text-foreground">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html getTranscriptHTML(alert, query)}
					</p>
				{/if}
			</div>

			<!-- Bottom: units, address, playback — pinned to bottom -->
			<div class="mt-auto space-y-2 pt-2">
				<!-- Units and channels -->
				{#if units.length > 0 || channels.length > 0}
					<div class="flex flex-wrap items-center gap-1.5">
						{#each units as unit (`${unit.apparatus}-${unit.number}`)}
							<Badge variant="outline" class="text-[11px]">{formatUnitName(unit)}</Badge>
						{/each}
						{#each channels as channel (`${channel.dispatch}-${channel.channel}`)}
							<Badge variant="secondary" class="text-[11px]">{formatChannelName(channel)}</Badge>
						{/each}
					</div>
				{/if}

				<!-- Address line -->
				<p
					class="text-xs text-muted-foreground"
					title={isUncertain
						? `Unconfirmed match: ${geocodedMatch?.fullAddress}`
						: isApprox
							? `Approximate match: ${geocodedMatch?.fullAddress}`
							: undefined}
				>
					<MapPin class="mr-1 inline size-3" />
					{addressText ?? 'No location'}
					{#if isUncertain}
						<span class="opacity-60">(unconfirmed location)</span>
					{:else if isApprox}
						<span class="opacity-60">(approx. location)</span>
					{/if}
				</p>

				<!-- Playback controls + Maps link -->
				<div class="flex items-center gap-1.5">
					{#if isActive}
						<Button
							variant="ghost"
							size="sm"
							class="size-7 p-0"
							onclick={() => alertFeed.toggleAlertPlayPause()}
							disabled={alertFeed.alertPlaybackLoading || !!alertFeed.alertPlaybackError}
						>
							{#if alertFeed.alertPlaybackLoading}
								<Loader2 class="size-3.5 animate-spin" />
							{:else if alertFeed.alertIsPlaying}
								<Pause class="size-3.5" />
							{:else}
								<Play class="size-3.5" />
							{/if}
						</Button>
						<span class="font-mono text-xs text-muted-foreground tabular-nums">
							{formatDuration(alertFeed.alertCurrentTime)} / {formatDuration(alertFeed.alertDuration)}
						</span>
						{#if alertFeed.alertPlaybackError}
							<span class="text-xs text-destructive">{alertFeed.alertPlaybackError}</span>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							class="size-7 p-0 text-muted-foreground hover:text-foreground"
							onclick={() => alertFeed.stopAlertPlayback()}
						>
							<Square class="size-3.5" />
						</Button>
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-2 text-xs text-muted-foreground"
							onclick={() => alertFeed.playAlertCall(alert.callId)}
						>
							<Play class="size-3.5" />
							Play
						</Button>
					{/if}
					{#if mapsUrl}
						<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="ml-auto">
							<Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-muted-foreground">
								<MapPin class="size-3.5" />
								Maps
							</Button>
						</a>
					{/if}
				</div>
			</div>
		</div>

		<!-- Right side: Mini map or placeholder (fills card height) -->
		<div class="flex w-48 shrink-0 items-center justify-center border-l border-border/60">
			{#if geocodedMatch}
				<AlertMiniMap lat={geocodedMatch.lat} lon={geocodedMatch.lon} />
			{:else}
				<div class="flex flex-col items-center gap-1.5 text-muted-foreground/40">
					<MapPin class="size-6" />
					<span class="text-[11px]">No location</span>
				</div>
			{/if}
		</div>
	</CardContent>
</Card>
