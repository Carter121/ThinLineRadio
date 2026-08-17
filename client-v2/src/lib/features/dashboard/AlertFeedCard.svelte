<script lang="ts">
	import { formatRelativeTime, formatAbsoluteTime, formatDuration, formatChannelName, formatMapsUrl, getTranscriptHTML } from '$lib/core/format.ts';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Alert as AlertBox, AlertTitle, AlertDescription } from '$lib/components/ui/alert/index.ts';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import type { AlertFeedCardState } from './AlertFeedCardState.svelte.ts';
	import { appSettings } from '$lib/core/app-settings.svelte.ts';
	import type { Alert, TranscriptAnnotationChannel } from '$lib/core/types.ts';
	import { groupAlertsByIncident } from '$lib/core/incident-grouping.ts';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Layers from '@lucide/svelte/icons/layers';
	let { state: cardState }: { state: AlertFeedCardState } = $props();

	//* One row per incident group; a threaded incident shows its newest call
	const groups = $derived(groupAlertsByIncident(cardState.alerts));

	function alertSubtitle(alert: Alert): string {
		return [alert.systemLabel, alert.talkgroupLabel ?? alert.talkgroupName].filter(Boolean).join(' / ');
	}

	//* Renders the alert time according to the user's preference. "both" shows the
	//* absolute clock time first (the value used to find audio on the calls page)
	//* followed by the relative time so no mental math is needed.
	function formatAlertTime(alert: Alert): string {
		const timestamp = alert.callTimestamp ?? alert.createdAt;
		const abs = formatAbsoluteTime(timestamp);
		const rel = formatRelativeTime(timestamp, cardState.nowMs);
		if (appSettings.timeFormat.current === 'absolute') return abs;
		if (appSettings.timeFormat.current === 'relative') return rel;
		return `${abs} · ${rel}`;
	}

	function getMapsUrl(alert: Alert): string | null {
		const match = alert.parsedAddress?.match;
		if (!match) return null;
		return formatMapsUrl(match);
	}

	function getUniqueChannels(alert: Alert): TranscriptAnnotationChannel[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, TranscriptAnnotationChannel>();
		for (const a of alert.transcriptAnnotations ?? []) {
			if (a.type === 'channel') {
				const key = `${a.dispatch}-${a.channel}`;
				if (!map.has(key)) map.set(key, a);
			}
		}
		return [...map.values()];
	}
</script>

