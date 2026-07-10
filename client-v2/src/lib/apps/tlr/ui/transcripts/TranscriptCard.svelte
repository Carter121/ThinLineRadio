<script lang="ts">
	import type { Transcript, TranscriptAnnotationUnit, TranscriptAnnotationChannel } from '$lib/apps/tlr/types.ts';
	import type { AlertFeedCardState } from '../dashboard/AlertFeedCardState.svelte.ts';
	import { formatDateTime, formatDuration, formatUnitName, formatChannelName, getTranscriptHTML } from '$lib/apps/tlr/format.ts';
	import { Card, CardContent } from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';

	let { transcript, alertFeed, query }: { transcript: Transcript; alertFeed: AlertFeedCardState; query: string } = $props();

	const subtitle = $derived([transcript.systemLabel, transcript.talkgroupLabel ?? transcript.talkgroupName].filter(Boolean).join(' / ') || 'Unknown');
	const units = $derived([
		...new Map(
			(transcript.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationUnit => a.type === 'unit')
				.map((a) => [`${a.apparatus}-${a.number}`, a])
		).values()
	]);
	const channels = $derived([
		...new Map(
			(transcript.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationChannel => a.type === 'channel')
				.map((a) => [`${a.dispatch}-${a.channel}`, a])
		).values()
	]);
	const isActive = $derived(alertFeed.alertPlaybackCallId === transcript.callId);
</script>

<Card class="gap-0 border-border/60 py-0">
	<CardContent class="space-y-2 p-4">
		<!-- Metadata header -->
		<div class="flex items-center justify-between gap-2">
			<span class="text-sm font-medium text-foreground">{subtitle}</span>
			<span class="shrink-0 text-xs text-muted-foreground">{formatDateTime(transcript.timestamp)}</span>
		</div>

		<!-- Transcript -->
		{#if transcript.transcript}
			<p class="text-sm leading-relaxed text-foreground">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html getTranscriptHTML(transcript, query)}
			</p>
		{/if}

		{#if transcript.alertSummary}
			<p class="text-xs text-muted-foreground italic">{transcript.alertSummary}</p>
		{/if}

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

		<!-- Playback controls -->
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
					onclick={() => alertFeed.playAlertCall(transcript.callId)}
				>
					<Play class="size-3.5" />
					Play
				</Button>
			{/if}
		</div>
	</CardContent>
</Card>
