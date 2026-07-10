<script lang="ts">
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Info from '@lucide/svelte/icons/info';
	import Truck from '@lucide/svelte/icons/truck';
	import Bell from '@lucide/svelte/icons/bell';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import type { Component } from 'svelte';
	import type { PushNotificationState } from './PushNotificationState.svelte.ts';

	interface MoreTab {
		id: string;
		label: string;
		icon: Component;
	}

	const moreTabs: MoreTab[] = [
		{ id: 'map', label: 'Map', icon: MapPin },
		{ id: 'stats', label: 'Stats', icon: Gauge },
		{ id: 'units', label: 'Unit Info', icon: Info },
		{ id: 'apparatus', label: 'Apparatus', icon: Truck }
	];

	let {
		open = $bindable(false),
		activeTab,
		onTabChange,
		pushNotifications
	}: {
		open: boolean;
		activeTab: string;
		onTabChange: (id: string) => void;
		pushNotifications: PushNotificationState;
	} = $props();

	function selectTab(id: string) {
		open = false;
		onTabChange(id);
	}

	// Swipe-to-dismiss
	let touchStartY = 0;

	function onTouchStart(e: TouchEvent) {
		touchStartY = e.touches[0].clientY;
	}

	function onTouchMove(e: TouchEvent) {
		const dy = e.touches[0].clientY - touchStartY;
		if (dy > 60) {
			open = false;
		}
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div class="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" role="presentation" onclick={() => (open = false)}></div>
{/if}

<!-- Sheet -->
<div
	class="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-card transition-transform duration-200 ease-out"
	style="transform: translateY({open ? '0' : '100%'}); padding-bottom: calc(env(safe-area-inset-bottom) + 56px);"
	role="dialog"
	tabindex="-1"
	aria-modal="true"
	aria-label="More tabs"
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
>
	<!-- Handle bar -->
	<div class="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30"></div>

	{#each moreTabs as tab, i (tab.id)}
		{@const Icon = tab.icon}
		{@const isActive = activeTab === tab.id}
		<button
			type="button"
			class="flex h-14 w-full items-center gap-4 px-5 transition-colors hover:bg-muted/40 {i > 0 ? 'border-t border-border/20' : ''}"
			onclick={() => selectTab(tab.id)}
		>
			<Icon class="size-5 shrink-0 {isActive ? 'text-primary' : 'text-muted-foreground'}" />
			<span class="text-sm font-medium {isActive ? 'text-primary' : 'text-foreground'}">{tab.label}</span>
		</button>
	{/each}

	{#if pushNotifications.isSupported}
		<div class="mt-1 border-t border-border/40"></div>
		<button
			type="button"
			disabled={pushNotifications.loading}
			class="flex h-14 w-full items-center gap-4 px-5 transition-colors hover:bg-muted/40 disabled:opacity-50"
			onclick={() => (pushNotifications.subscribed ? pushNotifications.unsubscribe() : pushNotifications.subscribe())}
		>
			{#if pushNotifications.subscribed}
				<BellOff class="size-5 shrink-0 text-muted-foreground" />
				<span class="text-sm font-medium text-foreground">Disable Notifications</span>
			{:else}
				<Bell class="size-5 shrink-0 text-muted-foreground" />
				<span class="text-sm font-medium text-foreground">Enable Notifications</span>
			{/if}
			{#if pushNotifications.loading}
				<span class="ml-auto text-xs text-muted-foreground">...</span>
			{/if}
		</button>
		{#if pushNotifications.error}
			<p class="px-5 pb-2 text-xs text-destructive">{pushNotifications.error}</p>
		{/if}
	{/if}
</div>