<Card class="flex flex-col gap-0 border-border/60 py-0">
	<CardHeader class="flex-none px-3.5 pt-3 pb-2">
		<div class="flex items-center justify-between">
			<CardTitle class="text-sm">Live Alert Feed</CardTitle>
			<div class="flex items-center text-sm text-muted-foreground">
				<p title="{cardState.alertAddressStats.matched}/{cardState.alertAddressStats.total}">
					Address: {cardState.alertAddressPercentage.toFixed(0)}%
				</p>
			</div>
		</div>
	</CardHeader>
	<CardContent class="flex-1 overflow-hidden p-0">
		{#if !cardState.authenticated}
			<div class="px-3.5 pb-3">
				<div class="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-center">
					<p class="text-sm text-muted-foreground">Log in to view alerts, transcripts, and system data.</p>
				</div>
			</div>
		{:else if cardState.isHydrating && cardState.alerts.length === 0}
			<div class="px-3.5 pb-3 text-center text-sm text-muted-foreground">Loading alerts...</div>
		{:else if cardState.alerts.length === 0}
			<div class="px-3.5 pb-3 text-center text-sm text-muted-foreground">No recent alerts.</div>
		{:else}
			<div class="max-h-150 overflow-y-auto px-3.5 pb-3">
				<div class="space-y-1.5">
					{#each groups as group (group.key)}
						{@const alert = group.newest}
						{@const mapsUrl = getMapsUrl(alert)}
						<AlertBox
							class={[
								'px-3 py-2',
								cardState.newAlertIds.has(alert.alertId) && 'animate-flash',
								//* Battalion tint wins over the fire tint when both apply
								alert.transcriptAnnotations?.some((a) => a.type === 'unit' && a.apparatus === 'BATTALION')
									? 'bg-destructive/15'
									: (alert.fireTier === 'structure' || alert.fireTier === 'wildland') && 'bg-fire/15'
							]}
						>
							{@const channels = getUniqueChannels(alert)}
							<AlertTitle class="flex items-center justify-between gap-2 text-muted-foreground">
								<span class="flex items-center gap-1.5 truncate">
									<span class="truncate">{alertSubtitle(alert) || 'Unknown'}</span>
									{#if group.alerts.length > 1}
										<Badge variant="outline" class="h-full shrink-0 gap-1 text-[11px] leading-none text-muted-foreground">
											<Layers class="size-2.5" />
											{group.alerts.length} calls
										</Badge>
									{/if}
									{#each channels as channel (`${channel.dispatch}-${channel.channel}`)}
										<Badge variant="secondary" class="h-full shrink-0 text-[11px] leading-none text-muted-foreground"
											>{formatChannelName(channel)}</Badge
										>
									{/each}
								</span>
								<span class="shrink-0 text-[11px] font-normal text-muted-foreground" title={formatAbsoluteTime(alert.createdAt)}>
									{#if alert.matchedToneSetName}
										<span class="opacity-60">{alert.matchedToneSetName} &middot; </span>
									{/if}
									{formatAlertTime(alert)}
								</span>
							</AlertTitle>
							{#if alert.transcript}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<AlertDescription class="text-foreground"><span>{@html getTranscriptHTML(alert)}</span></AlertDescription>
							{/if}
							{@const isActive = cardState.alertPlaybackCallId === alert.callId}
							<div class="mt-1.5 flex flex-nowrap items-center gap-1.5">
								{#if isActive}
									<Button
										variant="ghost"
										size="sm"
										class="size-6 p-0"
										onclick={(e: MouseEvent) => {
											e.stopPropagation();
											cardState.toggleAlertPlayPause();
										}}
										disabled={cardState.alertPlaybackLoading || !!cardState.alertPlaybackError}
									>
										{#if cardState.alertPlaybackLoading}
											<Loader2 class="size-3 animate-spin" />
										{:else if cardState.alertIsPlaying}
											<Pause class="size-3" />
										{:else}
											<Play class="size-3" />
										{/if}
									</Button>
									<span class="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
										>{formatDuration(cardState.alertCurrentTime)}
										/ {formatDuration(cardState.alertDuration)}</span
									>
									{#if cardState.alertPlaybackError}
										<span class="text-[11px] text-destructive">{cardState.alertPlaybackError}</span>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										class="size-6 p-0 text-muted-foreground hover:text-foreground"
										onclick={(e: MouseEvent) => {
											e.stopPropagation();
											cardState.stopAlertPlayback();
										}}
									>
										<Square class="size-3" />
									</Button>
								{:else}
									<Button
										variant="ghost"
										size="sm"
										class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
										onclick={(e: MouseEvent) => {
											e.stopPropagation();
											cardState.playAlertCall(alert.callId);
										}}
									>
										<Play class="size-3" />
										Play
									</Button>
								{/if}
								{#if group.incidentId != null && group.alerts.length > 1}
									<a href={`/incident/${group.incidentId}`} class="ml-auto" onclick={(e: MouseEvent) => e.stopPropagation()}>
										<Button variant="ghost" size="sm" class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground">
											<Layers class="size-3" />
											Incident
										</Button>
									</a>
								{/if}
								{#if mapsUrl}
									<a
										href={mapsUrl}
										target="_blank"
										rel="noopener noreferrer"
										class={group.incidentId != null && group.alerts.length > 1 ? '' : 'ml-auto'}
										onclick={(e: MouseEvent) => e.stopPropagation()}
									>
										<Button variant="ghost" size="sm" class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground">
											<MapPin class="size-3" />
											Map
										</Button>
									</a>
								{/if}
							</div>
						</AlertBox>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>

<style>
	@keyframes flash {
		0%,
		10%,
		20%,
		30%,
		40%,
		50%,
		60%,
		70%,
		80%,
		90%,
		100% {
			background-color: transparent;
		}
		5%,
		15%,
		25%,
		35%,
		45%,
		55%,
		65%,
		75%,
		85%,
		95% {
			background-color: var(--color-accent);
		}
	}

	:global(.animate-flash) {
		animation: flash 2s linear;
	}
</style>
