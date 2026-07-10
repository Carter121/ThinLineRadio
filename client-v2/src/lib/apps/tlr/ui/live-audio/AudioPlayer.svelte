<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Slider } from '$lib/components/ui/slider';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import Radio from '@lucide/svelte/icons/radio';
	import History from '@lucide/svelte/icons/history';
	import Settings from '@lucide/svelte/icons/settings';
	import Square from '@lucide/svelte/icons/square';
	import ChannelSelectDialog from './ChannelSelectDialog.svelte';
	import type { SvelteDate } from 'svelte/reactivity';
	import { formatRelativeTime, formatAbsoluteTime, formatDuration, formatFrequency } from '$lib/apps/tlr/format.ts';
	import type { AudioPlayerState } from './AudioPlayerState.svelte.ts';
	import type { TlrConfig } from '$lib/apps/tlr/types.ts';

	let {
		player,
		config,
		now,
		standalone = false
	}: { player: AudioPlayerState; config: TlrConfig | null; now: SvelteDate; standalone?: boolean } = $props();

	let channelDialogOpen = $state(false);
	let previousVolume = $state(0.8);

	const skipDisabled = $derived(!player.current && player.queue.length === 0);

	const hasChannelsSelected = $derived.by(() => {
		for (const talkgroups of Object.values(player.selectedTalkgroups)) {
			for (const enabled of Object.values(talkgroups)) {
				if (enabled) return true;
			}
		}
		return false;
	});

	const selectedChannelCount = $derived.by(() => {
		let count = 0;
		for (const talkgroups of Object.values(player.selectedTalkgroups)) {
			for (const enabled of Object.values(talkgroups)) {
				if (enabled) count++;
			}
		}
		return count;
	});

	function toggleMute() {
		if (player.volume > 0) {
			previousVolume = player.volume;
			player.setVolume(0);
		} else {
			player.setVolume(previousVolume > 0 ? previousVolume : 0.8);
		}
	}

	const metadataParts = $derived.by(() => {
		if (!player.current) return [];
		const parts: string[] = [];
		if (player.current.talkgroupId) parts.push(`TG ${player.current.talkgroupId}`);
		if (player.current.source) {
			const alias = player.current.sources?.find((s) => s.src === player.current!.source)?.tag;
			parts.push(alias ? `Unit ${alias}` : `Unit ${player.current.source}`);
		} else if (player.current.sources?.length) {
			parts.push(`${player.current.sources.length} units`);
		}
		const freq = formatFrequency(player.current.frequency);
		if (freq) parts.push(freq);
		if (player.current.site) parts.push(`Site ${player.current.site}`);
		return parts;
	});
</script>

