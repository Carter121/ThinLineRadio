<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import LogIn from '@lucide/svelte/icons/log-in';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LoginDialog from '$lib/features/LoginDialog.svelte';
	import AlertMiniMap from '$lib/features/alert-history/AlertMiniMap.svelte';
	import { TlrClient, TlrApiError } from '$lib/core/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import type { IncidentDetail, IncidentCall, TranscriptAnnotationUnit, TranscriptAnnotationChannel } from '$lib/core/types.ts';
	import { formatDateTime, formatDuration, formatUnitName, formatChannelName, getTranscriptHTML } from '$lib/core/format.ts';

	//* Standalone route (no [tab] layout), so it builds its own client like /alert
	const client = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());

	let incident = $state<IncidentDetail | null>(null);
	let loadState = $state<'loading' | 'ready' | 'not-found' | 'error' | 'login'>('loading');
	let loginOpen = $state(false);

	//* LoginDialog mutates isLoggingIn, so this must be reactive state
	const loginHandler = $state({
		isLoggingIn: false,
		onLoginSuccess: async () => {
			await load();
		}
	});

	//* One shared audio element; playing a call stops the previous one
	let audio: HTMLAudioElement | null = null;
	let audioUrl: string | null = null;
	let playingCallId = $state<number | null>(null);
	let audioLoading = $state(false);
	let audioError = $state('');
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);

	const title = $derived(incident?.incidentType || 'Incident');
	//* Units accumulated across all member calls, deduped by apparatus-number
	const units = $derived([
		...new Map(
			(incident?.calls ?? [])
				.flatMap((c) => c.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationUnit => a.type === 'unit')
				.map((a) => [`${a.apparatus}-${a.number}`, a])
		).values()
	]);

	function callChannels(call: IncidentCall): TranscriptAnnotationChannel[] {
		return [
			...new Map(
				(call.transcriptAnnotations ?? [])
					.filter((a): a is TranscriptAnnotationChannel => a.type === 'channel')
					.map((a) => [`${a.dispatch}-${a.channel}`, a])
			).values()
		];
	}

	async function load() {
		if (!client.isAuthenticated) {
			loadState = 'login';
			loginOpen = true;
			return;
		}

		loadState = 'loading';
		try {
			incident = await client.getIncident(page.params.id ?? '');
			loadState = 'ready';
		} catch (err) {
			if (err instanceof TlrApiError && err.status === 401) {
				client.clearPin();
				loadState = 'login';
				loginOpen = true;
			} else if (err instanceof TlrApiError && err.status === 404) {
				loadState = 'not-found';
			} else {
				loadState = 'error';
			}
		}
	}

	function releaseAudio() {
		audio?.pause();
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		audio = null;
		audioUrl = null;
		isPlaying = false;
		currentTime = 0;
		duration = 0;
	}

	async function playCall(callId: number) {
		if (playingCallId === callId && audio) {
			if (audio.paused) void audio.play();
			else audio.pause();
			return;
		}

		releaseAudio();
		playingCallId = callId;
		audioLoading = true;
		audioError = '';
		try {
			const blob = await client.getCallAudioBlob(callId);
			if (playingCallId !== callId) return;
			audioUrl = URL.createObjectURL(blob);
			const element = new Audio(audioUrl);
			element.addEventListener('play', () => (isPlaying = true));
			element.addEventListener('pause', () => (isPlaying = false));
			element.addEventListener('ended', () => {
				isPlaying = false;
				currentTime = 0;
			});
			element.addEventListener('timeupdate', () => (currentTime = element.currentTime));
			element.addEventListener('loadedmetadata', () => {
				if (Number.isFinite(element.duration)) duration = element.duration;
			});
			element.addEventListener('error', () => (audioError = 'Playback failed'));
			audio = element;
			void element.play();
		} catch {
			audioError = 'Audio unavailable';
		} finally {
			audioLoading = false;
		}
	}

	function stopPlayback() {
		releaseAudio();
		playingCallId = null;
	}

	onMount(load);
	onDestroy(releaseAudio);
</script>

