<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
	import { setTlrClient, setAudioCoordinator, setTlrAlertFeed } from '$lib/apps/tlr/context.ts';
	import { AudioCoordinator } from '$lib/apps/tlr/ui/AudioCoordinator.svelte.ts';
	import { TlrAlertFeed } from '$lib/apps/tlr/tlr-alert-feed.svelte.ts';
	import { PwaState } from '$lib/apps/tlr/ui/pwa/PwaState.svelte.ts';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import type { CarouselAPI } from '$lib/components/ui/carousel/context.ts';
	import * as Carousel from '$lib/components/ui/carousel/index.ts';
	import BottomNav from '$lib/apps/tlr/ui/pwa/BottomNav.svelte';
	import MoreSheet from '$lib/apps/tlr/ui/pwa/MoreSheet.svelte';
	import LoginDialog from '$lib/apps/tlr/ui/LoginDialog.svelte';
	import AlertFeedCard from '$lib/apps/tlr/ui/dashboard/AlertFeedCard.svelte';
	import PwaCallHistory from '$lib/apps/tlr/ui/call-history/PwaCallHistory.svelte';
	import IncidentMap from '$lib/apps/tlr/ui/map/IncidentMap.svelte';
	import AudioPlayer from '$lib/apps/tlr/ui/live-audio/AudioPlayer.svelte';
	import StatsCard from '$lib/apps/tlr/ui/dashboard/StatsCard.svelte';
	import UnitInfoCard from '$lib/apps/tlr/ui/dashboard/UnitInfoCard.svelte';
	import ApparatusCard from '$lib/apps/tlr/ui/apparatus/ApparatusCard.svelte';

	let { params, children }: LayoutProps = $props();

	// Tab → slide index mapping
	const TAB_IDS = ['alerts', 'calls', 'audio', 'stats', 'units', 'apparatus', 'map'] as const;

	// Optimistic tab: override updates immediately on swipe/click; clears when URL catches up
	const urlTab = $derived(params.tab ?? 'alerts');
	let tabOverride = $state<string | null>(null);
	const activeTab = $derived(tabOverride ?? urlTab);
	const tabIndex = $derived(TAB_IDS.indexOf(activeTab as (typeof TAB_IDS)[number]));

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		urlTab; // subscribe — clear override once URL catches up
		tabOverride = null;
	});

	// Infrastructure — all local to this layout
	const tlrClient = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());
	setTlrClient(tlrClient);

	const coordinator = new AudioCoordinator();
	setAudioCoordinator(coordinator);

	const feed = new TlrAlertFeed(tlrClient, coordinator);
	setTlrAlertFeed(feed);

	const pwaState = new PwaState(tlrClient, coordinator, feed);

	onMount(async () => {
		if ('serviceWorker' in navigator) {
			await navigator.serviceWorker.register('/sw.js', { scope: '/pwa/' });
		}
		await feed.start();
		await pwaState.start();
	});

	onDestroy(() => {
		feed.destroy();
		pwaState.destroy();
	});

	// Unread alert badge tracking
	let unreadAlertCount = $state(0);

	$effect(() => {
		const count = feed.newAlertIds.size;
		if (count > 0) {
			unreadAlertCount = untrack(() => unreadAlertCount) + count;
		}
	});

	$effect(() => {
		if (activeTab === 'alerts') {
			unreadAlertCount = 0;
		}
	});

	// Carousel ↔ URL sync
	let carouselApi = $state<CarouselAPI | undefined>(undefined);
	let suppressCarouselSync = false;

	function onCarouselApiReady(api: CarouselAPI | undefined) {
		carouselApi = api;
	}

	$effect(() => {
		if (!carouselApi) return;
		const handler = () => {
			if (suppressCarouselSync) return;
			const index = carouselApi!.selectedScrollSnap();
			const tabId = TAB_IDS[index];
			if (tabId && tabId !== activeTab) {
				tabOverride = tabId;
				// Preserve the query string so URL-backed tab state (e.g. call-history filters) survives tab switches
				void goto(`/pwa/${tabId}${page.url.search}`, { replaceState: true, noScroll: true });
			}
		};
		carouselApi.on('select', handler);
		return () => carouselApi!.off('select', handler);
	});

	$effect(() => {
		if (!carouselApi) return;
		const idx = tabIndex;
		if (idx >= 0 && carouselApi.selectedScrollSnap() !== idx) {
			suppressCarouselSync = true;
			carouselApi.scrollTo(idx, true);
			suppressCarouselSync = false;
		}
	});

	function setTab(id: string) {
		tabOverride = id;
		// Preserve the query string so URL-backed tab state (e.g. call-history filters) survives tab switches
		void goto(`/pwa/${id}${page.url.search}`, { replaceState: true, noScroll: true });
		const idx = TAB_IDS.indexOf(id as (typeof TAB_IDS)[number]);
		if (idx >= 0 && carouselApi) {
			suppressCarouselSync = true;
			carouselApi.scrollTo(idx, true);
			suppressCarouselSync = false;
		}
	}

	// More sheet
	let moreSheetOpen = $state(false);

	// Login dialog
	let loginDialogOpen = $state(false);

	$effect(() => {
		if (pwaState.requiresLogin) loginDialogOpen = true;
	});

	// Smart drag: disable swipe on map container and range inputs
	function watchDrag(_embla: CarouselAPI, evt: MouseEvent | TouchEvent | PointerEvent): boolean {
		const target = evt.target as Element;
		if (target.closest('input[type="range"]')) return false;
		if (target.closest('.leaflet-container')) return false;
		return true;
	}
</script>

<div class="flex flex-col overflow-hidden" style="height: 100dvh;">
	<Carousel.Root opts={{ watchDrag, startIndex: Math.max(0, tabIndex) }} setApi={onCarouselApiReady} class="min-h-0 flex-1">
		<Carousel.Content class="h-full">
			<!-- Alerts -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-4"><AlertFeedCard state={pwaState.alertFeedCard} standalone /></div>
			</Carousel.Item>

			<!-- Calls -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-1"><PwaCallHistory {activeTab} /></div>
			</Carousel.Item>

			<!-- Live Audio -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-4">
					<AudioPlayer player={pwaState.audioPlayer} config={pwaState.config} now={pwaState.now} standalone />
				</div>
			</Carousel.Item>

			<!-- Stats -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-4"><StatsCard state={pwaState.statsCard} /></div>
			</Carousel.Item>

			<!-- Unit Info -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-4"><UnitInfoCard state={pwaState.unitInfoCard} standalone /></div>
			</Carousel.Item>

			<!-- Apparatus -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))] overflow-y-auto" style="scrollbar-width: none;">
				<div class="px-3 pt-3 pb-4"><ApparatusCard standalone /></div>
			</Carousel.Item>

			<!-- Map -->
			<Carousel.Item class="h-[calc(100dvh-56px-env(safe-area-inset-bottom))]">
				<IncidentMap />
			</Carousel.Item>
		</Carousel.Content>
	</Carousel.Root>

	<BottomNav {activeTab} {unreadAlertCount} onTabChange={setTab} onMoreClick={() => (moreSheetOpen = true)} />
</div>

<MoreSheet bind:open={moreSheetOpen} {activeTab} onTabChange={setTab} pushNotifications={pwaState.pushNotifications} />

{#if loginDialogOpen}
	<LoginDialog client={tlrClient} dashboardState={pwaState} bind:open={loginDialogOpen} />
{/if}

{@render children()}

<style>
	:global(.pwa-slide::-webkit-scrollbar) {
		display: none;
	}
</style>
