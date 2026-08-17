<script lang="ts">
	import './layout.css';

	import { ModeWatcher } from 'mode-watcher';
	import { page } from '$app/state';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();

	//* The admin panel and the map tab manage their own full-bleed layouts.
	const isAdmin = $derived(page.route.id?.startsWith('/admin') ?? false);
	const isFullBleed = $derived(isAdmin || page.params.tab === 'map');
</script>

<svelte:head>
	<meta name="theme-color" content="#09090b" />

	<title>TLR</title>
</svelte:head>

<ModeWatcher track={true} />
<Toaster />

<main class={isFullBleed ? '' : 'min-h-[90vh] p-2 py-4'}>
	{@render children()}
</main>