<Card class={['gap-0 border-border/60 py-0', player.isLive && 'border-emerald-500/30']}>
	<CardHeader class="px-3.5 pt-3 pb-2">
		<div class="flex items-center justify-between">
			<CardTitle class="flex items-center gap-2 text-sm">
				<Radio class="size-3.5" />
				Live Audio
				{#if player.isLive}
					<span class="relative inline-flex size-2 shrink-0 align-middle">
						<span class="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
						<span class="size-2 rounded-full bg-emerald-500"></span>
					</span>
				{/if}
			</CardTitle>
			<Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onclick={() => (channelDialogOpen = true)}>
				<Settings class="size-3" />
				Channels
				{#if hasChannelsSelected}
					<Badge variant="secondary" class="px-1.5 py-0 text-[10px]">{selectedChannelCount}</Badge>
				{/if}
			</Button>
		</div>
	</CardHeader>

	<CardContent class={[player.isLive && 'min-h-80', 'px-3.5 pt-0 pb-3.5']}>
		{#if !hasChannelsSelected}
			<div class="flex flex-col items-center gap-2.5 py-4 text-center">
				<p class="text-sm text-muted-foreground">Select channels to listen to live radio calls.</p>
				<Button variant="outline" size="sm" class="gap-1.5" onclick={() => (channelDialogOpen = true)}>
					<Settings class="size-3.5" />
					Select Channels
				</Button>
			</div>
		{:else if !player.isLive}
			<div class="flex flex-col items-center gap-2.5 py-4 text-center">
				<p class="text-xs text-muted-foreground">
					{selectedChannelCount} channel{selectedChannelCount === 1 ? '' : 's'} selected
				</p>
				<Button variant="default" size="sm" class="gap-1.5" onclick={() => player.toggleLive()}>
					<Play class="size-3.5" />
					Start Listening
				</Button>
			</div>
		{:else}
			<div class="space-y-2.5">
				<!-- Now Playing -->
				{#if player.current}
					<div class="rounded-md bg-muted/30 px-3 py-2.5">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">
									{[player.current.systemLabel, player.current.talkgroupLabel].filter(Boolean).join(' / ') || 'Unknown'}
								</p>
								{#if metadataParts.length > 0}
									<p class="mt-0.5 truncate text-xs text-muted-foreground">
										{metadataParts.join(' \u00b7 ')}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-0.5">
								<span class="text-[11px] text-muted-foreground tabular-nums" title={formatAbsoluteTime(player.current.timestamp)}>
									{formatRelativeTime(player.current.timestamp, now.getTime())}
								</span>
								{#if player.current.hasTones}
									<span class="text-[11px] text-amber-500">Tones</span>
								{/if}
							</div>
						</div>
						{#if player.current.transcript}
							<p class="mt-1.5 line-clamp-2 border-t border-border/40 pt-1.5 text-sm leading-snug text-foreground/80">
								{player.current.transcript}
							</p>
						{/if}
					</div>
					{#if player.autoplayBlocked}
						<Button variant="outline" size="sm" class="w-full text-xs" onclick={() => player.play()}>Click to enable audio</Button>
					{/if}
				{:else}
					<div class="rounded-md bg-muted/30 px-3 py-2.5">
						<p class="text-center text-sm text-muted-foreground">Waiting for calls...</p>
						<p class="mt-0.5 text-xs text-transparent select-none">&nbsp;</p>
					</div>
				{/if}

				<!-- Controls bar -->
				<div class="flex items-center gap-1.5 rounded-md bg-muted/20 px-2 py-1.5">
					<Button
						variant="ghost"
						size="sm"
						class="size-8 p-0"
						onclick={() => (player.isPlaying ? player.pause() : player.play())}
						aria-label={player.isPlaying ? 'Pause' : 'Play'}
					>
						{#if player.isPlaying}
							<Pause class="size-4" />
						{:else}
							<Play class="size-4" />
						{/if}
					</Button>

					<Button variant="ghost" size="sm" class="size-8 p-0" disabled={skipDisabled} onclick={() => player.skip()} aria-label="Skip">
						<SkipForward class="size-4" />
					</Button>

					<span class="min-w-14 text-center font-mono text-xs text-muted-foreground tabular-nums">
						{formatDuration(player.currentTime)} / {formatDuration(player.duration)}
					</span>

					<div class="ml-auto flex items-center gap-1.5">
						{#if player.queue.length > 0}
							<span class="text-[11px] text-muted-foreground tabular-nums">{player.queue.length} queued</span>
						{/if}

						<button
							type="button"
							class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
							onclick={toggleMute}
							aria-label={player.volume > 0 ? 'Mute' : 'Unmute'}
						>
							{#if player.volume > 0}
								<Volume2 class="size-3.5" />
							{:else}
								<VolumeX class="size-3.5" />
							{/if}
						</button>

						<Slider
							type="single"
							value={player.volume * 100}
							onValueChange={(v) => player.setVolume(v / 100)}
							min={0}
							max={100}
							step={1}
							class="w-16"
						/>

						<Button
							variant="ghost"
							size="sm"
							class="size-7 p-0 text-muted-foreground hover:text-destructive"
							onclick={() => player.toggleLive()}
							aria-label="Stop listening"
						>
							<Square class="size-3.5" />
						</Button>
					</div>
				</div>

				<!-- Recent Calls -->
				<div class="space-y-1">
					<p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
						<History class="size-3" />
						Recent Calls
					</p>
					<div class={['overflow-y-auto rounded-md border border-border/40', standalone ? 'max-h-[calc(100dvh-24rem)]' : 'h-57']}>
						{#if player.history.length > 0}
							{#each player.history as item (item.callId)}
								{@const isActive = player.current?.callId === item.callId}
								{@const parts = [
									item.source ? `Unit ${item.sources?.find((s) => s.src === item.source)?.tag ?? item.source}` : null,
									formatFrequency(item.frequency)
								].filter(Boolean)}
								<button
									type="button"
									class={[
										'flex w-full items-start justify-between gap-2 border-b border-border/30 px-2.5 py-1.5 text-left transition-colors last:border-b-0 hover:bg-muted/40',
										isActive && 'bg-muted/50'
									]}
									onclick={() => player.playFromHistory(item.callId)}
								>
									<span class="min-w-0 flex-1">
										<span class={['block truncate text-xs font-medium', isActive ? 'text-foreground' : 'text-foreground/80']}>
											{[item.systemLabel, item.talkgroupLabel].filter(Boolean).join(' / ') || 'Unknown'}
										</span>
										{#if parts.length > 0}
											<span class="block truncate text-[11px] text-muted-foreground">
												{parts.join(' \u00b7 ')}
											</span>
										{/if}
									</span>
									<span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" title={formatAbsoluteTime(item.timestamp)}>
										{formatRelativeTime(item.timestamp, now.getTime())}
									</span>
								</button>
							{/each}
						{:else}
							<div class="flex h-full items-center justify-center">
								<p class="text-xs text-muted-foreground">No recent calls</p>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</CardContent>
</Card>

<ChannelSelectDialog bind:open={channelDialogOpen} {player} {config} />
