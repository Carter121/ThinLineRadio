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
	<title>TLR</title>
</svelte:head>

<!--* Dark is the default on every device; system preference only applies if the user picks "System" in Settings. -->
<ModeWatcher track={true} defaultMode="dark" themeColors={{ dark: '#0e1626', light: '#fbfdff' }} />
<Toaster />

<main class={isFullBleed ? '' : 'min-h-[90vh] p-2 py-4'}>
	{@render children()}
</main>
