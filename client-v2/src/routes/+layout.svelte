<script lang="ts">
	import './layout.css';

	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#09090b" />

	<title>TLR</title>
</svelte:head>

<ModeWatcher track={true} />
<Toaster />

<main class="min-h-[90vh] p-2 py-4">
	{@render children()}
</main>
