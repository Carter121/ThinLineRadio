<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import { TlrClient } from '$lib/apps/tlr/tlr-client.ts';
	import { setTlrClient, setAudioCoordinator, setTlrAlertFeed } from '$lib/apps/tlr/context.ts';
	import { AudioCoordinator } from '$lib/apps/tlr/ui/AudioCoordinator.svelte.ts';
	import { TlrAlertFeed } from '$lib/apps/tlr/tlr-alert-feed.svelte.ts';
	import Bug from '@lucide/svelte/icons/bug';
	import { PersistedState } from 'runed';
	import { Toggle } from '$lib/components/ui/toggle';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import { DebugTab, Tabs } from '$lib/apps/tlr/tabs.ts';

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
	onDestroy(() => feed.destroy());
</script>

<div class="flex w-full justify-center px-2 pt-0 pb-4 sm:px-10 sm:pt-4">
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