<svelte:head>
	<title>TLR Incident</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-lg flex-col gap-3">
	{#if loadState === 'loading'}
		<div class="space-y-3">
			<Skeleton class="h-6 w-3/4" />
			<Skeleton class="h-56 w-full rounded-lg" />
			<Skeleton class="h-40 w-full rounded-lg" />
		</div>
	{:else if loadState === 'login'}
		<Card class="border-border/60">
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<LogIn class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">Sign in to view this incident.</p>
				<Button onclick={() => (loginOpen = true)}>Sign in</Button>
			</CardContent>
		</Card>
	{:else if loadState === 'not-found'}
		<Card class="border-border/60">
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<p class="text-sm text-muted-foreground">Incident not found, or you do not have access to it.</p>
				<Button href="/" variant="outline">Go to dashboard</Button>
			</CardContent>
		</Card>
	{:else if loadState === 'error'}
		<Card class="border-border/60">
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<p class="text-sm text-muted-foreground">Something went wrong loading this incident.</p>
				<Button variant="outline" onclick={load}>Retry</Button>
			</CardContent>
		</Card>
	{:else if incident}
		<!-- Header -->
		<div class="space-y-1 px-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-base font-semibold text-foreground">{title}</h1>
				{#if incident.fireTier === 'structure' || incident.fireTier === 'wildland'}
					<Badge variant="destructive" class="text-[11px] capitalize">{incident.fireTier} fire</Badge>
				{/if}
				<Badge variant={incident.open ? 'default' : 'secondary'} class="text-[11px]">
					{incident.open ? 'Active' : 'Closed'}
				</Badge>
				<Badge variant="outline" class="text-[11px]">{incident.callCount} calls</Badge>
			</div>
			{#if incident.address}
				<p class="text-xs text-muted-foreground">
					<MapPin class="mr-1 inline size-3" />
					{incident.address}
				</p>
			{/if}
			<p class="text-xs text-muted-foreground">
				{formatDateTime(incident.firstSeenAt)}
				{#if incident.lastSeenAt !== incident.firstSeenAt}
					<span class="opacity-60">to {formatDateTime(incident.lastSeenAt)}</span>
				{/if}
			</p>
		</div>

		<!-- Map preview -->
		{#if incident.lat != null && incident.lon != null}
			<Card class="gap-0 overflow-hidden border-border/60 py-0">
				<div class="h-56 w-full">
					<AlertMiniMap lat={incident.lat} lon={incident.lon} />
				</div>
			</Card>
		{/if}

		<!-- Accumulated units -->
		{#if units.length > 0}
			<Card class="border-border/60 py-0">
				<CardContent class="flex flex-wrap items-center gap-1.5 p-3">
					<span class="mr-1 text-xs font-medium text-muted-foreground">Units</span>
					{#each units as unit (`${unit.apparatus}-${unit.number}`)}
						<Badge variant="outline" class="text-[11px]">{formatUnitName(unit)}</Badge>
					{/each}
				</CardContent>
			</Card>
		{/if}

		<!-- Call timeline -->
		<Card class="border-border/60 py-0">
			<CardContent class="p-4">
				<div class="space-y-3">
					{#each incident.calls as call, index (call.callId)}
						{#if index > 0}
							<Separator />
						{/if}
						<div class="space-y-1.5">
							<div class="flex items-center justify-between gap-2">
								<span class="text-xs font-medium text-foreground">
									{[call.systemLabel, call.talkgroupLabel].filter(Boolean).join(' / ') || 'Unknown'}
									{#each callChannels(call) as channel (`${channel.dispatch}-${channel.channel}`)}
										<Badge variant="secondary" class="ml-1 text-[10px]">{formatChannelName(channel)}</Badge>
									{/each}
								</span>
								<span class="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(call.timestamp)}</span>
							</div>

							{#if call.transcript}
								<p class="text-sm leading-relaxed text-foreground">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html getTranscriptHTML(call)}
								</p>
							{/if}

							<div class="flex items-center gap-1.5">
								{#if playingCallId === call.callId}
									{#if audioLoading}
										<Loader2 class="size-3.5 animate-spin text-muted-foreground" />
									{:else if audioError}
										<span class="text-[11px] text-destructive">{audioError}</span>
									{:else}
										<Button variant="ghost" size="sm" class="size-6 p-0" onclick={() => playCall(call.callId)}>
											{#if isPlaying}
												<Pause class="size-3" />
											{:else}
												<Play class="size-3" />
											{/if}
										</Button>
										<span class="font-mono text-[11px] text-muted-foreground tabular-nums">
											{formatDuration(currentTime)} / {formatDuration(duration)}
										</span>
										<Button variant="ghost" size="sm" class="size-6 p-0 text-muted-foreground hover:text-foreground" onclick={stopPlayback}>
											<Square class="size-3" />
										</Button>
									{/if}
								{:else}
									<Button
										variant="ghost"
										size="sm"
										class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
										onclick={() => playCall(call.callId)}
									>
										<Play class="size-3" />
										Play
									</Button>
								{/if}
								<a href={`/alert/${call.callId}`} class="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline">
									Details
									<ExternalLink class="size-3" />
								</a>
							</div>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>

		<a href="/" class="px-1 text-xs text-muted-foreground underline-offset-2 hover:underline">Open dashboard</a>
	{/if}
</div>

<LoginDialog {client} dashboardState={loginHandler} bind:open={loginOpen} />
