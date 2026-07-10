<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import Radio from '@lucide/svelte/icons/radio';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { Component } from 'svelte';

	interface NavItem {
		id: string;
		label: string;
		icon: Component;
	}

	const primaryTabs: NavItem[] = [
		{ id: 'alerts', label: 'Alerts', icon: Bell },
		{ id: 'calls', label: 'Calls', icon: Radio },
		{ id: 'audio', label: 'Live', icon: Volume2 }
	];

	const secondaryTabIds = new Set(['map', 'stats', 'units', 'apparatus']);

	let {
		activeTab,
		unreadAlertCount,
		onTabChange,
		onMoreClick
	}: {
		activeTab: string;
		unreadAlertCount: number;
		onTabChange: (id: string) => void;
		onMoreClick: () => void;
	} = $props();

	const moreActive = $derived(secondaryTabIds.has(activeTab));

	// Track whether the most recent batch is "fresh" (within 2s) for the ping animation.
	// We do this by watching unreadAlertCount increase and setting a brief fresh window.
	let alertFresh = $state(false);
	let freshTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		unreadAlertCount; // subscribe
		if (unreadAlertCount > 0) {
			alertFresh = true;
			if (freshTimer) clearTimeout(freshTimer);
			freshTimer = setTimeout(() => {
				alertFresh = false;
			}, 2000);
		} else {
			alertFresh = false;
		}
	});
</script>

<nav class="flex w-full shrink-0 border-t border-border/30 bg-background/90 backdrop-blur-md" style="padding-bottom: env(safe-area-inset-bottom);">
	{#each primaryTabs as tab (tab.id)}
		{@const Icon = tab.icon}
		{@const isActive = activeTab === tab.id}
		{@const isAlerts = tab.id === 'alerts'}
		<button
			type="button"
			class="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 py-2 transition-colors"
			onclick={() => onTabChange(tab.id)}
			aria-label={tab.label}
			aria-current={isActive ? 'page' : undefined}
		>
			<!-- Active pill indicator (Material 3) -->
			{#if isActive}
				<span class="absolute top-1.5 h-7 w-12 rounded-full bg-primary/15"></span>
			{/if}

			<!-- Alert badge -->
			{#if isAlerts && unreadAlertCount > 0}
				<span class="absolute top-1.5 right-[calc(50%-18px)] size-2">
					{#if alertFresh}
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
					{/if}
					<span class="relative inline-flex size-2 rounded-full bg-red-500"></span>
				</span>
			{/if}

			<Icon class="relative size-5 {isActive ? 'text-primary' : 'text-muted-foreground'}" />
			<span class="relative text-[10px] font-medium {isActive ? 'text-primary' : 'text-muted-foreground'}">
				{tab.label}
			</span>
		</button>
	{/each}

	<!-- More button -->
	<button
		type="button"
		class="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 py-2 transition-colors"
		onclick={onMoreClick}
		aria-label="More"
	>
		{#if moreActive}
			<span class="absolute top-1.5 h-7 w-12 rounded-full bg-primary/15"></span>
		{/if}
		<Ellipsis class="relative size-5 {moreActive ? 'text-primary' : 'text-muted-foreground'}" />
		<span class="relative text-[10px] font-medium {moreActive ? 'text-primary' : 'text-muted-foreground'}">More</span>
	</button>
</nav>
