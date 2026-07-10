<script lang="ts">
	import './layout.css';

	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import { page } from '$app/state';

	let { children } = $props();

	const isPwaRoute = $derived(page.url.pathname.startsWith('/pwa'));
</script>

<svelte:head>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#09090b" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="TLR" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />

	<title>TLR</title>
</svelte:head>

<ModeWatcher track={true} />
<Toaster />

<main class={isPwaRoute ? 'contents' : 'min-h-[90vh] p-2 py-4'}>
	{@render children()}
</main>
