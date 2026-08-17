<script lang="ts">
	import { mount, onDestroy, onMount, unmount } from 'svelte';
	import type L from 'leaflet';
	import { mode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { PersistedState } from 'runed';
	import { fireStations, getIcon } from './stations.ts';
	import { ageBand } from './age-bands.ts';
	import type { GeocodedIncident, MapPageState } from './MapPageState.svelte.ts';
	import MapPopupContent from './MapPopupContent.svelte';
	import MapLegend from './MapLegend.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import Maximize from '@lucide/svelte/icons/maximize';
	import LocateFixed from '@lucide/svelte/icons/locate-fixed';

	let { pageState }: { pageState: MapPageState } = $props();

	const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
	const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
	const DEFAULT_VIEW = { lat: 40.6632297, lng: -111.9103124, zoom: 11 };

	const layerVisibility = new PersistedState<Record<string, boolean>>('tlr-map-layers', {
		Incidents: true,
		Stations: true
	});
	const savedView = new PersistedState<{ lat: number; lng: number; zoom: number } | null>('tlr-map-view', null);

	let mapContainer: HTMLDivElement | undefined = $state();
	let leafletLib: typeof L | undefined;
	let map: L.Map | undefined;
	let tileLayer: L.TileLayer | undefined;
	let currentTileUrl = LIGHT_TILES;
	let incidentLayer: L.LayerGroup | undefined;
	let stationLayer: L.LayerGroup | undefined;
	let mapReady = $state(false);

	//* Coarse-pointer devices get invisible oversized hit markers for easier tapping.
	const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

	interface MarkerEntry {
		marker: L.CircleMarker;
		hit: L.CircleMarker | null;
		incident: GeocodedIncident;
	}
	//* Keyed by incident group key so a threaded incident keeps one marker
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const markerRegistry = new Map<string, MarkerEntry>();

	//* Popups are created per open with Svelte-mounted content; handles tracked for unmount.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const popupHandles = new Map<L.Popup, object>();
	let currentPopup: L.Popup | undefined;
	let popupKey: string | null = null;

	let userMarker: L.CircleMarker | undefined;
	let accuracyCircle: L.Circle | undefined;

	function initialView(): { lat: number; lng: number; zoom: number } {
		const v = savedView.current;
		if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom) && v.zoom >= 3 && v.zoom <= 19) return v;
		return DEFAULT_VIEW;
	}

	function openIncidentPopup(incident: GeocodedIncident) {
		if (!leafletLib || !map) return;
		const container = document.createElement('div');
		const handle = mount(MapPopupContent, { target: container, props: { incident, pageState } });
		const popup = leafletLib
			.popup({ maxWidth: 280, offset: [0, -4] })
			.setLatLng([incident.lat, incident.lon])
			.setContent(container);
		popupHandles.set(popup, handle);
		currentPopup = popup;
		popupKey = incident.key;
		popup.openOn(map);
	}

	function handleMarkerClick(key: string) {
		const entry = markerRegistry.get(key);
		if (!entry) return;
		pageState.select(entry.incident.alert.alertId, 'map');
		openIncidentPopup(entry.incident);
	}

	function fitToIncidents() {
		if (!map || !leafletLib) return;
		const incidents = pageState.filteredIncidents;
		if (incidents.length === 0) return;
		const bounds = leafletLib.latLngBounds(incidents.map((i) => [i.lat, i.lon] as [number, number]));
		map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15 });
	}

	function locateUser() {
		if (!navigator.geolocation) {
			toast.error('Geolocation is not supported by this browser');
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				if (!map || !leafletLib) return;
				const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
				userMarker?.remove();
				accuracyCircle?.remove();
				accuracyCircle = leafletLib
					.circle(latlng, { radius: pos.coords.accuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1 })
					.addTo(map);
				userMarker = leafletLib.circleMarker(latlng, { radius: 6, fillColor: '#3b82f6', fillOpacity: 1, color: '#ffffff', weight: 2 }).addTo(map);
				map.flyTo(latlng, Math.max(map.getZoom(), 14));
			},
			() => toast.error('Could not get your location'),
			{ enableHighAccuracy: true, timeout: 10_000 }
		);
	}

	onMount(async () => {
		const [leaflet, markerIcon, markerIcon2x, markerShadow] = await Promise.all([
			import('leaflet'),
			import('leaflet/dist/images/marker-icon.png'),
			import('leaflet/dist/images/marker-icon-2x.png'),
			import('leaflet/dist/images/marker-shadow.png')
		]);
		await import('leaflet/dist/leaflet.css');

		leafletLib = leaflet.default;
		leafletLib.Icon.Default.mergeOptions({
			iconUrl: markerIcon.default ?? markerIcon,
			iconRetinaUrl: markerIcon2x.default ?? markerIcon2x,
			shadowUrl: markerShadow.default ?? markerShadow
		});

		if (!mapContainer) return;

		const view = initialView();
		map = leafletLib.map(mapContainer, { attributionControl: false, zoomControl: true }).setView([view.lat, view.lng], view.zoom);

		currentTileUrl = mode.current === 'dark' ? DARK_TILES : LIGHT_TILES;
		tileLayer = leafletLib.tileLayer(currentTileUrl, { maxZoom: 19 }).addTo(map);

		incidentLayer = leafletLib.layerGroup();
		stationLayer = leafletLib.layerGroup();

		//* Incidents always on by default; stations restore from persisted state.
		incidentLayer.addTo(map);
		if (layerVisibility.current.Stations !== false) stationLayer.addTo(map);

		for (const station of fireStations) {
			leafletLib
				.marker([station.latitude, station.longitude], { icon: getIcon(leafletLib, station) })
				.bindPopup(`<strong>${station.name}</strong>`)
				.addTo(stationLayer);
		}

		leafletLib.control.layers(undefined, { Incidents: incidentLayer, Stations: stationLayer }, { collapsed: window.innerWidth < 640 }).addTo(map);

		map.on('overlayadd', (e) => {
			if (e.name === 'Incidents') return;
			layerVisibility.current = { ...layerVisibility.current, [e.name]: true };
		});
		map.on('overlayremove', (e) => {
			if (e.name === 'Incidents') return;
			layerVisibility.current = { ...layerVisibility.current, [e.name]: false };
		});

		map.on('moveend', () => {
			if (!map) return;
			const c = map.getCenter();
			savedView.current = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
		});

		map.on('popupclose', (e) => {
			const handle = popupHandles.get(e.popup);
			if (handle) {
				void unmount(handle);
				popupHandles.delete(e.popup);
			}
			if (e.popup === currentPopup) {
				currentPopup = undefined;
				popupKey = null;
			}
		});

		map.invalidateSize();
		mapReady = true;
	});

	onDestroy(() => {
		for (const handle of popupHandles.values()) void unmount(handle);
		popupHandles.clear();
		map?.remove();
		map = undefined;
		markerRegistry.clear();
	});

	//* Keep the map sized to its container (tab switches, rotation, panel changes).
	$effect(() => {
		if (!mapReady || !mapContainer) return;
		const observer = new ResizeObserver(() => requestAnimationFrame(() => map?.invalidateSize()));
		observer.observe(mapContainer);
		return () => observer.disconnect();
	});

	//* Swap basemap with the app theme without recreating the map.
	$effect(() => {
		if (!mapReady || !tileLayer) return;
		const url = mode.current === 'dark' ? DARK_TILES : LIGHT_TILES;
		if (url === currentTileUrl) return;
		currentTileUrl = url;
		tileLayer.setUrl(url);
	});

	//* Sync markers to filtered incidents; reading nowMs restyles ages every 15s without churn.
	$effect(() => {
		if (!mapReady || !leafletLib || !incidentLayer) return;
		const lib = leafletLib;
		const nowMs = pageState.nowMs;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Set<string>();

		for (const incident of pageState.filteredIncidents) {
			const key = incident.key;
			seen.add(key);
			const band = ageBand(incident.alert.createdAt, nowMs);
			//* Uncertain geocodes render as a hollow dashed ring so a low-confidence
			//* pin never reads like a confirmed location.
			const style = {
				radius: band.radius,
				fillColor: band.color,
				color: incident.uncertain ? band.color : '#ffffff',
				weight: incident.uncertain ? 1.5 : band.radius >= 7 ? 2 : 1,
				fillOpacity: incident.uncertain ? band.opacity * 0.25 : band.opacity,
				dashArray: incident.uncertain ? '3 3' : ''
			};

			const existing = markerRegistry.get(key);
			if (existing) {
				existing.incident = incident;
				existing.marker.setLatLng([incident.lat, incident.lon]);
				existing.marker.setStyle(style);
				existing.marker.setRadius(band.radius);
				if (existing.hit) existing.hit.setLatLng([incident.lat, incident.lon]);
				continue;
			}

			const marker = lib.circleMarker([incident.lat, incident.lon], style).on('click', () => handleMarkerClick(key));
			incidentLayer.addLayer(marker);

			let hit: L.CircleMarker | null = null;
			if (coarsePointer) {
				hit = lib
					.circleMarker([incident.lat, incident.lon], { radius: 16, stroke: false, fillOpacity: 0, fill: true })
					.on('click', () => handleMarkerClick(key));
				incidentLayer.addLayer(hit);
			}

			markerRegistry.set(key, { marker, hit, incident });
		}

		for (const [key, entry] of markerRegistry) {
			if (seen.has(key)) continue;
			incidentLayer.removeLayer(entry.marker);
			if (entry.hit) incidentLayer.removeLayer(entry.hit);
			markerRegistry.delete(key);
			if (popupKey === key) map?.closePopup();
		}
	});

	//* List selection flies to the marker and opens its popup after the movement settles.
	$effect(() => {
		if (!mapReady) return;
		const alertId = pageState.selectedAlertId;
		if (alertId == null || pageState.selectionSource !== 'list') return;
		//* Registry is keyed by group key; find the entry whose newest alert matches
		const entry = [...markerRegistry.values()].find((e) => e.incident.alert.alertId === alertId);
		if (!entry || !map || !leafletLib) return;

		const target = leafletLib.latLng(entry.incident.lat, entry.incident.lon);
		if (map.getCenter().distanceTo(target) < 20 && map.getZoom() >= 15) {
			openIncidentPopup(entry.incident);
		} else {
			map.once('moveend', () => openIncidentPopup(entry.incident));
			map.flyTo(target, Math.max(map.getZoom(), 15));
		}
	});
