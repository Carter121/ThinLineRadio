<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getTlrClient, getAudioCoordinator } from '$lib/apps/tlr/context.ts';
	import { CallHistoryState } from './CallHistoryState.svelte.ts';
	import { formatAbsoluteTime } from '$lib/apps/tlr/format.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import CallDatePicker from './CallDatePicker.svelte';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import X from '@lucide/svelte/icons/x';
	import Radio from '@lucide/svelte/icons/radio';
	import ChevronsUp from '@lucide/svelte/icons/chevrons-up';
	import ChevronsDown from '@lucide/svelte/icons/chevrons-down';

	let { activeTab = 'calls' }: { activeTab?: string } = $props();

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	const client = getTlrClient();
	const coordinator = getAudioCoordinator();
	const callState = new CallHistoryState(client, coordinator);

	onMount(() => callState.start());
	onDestroy(() => callState.destroy());

	// Progressive display for infinite scroll
	let displayCount = $state(20);
	let sentinel: HTMLElement | undefined = $state();

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver((entries) => {
			if (!entries[0].isIntersecting) return;
			if (displayCount < callState.allEnrichedCalls.length) {
				displayCount = Math.min(displayCount + 20, callState.allEnrichedCalls.length);
			} else if (callState.hasMore) {
				callState.loadMoreIfAvailable();
			}
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// Reset display count when new results arrive
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		callState.allEnrichedCalls;
		displayCount = 20;
	});

	// Scroll-to-top
	let scrolledFar = $state(false);
	let scrollEl: HTMLElement | null = null;

	function setupScroll(node: HTMLElement) {
		let el: HTMLElement | null = node.parentElement;
		while (el && !el.classList.contains('overflow-y-auto')) {
			el = el.parentElement;
		}
		scrollEl = el;
		if (!scrollEl) return;
		const onScroll = () => {
			scrolledFar = scrollEl!.scrollTop > window.innerHeight * 2;
		};
		scrollEl.addEventListener('scroll', onScroll, { passive: true });
		return {
			destroy() {
				scrollEl?.removeEventListener('scroll', onScroll);
			}
		};
	}

	function scrollToTop() {
		scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Filter sheet
	let filterSheetOpen = $state(false);
	let touchStartY = 0;

	function onSheetTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
	}

	function onSheetTouchMove(e: TouchEvent) {
		if (e.touches[0].clientY - touchStartY > 60) filterSheetOpen = false;
	}

	function applyFilters() {
		callState.search();
		filterSheetOpen = false;
	}

	// Derived labels for filter selects
	const selectedSystemLabel = $derived.by(() => {
		if (callState.systemFilter == null) return 'All Systems';
		for (const sys of callState.systems) {
			const ref = sys.systemRef ?? sys.id;
			if (ref === callState.systemFilter) return sys.label ?? String(ref);
		}
		return String(callState.systemFilter);
	});

	const selectedTalkgroupLabel = $derived.by(() => {
		if (callState.talkgroupFilter == null) return 'All Talkgroups';
		for (const tg of callState.talkgroupsForSystem) {
			const ref = tg.talkgroupRef ?? tg.id;
			if (ref === callState.talkgroupFilter) return tg.label ?? tg.name ?? String(ref);
		}
		return String(callState.talkgroupFilter);
	});

	const selectedGroupLabel = $derived(callState.groupFilter ?? 'All Groups');
	const nextPlaybackCall = $derived(callState.nextAutoPlayCall());

	const activeFilterCount = $derived(
		(callState.systemFilter != null ? 1 : 0) + (callState.talkgroupFilter != null ? 1 : 0) + (callState.groupFilter != null ? 1 : 0)
	);

	// Mini-player hairline progress — rAF loop for 60fps accuracy
	let liveCurrentTime = $state(0);

	$effect(() => {
		if (!callState.isPlaying) {
			liveCurrentTime = callState.currentTime;
			return;
		}
		let rafId: number;
		const tick = () => {
			liveCurrentTime = callState.getLiveCurrentTime();
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	const progressPct = $derived(callState.duration > 0 ? (liveCurrentTime / callState.duration) * 100 : 0);
</script>

<div use:setupScroll class="flex flex-col" style="min-height: calc(100dvh - 56px - env(safe-area-inset-bottom));">
	<!-- Filter header -->
	<div class="flex flex-wrap items-center gap-2 pt-1 pb-3">
		<Button variant="outline" size="sm" class="h-8 gap-1.5 rounded-full" onclick={() => (filterSheetOpen = true)}>
			<SlidersHorizontal class="size-3.5" />
			Filters
			{#if activeFilterCount > 0}
				<Badge class="ml-0.5 size-4 rounded-full p-0 text-[10px]">{activeFilterCount}</Badge>
			{/if}
		</Button>

		<Button
			variant="outline"
			size="sm"
			class="size-8 rounded-full p-0"
			onclick={() => callState.search()}
			disabled={callState.isLoading}
			aria-label="Refresh"
		>
			<RefreshCw class={['size-3.5', callState.isLoading && 'animate-spin']} />
		</Button>

		<Button
			variant={callState.isLoadingAll ? 'destructive' : 'outline'}
			size="sm"
			class="size-8 rounded-full p-0"
			onclick={() => (callState.isLoadingAll ? callState.cancelLoadAll() : callState.loadAll())}
			disabled={callState.isLoading && !callState.isLoadingAll}
			aria-label={callState.isLoadingAll ? 'Cancel loading all calls' : 'Load all calls'}
		>
			{#if callState.isLoadingAll}
				<X class="size-3.5" />
			{:else}
				<ChevronsDown class="size-3.5" />
			{/if}
		</Button>

		<!-- Active filter chips -->
		{#if callState.groupFilter != null}
			<button
				class="flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs text-primary"
				onclick={() => {
					callState.groupFilter = undefined;
					callState.talkgroupFilter = undefined;
					callState.search();
				}}
			>
				{callState.groupFilter}
				<X class="size-3" />
			</button>
		{/if}
		{#if callState.systemFilter != null}
			<button
				class="flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs text-primary"
				onclick={() => {
					callState.systemFilter = undefined;
					callState.talkgroupFilter = undefined;
					callState.search();
				}}
			>
				{selectedSystemLabel}
				<X class="size-3" />
			</button>
		{/if}
		{#if callState.talkgroupFilter != null}
			<button
				class="flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs text-primary"
				onclick={() => {
					callState.talkgroupFilter = undefined;
					callState.search();
				}}
			>
				{selectedTalkgroupLabel}
				<X class="size-3" />
			</button>
		{/if}
	</div>

	<!-- Call list -->
	<div class="flex-1 space-y-1.5 pb-4">
		{#if callState.isLoading && callState.allEnrichedCalls.length === 0}
			<div class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
				<Loader2 class="size-4 animate-spin" />
				<span>Loading calls...</span>
			</div>
		{:else if callState.allEnrichedCalls.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
				<Radio class="size-8 opacity-30" />
				<p class="text-sm">No calls found.</p>
			</div>
		{:else}
			{#each callState.allEnrichedCalls.slice(0, displayCount) as call (call.id)}
				{@const isActive = callState.playbackCallId === call.id}
				<button
					type="button"
					class={[
						'flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors',
						isActive ? 'border-primary/20 bg-primary/8' : 'border-border/60 bg-card hover:bg-muted/30'
					]}
					onclick={() => callState.playCall(call.id)}
				>
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-medium text-foreground">
							{call.talkgroupLabel ?? call.talkgroupName ?? call.talkgroup}
						</div>
						<div class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
							<span class="truncate">{call.systemLabel ?? call.system}</span>
							<span class="shrink-0">·</span>
							<span class="shrink-0">{formatAbsoluteTime(new Date(call.dateTime).getTime())}</span>
						</div>
					</div>
					{#if isActive}
						<span class="shrink-0 text-primary">
							{#if callState.playbackLoading}
								<Loader2 class="size-4 animate-spin" />
							{:else if callState.isPlaying}
								<Pause class="size-4" />
							{:else}
								<Play class="size-4" />
							{/if}
						</span>
					{/if}
				</button>
			{/each}

			<!-- Infinite scroll sentinel -->
			<div bind:this={sentinel} class="h-1"></div>

			{#if callState.isLoading}
				<div class="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
					<Loader2 class="size-3.5 animate-spin" />
					<span>{callState.isLoadingAll ? 'Loading all calls...' : 'Loading more...'}</span>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Mini-player -->
	{#if callState.playbackCall}
		<div
			class="sticky bottom-0 -mx-3 overflow-hidden rounded-t-2xl border-t border-border/40 bg-card/95 shadow-[0_-8px_32px_rgba(0,0,0,0.15)] backdrop-blur-xl"
		>
			<!-- Row 1: metadata -->
			<div class="flex min-w-0 items-baseline justify-between gap-2 px-4 pt-3 pb-1">
				<div class="min-w-0">
					<div class="truncate text-[13.5px] leading-tight font-semibold text-foreground">
						{callState.resolveTalkgroupLabel(callState.playbackCall.system, callState.playbackCall.talkgroup)}
					</div>
					{#if callState.playbackError}
						<div class="truncate text-xs text-destructive">{callState.playbackError}</div>
					{:else if nextPlaybackCall}
						<div class="truncate text-xs text-muted-foreground">
							Up next: {nextPlaybackCall.talkgroupLabel ?? nextPlaybackCall.talkgroupName ?? nextPlaybackCall.talkgroup}
						</div>
					{/if}
				</div>
				<span class="shrink-0 font-mono text-xs text-muted-foreground">
					{formatAbsoluteTime(new Date(callState.playbackCall.dateTime).getTime())}
				</span>
			</div>

			<!-- Row 2: centered controls -->
			<div class="flex items-center justify-center gap-2 px-3 pb-3">
				<!-- Skip older -->
				<button
					type="button"
					class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/90 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-30"
					onclick={() => callState.skipToOlder()}
					disabled={!callState.hasOlder}
					aria-label="Skip to older call"
				>
					<SkipBack class="size-4" />
				</button>

				<!-- Play / Pause -->
				<button
					type="button"
					class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/90 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-40"
					onclick={() => callState.togglePlayPause()}
					disabled={callState.playbackLoading || !!callState.playbackError}
					aria-label={callState.isPlaying ? 'Pause' : 'Play'}
				>
					{#if callState.playbackLoading}
						<Loader2 class="size-5 animate-spin" />
					{:else if callState.isPlaying}
						<Pause class="size-5" />
					{:else}
						<Play class="size-5" />
					{/if}
				</button>

				<!-- Skip newer -->
				<button
					type="button"
					class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/90 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-30"
					onclick={() => callState.skipToNewer()}
					disabled={!callState.hasNewer}
					aria-label="Skip to newer call"
				>
					<SkipForward class="size-4" />
				</button>
			</div>

			<!-- Hairline progress at very bottom -->
			<div class="h-0.5 bg-muted/40">
				<div class="h-full bg-primary" style="width: {progressPct}%"></div>
			</div>
		</div>
	{/if}
</div>

<!-- Scroll to top FAB -->
{#if scrolledFar && activeTab === 'calls'}
	<button
		use:portal
		type="button"
		class="fixed z-40 flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/95 shadow-lg backdrop-blur-sm transition-all"
		style="bottom: calc(env(safe-area-inset-bottom) + 56px + 1rem); right: 1rem;"
		onclick={scrollToTop}
		aria-label="Scroll to top"
	>
		<ChevronsUp class="size-4" />
	</button>
{/if}

<!-- Filter sheet backdrop -->
{#if filterSheetOpen && activeTab === 'calls'}
	<div use:portal class="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" role="presentation" onclick={() => (filterSheetOpen = false)}></div>
{/if}

<!-- Filter sheet -->
{#if activeTab === 'calls'}
	<div
		use:portal
		class="fixed inset-x-0 bottom-0 z-49 rounded-t-2xl bg-card transition-transform duration-200 ease-out"
		style="transform: translateY({filterSheetOpen ? '0' : '100%'}); padding-bottom: calc(env(safe-area-inset-bottom) + 56px);"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Filters"
		ontouchstart={onSheetTouchStart}
		ontouchmove={onSheetTouchMove}
	>
		<div class="mx-auto mt-3 mb-4 h-1 w-10 rounded-full bg-muted-foreground/30"></div>

		<div class="space-y-3 px-4">
			<Select
				type="single"
				value={callState.systemFilter != null ? String(callState.systemFilter) : undefined}
				onValueChange={(v) => {
					callState.systemFilter = v ? Number(v) : undefined;
					callState.talkgroupFilter = undefined;
				}}
			>
				<SelectTrigger size="sm" class="w-full">{selectedSystemLabel}</SelectTrigger>
				<SelectContent>
					<SelectItem value="" label="All Systems" />
					{#each callState.systems as sys (sys.systemRef ?? sys.id)}
						<SelectItem value={String(sys.systemRef ?? sys.id)} label={sys.label ?? String(sys.systemRef ?? sys.id)} />
					{/each}
				</SelectContent>
			</Select>

			<Select
				type="single"
				value={callState.groupFilter ?? undefined}
				onValueChange={(v) => {
					callState.groupFilter = v || undefined;
					callState.talkgroupFilter = undefined;
				}}
			>
				<SelectTrigger size="sm" class="w-full">{selectedGroupLabel}</SelectTrigger>
				<SelectContent>
					<SelectItem value="" label="All Groups" />
					{#each callState.groups as group (group)}
						<SelectItem value={group} label={group} />
					{/each}
				</SelectContent>
			</Select>

			<Select
				type="single"
				value={callState.talkgroupFilter != null ? String(callState.talkgroupFilter) : undefined}
				onValueChange={(v) => {
					callState.talkgroupFilter = v ? Number(v) : undefined;
				}}
				disabled={callState.systemFilter == null}
			>
				<SelectTrigger size="sm" class="w-full">{selectedTalkgroupLabel}</SelectTrigger>
				<SelectContent>
					<SelectItem value="" label="All Talkgroups" />
					{#each callState.talkgroupsForSystem as tg (tg.talkgroupRef ?? tg.id)}
						<SelectItem value={String(tg.talkgroupRef ?? tg.id)} label={tg.label ?? tg.name ?? String(tg.talkgroupRef ?? tg.id)} />
					{/each}
				</SelectContent>
			</Select>

			<CallDatePicker bind:value={callState.selectedDate} class="w-full" />

			<Button class="w-full" onclick={applyFilters} disabled={callState.isLoading}>
				{#if callState.isLoading}
					<Loader2 class="mr-2 size-3.5 animate-spin" />
				{/if}
				Search
			</Button>
		</div>
	</div>
{/if}
