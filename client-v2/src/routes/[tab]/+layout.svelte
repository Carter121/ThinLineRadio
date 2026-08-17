<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { LayoutProps } from './$types';
	import { TlrClient } from '$lib/core/tlr-client.ts';
	import { setTlrClient, setAudioCoordinator, setTlrAlertFeed } from '$lib/core/context.ts';
	import { AudioCoordinator } from '$lib/features/AudioCoordinator.svelte.ts';
	import { TlrAlertFeed } from '$lib/core/tlr-alert-feed.svelte.ts';
	import Bug from '@lucide/svelte/icons/bug';
	import { PersistedState } from 'runed';
	import { Toggle } from '$lib/components/ui/toggle';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import { DebugTab, Tabs } from '$lib/core/tabs.ts';

	let { params, children }: LayoutProps = $props();

	const activeTab = $derived(params.tab);

	const showDebug = new PersistedState<boolean>('tlr-show-debug', false);

	const visibleTabs = $derived([...Tabs, ...(showDebug.current ? [DebugTab] : [])]);

	const tlrClient = new TlrClient(tlrOrigin() + '/api/', tlrOrigin());
	setTlrClient(tlrClient);

	const coordinator = new AudioCoordinator();
	setAudioCoordinator(coordinator);

	const feed = new TlrAlertFeed(tlrClient, coordinator);
	setTlrAlertFeed(feed);

	onMount(() => feed.start());
	onDestroy(() => {
		feed.destroy();
		coordinator.destroy();
	});

	//* Wake lock status badge, only polled while the debug toggle is on
	let wakeLockDebug = $state(coordinator.wakeLockDebug());
	$effect(() => {
		if (!showDebug.current) return;
		const id = setInterval(() => (wakeLockDebug = coordinator.wakeLockDebug()), 500);
		return () => clearInterval(id);
	});

	//* Verification email links redirect to /?verify=<token>; consume the token here
	onMount(() => {
		const url = new URL(window.location.href);
		const verifyToken = url.searchParams.get('verify');
		if (!verifyToken) return;
		url.searchParams.delete('verify');
		void replaceState(url, {});
		void tlrClient
			.verifyEmailToken(verifyToken)
			.then(() => toast.success('Email verified. You can now sign in.'))
			.catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Email verification failed'));
	});
</script>

<!--* The map tab locks the page to the viewport so the map can fill the remaining height. -->
<div class={activeTab === 'map' ? 'flex h-dvh flex-col overflow-hidden' : ''}>
	<div class="flex w-full shrink-0 justify-center px-2 pt-0 pb-4 sm:px-10 sm:pt-4">
		<nav class="flex w-full max-w-6xl items-end gap-4 overflow-x-auto border-b border-border">
			{#each visibleTabs as tab (tab.id)}
				{@const Icon = tab.icon}
				<a
					href={`/${tab.id}`}
					class="flex cursor-pointer items-center gap-1.5 pb-2 text-sm whitespace-nowrap transition-colors {activeTab === tab.id
						? 'border-b-2 border-primary font-medium text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					<Icon class="size-3.5" />
					{tab.label}
				</a>
			{/each}
			<Toggle
				size="sm"
				class="mb-0.5 ml-auto"
				pressed={showDebug.current}
				onPressedChange={(v) => (showDebug.current = v)}
				aria-label={showDebug.current ? 'Hide debug tab' : 'Show debug tab'}
			>
				<Bug class="size-3.5" />
			</Toggle>
		</nav>
	</div>

	<!--* Wake lock status readout -->
	{#if showDebug.current}
		<div
			class="pointer-events-none fixed right-2 bottom-28 z-60 rounded-md border border-border bg-background/95 px-2 py-1 font-mono text-[10px] leading-tight text-muted-foreground shadow-md"
		>
			<div class="font-medium {wakeLockDebug.active ? 'text-primary' : 'text-foreground'}">
				wake lock: {wakeLockDebug.active ? 'ACTIVE' : 'off'}
			</div>
			<div>
				supported={wakeLockDebug.supported} requested={wakeLockDebug.requested}
			</div>
			<div>
				audioPaused={wakeLockDebug.audioPaused} releasePending={wakeLockDebug.releasePending}
			</div>
			{#if wakeLockDebug.lastError}
				<div class="text-destructive">err: {wakeLockDebug.lastError}</div>
			{/if}
		</div>
	{/if}

	<div class={activeTab === 'map' ? 'min-h-0 flex-1' : ''}>
		<svelte:boundary onerror={(error) => console.error('[tlr] Component error caught by boundary:', error)}>
			{@render children()}

			<!--    eslint-disable-next-line @typescript-eslint/no-unused-vars -->
			{#snippet failed(error, reset)}
				<div class="flex w-full justify-center px-2 sm:px-10">
					<div class="w-full max-w-6xl rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
						<p class="text-sm font-medium text-destructive">Something went wrong rendering this tab.</p>
						<button class="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90" onclick={reset}> Retry </button>
					</div>
				</div>
			{/snippet}
		</svelte:boundary>
	</div>
</div>
