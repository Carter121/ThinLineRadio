<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';

	let { lat, lon }: { lat: number; lon: number } = $props();

	let mapContainer: HTMLDivElement | undefined = $state();
	let map: L.Map | undefined;

	onMount(async () => {
		const [leaflet] = await Promise.all([
			import('leaflet'),
			import('leaflet/dist/images/marker-icon.png'),
			import('leaflet/dist/images/marker-icon-2x.png'),
			import('leaflet/dist/images/marker-shadow.png')
		]);

		await import('leaflet/dist/leaflet.css');

		const leafletLib = leaflet.default;

		if (!mapContainer) return;

		map = leafletLib
			.map(mapContainer, {
				zoomControl: false,
				attributionControl: false
			})
			.setView([lat, lon], 14);

		leafletLib
			.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
				maxZoom: 19
			})
			.addTo(map);

		leafletLib
			.circleMarker([lat, lon], {
				radius: 6,
				fillColor: '#ef4444',
				color: '#fff',
				weight: 2,
				fillOpacity: 0.9
			})
			.addTo(map);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = undefined;
		}
	});
</script>

<div bind:this={mapContainer} class="h-full w-full" style="min-height: 120px;"></div>

<style>
	:global(.leaflet-container img) {
		max-width: none !important;
	}
</style>
