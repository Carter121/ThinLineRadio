<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import LogIn from '@lucide/svelte/icons/log-in';
	import LoginDialog from '$lib/features/LoginDialog.svelte';
	import AlertMiniMap from '$lib/features/alert-history/AlertMiniMap.svelte';
	import { TlrClient, TlrApiError } from '$lib/core/tlr-client.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import type { CallMeta, TranscriptAnnotationUnit, TranscriptAnnotationChannel } from '$lib/core/types.ts';
	import {
		formatDateTime,
		formatDuration,
		formatUnitName,
		formatChannelName,
		formatMapsUrl,
		getTranscriptHTML
	} from '$lib/core/format.ts';

	//* Standalone route (no [tab] layout), so it builds its own client like /register
	const client = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());

	let meta = $state<CallMeta | null>(null);
	let loadState = $state<'loading' | 'ready' | 'not-found' | 'error' | 'login'>('loading');
	let loginOpen = $state(false);

	//* LoginDialog mutates isLoggingIn, so this must be reactive state
	const loginHandler = $state({
		isLoggingIn: false,
		onLoginSuccess: async () => {
			await load();
		}
	});

	//* Audio is fetched over HTTP into a Blob (no websocket needed on this page)
	let audio: HTMLAudioElement | null = null;
	let audioUrl: string | null = null;
	let audioReady = $state(false);
	let audioLoading = $state(false);
	let audioError = $state('');
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);

	const subtitle = $derived(
		meta ? [meta.systemLabel, meta.talkgroupLabel ?? meta.talkgroupName].filter(Boolean).join(' / ') || 'Unknown' : ''
	);
	const units = $derived([
		...new Map(
			(meta?.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationUnit => a.type === 'unit')
				.map((a) => [`${a.apparatus}-${a.number}`, a])
		).values()
	]);
	const channels = $derived([
		...new Map(
			(meta?.transcriptAnnotations ?? [])
				.filter((a): a is TranscriptAnnotationChannel => a.type === 'channel')
				.map((a) => [`${a.dispatch}-${a.channel}`, a])
		).values()
	]);
	const geocodedMatch = $derived(meta?.parsedAddress?.match ?? null);
	const mapsUrl = $derived(geocodedMatch ? formatMapsUrl(geocodedMatch) : null);

	async function load() {
		if (!client.isAuthenticated) {
			loadState = 'login';
			loginOpen = true;
			return;
		}

		loadState = 'loading';
		try {
			meta = await client.getCallMeta(page.params.callId ?? '');
			loadState = 'ready';
			//* Prefetch audio so the play tap can call play() synchronously (iOS autoplay policy)
			if (meta.hasAudio) void loadAudio(meta.callId);
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

	async function loadAudio(callId: number) {
		audioLoading = true;
		audioError = '';
		try {
			const blob = await client.getCallAudioBlob(callId);
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
			audioReady = true;
		} catch {
			audioError = 'Audio unavailable';
		} finally {
			audioLoading = false;
		}
	}

	function togglePlay() {
		if (!audio) return;
		if (audio.paused) void audio.play();
		else audio.pause();
	}

	function stopPlayback() {
		if (!audio) return;
		audio.pause();
		audio.currentTime = 0;
		currentTime = 0;
	}

	onMount(load);

	onDestroy(() => {
		audio?.pause();
		if (audioUrl) URL.revokeObjectURL(audioUrl);
	});
</script>

<svelte:head>
	<title>TLR Alert</title>
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
				<p class="text-sm text-muted-foreground">Sign in to view this alert.</p>
				<Button onclick={() => (loginOpen = true)}>Sign in</Button>
			</CardContent>
		</Card>
	{:else if loadState === 'not-found'}
		<Card class="border-border/60">
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<p class="text-sm text-muted-foreground">Alert not found, or you do not have access to it.</p>
				<Button href="/" variant="outline">Go to dashboard</Button>
			</CardContent>
		</Card>
	{:else if loadState === 'error'}
		<Card class="border-border/60">
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<p class="text-sm text-muted-foreground">Something went wrong loading this alert.</p>
				<Button variant="outline" onclick={load}>Retry</Button>
			</CardContent>
		</Card>
	{:else if meta}
		<!-- Header -->
		<div class="space-y-0.5 px-1">
			<h1 class="text-base font-semibold text-foreground">{subtitle}</h1>
			{#if meta.timestamp}
				<p class="text-xs text-muted-foreground">{formatDateTime(meta.timestamp)}</p>
			{/if}
		</div>

		<!-- Map preview -->
		{#if geocodedMatch}
			<Card class="gap-0 overflow-hidden border-border/60 py-0">
				<div class="h-56 w-full">
					<AlertMiniMap lat={geocodedMatch.lat} lon={geocodedMatch.lon} />
				</div>
				<CardContent class="flex items-center gap-2 p-3">
					<p class="min-w-0 flex-1 text-xs text-muted-foreground">
						<MapPin class="mr-1 inline size-3" />
						{geocodedMatch.fullAddress}
					</p>
					{#if mapsUrl}
						<a href={mapsUrl} target="_blank" rel="noopener noreferrer" class="shrink-0">
							<Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs text-muted-foreground">
								<MapPin class="size-3.5" />
								Maps
							</Button>
						</a>
					{/if}
				</CardContent>
			</Card>
		{/if}

		<!-- Transcript -->
		<Card class="border-border/60">
			<CardContent class="space-y-3 p-4">
				{#if meta.alertSummary}
					<p class="rounded-md border-l-2 border-primary bg-primary/10 p-3 text-sm font-medium text-foreground">
						{meta.alertSummary}
					</p>
				{/if}

				{#if meta.transcript}
					<p class="text-sm leading-relaxed text-foreground">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html getTranscriptHTML(meta)}
					</p>
				{:else if meta.transcriptionStatus === 'pending' || meta.transcriptionStatus === 'processing'}
					<p class="text-sm text-muted-foreground">Transcription is still in progress.</p>
				{:else}
					<p class="text-sm text-muted-foreground">Transcript not available.</p>
				{/if}

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

				{#if !geocodedMatch}
					<p class="text-xs text-muted-foreground">
						<MapPin class="mr-1 inline size-3" />
						No location
					</p>
				{/if}
			</CardContent>
		</Card>

		<!-- Audio player -->
		{#if meta.hasAudio}
			<Card class="border-border/60">
				<CardContent class="flex items-center gap-2 p-3">
					{#if audioLoading}
						<Loader2 class="size-4 animate-spin text-muted-foreground" />
						<span class="text-xs text-muted-foreground">Loading audio</span>
					{:else if audioError}
						<span class="text-xs text-destructive">{audioError}</span>
					{:else if audioReady}
						<Button variant="secondary" size="sm" class="size-9 shrink-0 rounded-full p-0" onclick={togglePlay}>
							{#if isPlaying}
								<Pause class="size-4" />
							{:else}
								<Play class="size-4" />
							{/if}
						</Button>
						<span class="font-mono text-xs text-muted-foreground tabular-nums">
							{formatDuration(currentTime)} / {formatDuration(duration)}
						</span>
						<Button
							variant="ghost"
							size="sm"
							class="ml-auto size-8 p-0 text-muted-foreground hover:text-foreground"
							onclick={stopPlayback}
						>
							<Square class="size-3.5" />
						</Button>
					{/if}
				</CardContent>
			</Card>
		{/if}

		<a href="/" class="px-1 text-xs text-muted-foreground underline-offset-2 hover:underline">Open dashboard</a>
	{/if}
</div>

<LoginDialog {client} dashboardState={loginHandler} bind:open={loginOpen} />