</script>

<div class="relative h-full w-full">
	<div bind:this={mapContainer} class="h-full w-full"></div>

	{#if mapReady}
		<MapLegend />
		<div class="absolute right-3 bottom-3 z-[1000] flex flex-col gap-1.5">
			<Button
				variant="outline"
				size="icon"
				class="size-8 bg-background/90 shadow-sm backdrop-blur"
				onclick={fitToIncidents}
				disabled={pageState.filteredIncidents.length === 0}
				aria-label="Fit map to incidents"
			>
				<Maximize class="size-4" />
			</Button>
			<Button
				variant="outline"
				size="icon"
				class="size-8 bg-background/90 shadow-sm backdrop-blur"
				onclick={locateUser}
				aria-label="Go to my location"
			>
				<LocateFixed class="size-4" />
			</Button>
		</div>
	{/if}
</div>

<style>
	:global(.leaflet-container) {
		background: var(--muted);
		font: inherit;
	}
	:global(.leaflet-container img) {
		max-width: none !important;
	}
	/* Leaflet's stylesheet loads after component styles; the extra ancestor wins the cascade */
	:global(.leaflet-container .leaflet-popup-content-wrapper),
	:global(.leaflet-container .leaflet-popup-tip) {
		background: var(--popover);
		color: var(--popover-foreground);
	}
	:global(.leaflet-container .leaflet-popup-content-wrapper) {
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	:global(.leaflet-container .leaflet-popup-content) {
		margin: 10px 12px;
		font: inherit;
		line-height: inherit;
	}
	:global(.leaflet-container .leaflet-popup-content a) {
		color: var(--primary);
	}
	:global(.leaflet-container .leaflet-popup-close-button) {
		color: var(--muted-foreground) !important;
	}
	:global(.leaflet-container .leaflet-bar a) {
		background: var(--popover);
		color: var(--popover-foreground);
		border-color: var(--border);
	}
	:global(.leaflet-container .leaflet-bar a:hover) {
		background: var(--accent);
		color: var(--accent-foreground);
	}
	:global(.leaflet-container .leaflet-control-layers) {
		background: var(--popover);
		color: var(--popover-foreground);
		border: 1px solid var(--border);
	}
</style>
