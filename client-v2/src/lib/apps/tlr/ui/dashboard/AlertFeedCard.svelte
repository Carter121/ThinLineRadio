<script lang="ts">
	import {
		formatRelativeTime,
		formatAbsoluteTime,
		formatDuration,
		formatChannelName,
		formatMapsUrl,
		getTranscriptHTML
	} from '$lib/apps/tlr/format.ts';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Alert as AlertBox, AlertTitle, AlertDescription } from '$lib/components/ui/alert/index.ts';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select/index.ts';
	import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '$lib/components/ui/sheet/index.ts';
	import Settings from '@lucide/svelte/icons/settings';
	import { PersistedState } from 'runed';
	import type { AlertFeedCardState } from './AlertFeedCardState.svelte.ts';
	import type { Alert, TranscriptAnnotationChannel } from '$lib/apps/tlr/types.ts';
	import MapPin from '@lucide/svelte/icons/map-pin';
	let { state: cardState, standalone = false }: { state: AlertFeedCardState; standalone?: boolean } = $props();
	let settingsOpen = $state(false);

	// Time display defaults to absolute on the PWA and relative on desktop.
	// Separate keys keep each context's preference (and default) independent.
	// svelte-ignore state_referenced_locally
	const timeFormat = new PersistedState<'absolute' | 'relative' | 'both'>(
		standalone ? 'tlr-alert-time-format-pwa' : 'tlr-alert-time-format-desktop',
		standalone ? 'absolute' : 'relative'
	);

	function alertSubtitle(alert: Alert): string {
		return [alert.systemLabel, alert.talkgroupLabel ?? alert.talkgroupName].filter(Boolean).join(' / ');
	}

	//* Renders the alert time according to the user's preference. "both" shows the
	//* absolute clock time first (the value used to find audio on the calls page)
	//* followed by the relative time so no mental math is needed.
	function formatAlertTime(alert: Alert): string {
		const abs = formatAbsoluteTime(alert.createdAt);
		const rel = formatRelativeTime(alert.createdAt, cardState.nowMs);
		if (timeFormat.current === 'absolute') return abs;
		if (timeFormat.current === 'relative') return rel;
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
				<Button variant="ghost" size="sm" class="size-7 p-0 text-muted-foreground" onclick={() => (settingsOpen = true)}>
					<Settings class="size-3.5" />
				</Button>
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
			<div class={['overflow-y-auto px-3.5 pb-3', !standalone && 'max-h-150']}>
				<div class="space-y-1.5">
					{#each cardState.alerts as alert (alert.alertId)}
						{@const mapsUrl = getMapsUrl(alert)}
						<AlertBox
							class={[
								'px-3 py-2',
								cardState.newAlertIds.has(alert.alertId) && 'animate-flash',
								alert.transcriptAnnotations?.some((a) => a.type === 'unit' && a.apparatus === 'BATTALION') && 'bg-destructive/15'
							]}
						>
							{@const channels = getUniqueChannels(alert)}
							<AlertTitle class="flex items-center justify-between gap-2 text-muted-foreground">
								<span class="flex items-center gap-1.5 truncate">
									<span class="truncate">{alertSubtitle(alert) || 'Unknown'}</span>
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
								{#if mapsUrl}
									<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="ml-auto" onclick={(e: MouseEvent) => e.stopPropagation()}>
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

<Sheet bind:open={settingsOpen}>
	<SheetContent>
		<SheetHeader>
			<SheetTitle>Alert Settings</SheetTitle>
			<SheetDescription>Configure which alerts trigger notifications and audio.</SheetDescription>
		</SheetHeader>
		<div class="px-4">
			<div class="space-y-1.5">
				<label for="notification-filter" class="text-sm font-medium">Notification Filter</label>
				<Select
					type="single"
					value={cardState.notificationFilter.current}
					onValueChange={(v) => {
						if (v === 'all' || v === 'battalion-only') cardState.notificationFilter.current = v;
					}}
				>
					<SelectTrigger id="notification-filter" size="sm" class="w-full">
						{cardState.notificationFilter.current === 'battalion-only' ? 'Battalion Only' : 'All Alerts'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all" label="All Alerts" />
						<SelectItem value="battalion-only" label="Battalion Only" />
					</SelectContent>
				</Select>
				<p class="text-xs text-muted-foreground">Choose whether to receive notifications for all alerts or only those with a battalion unit.</p>
			</div>
			<div class="mt-4 space-y-1.5">
				<label for="time-format" class="text-sm font-medium">Time Display</label>
				<Select
					type="single"
					value={timeFormat.current}
					onValueChange={(v) => {
						if (v === 'absolute' || v === 'relative' || v === 'both') timeFormat.current = v;
					}}
				>
					<SelectTrigger id="time-format" size="sm" class="w-full">
						{timeFormat.current === 'absolute' ? 'Absolute' : timeFormat.current === 'relative' ? 'Relative' : 'Both'}
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="relative" label="Relative (e.g. 5m ago)" />
						<SelectItem value="absolute" label="Absolute (clock time)" />
						<SelectItem value="both" label="Both" />
					</SelectContent>
				</Select>
				<p class="text-xs text-muted-foreground">Show alert times as relative, an absolute clock time, or both.</p>
			</div>
		</div>
	</SheetContent>
</Sheet>

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
