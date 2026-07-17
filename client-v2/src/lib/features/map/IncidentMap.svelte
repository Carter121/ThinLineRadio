<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type L from 'leaflet';
	import type { Alert, TranscriptAnnotationUnit } from '$lib/core/types.ts';
	import { formatRelativeTime, formatUnitName } from '$lib/core/format.ts';
	import { fireStations, getIcon } from '$lib/features/map/stations.ts';
	import { getTlrAlertFeed } from '$lib/core/context.ts';
	import { PersistedState } from 'runed';
	import { Card, CardContent } from '$lib/components/ui/card/index.ts';

	interface GeocodedAlert {
		alert: Alert;
		lat: number;
		lon: number;
		address: string;
		incidentType: string | null;
		units: TranscriptAnnotationUnit[];
	}

	const feed = getTlrAlertFeed();

	// Non-linear age bands: more visual resolution for recent alerts
	interface AgeBand {
		maxMin: number;
		color: string;
		radius: number;
		opacity: number;
	}

	const AGE_BANDS: AgeBand[] = [
		{ maxMin: 5, color: '#ef4444', radius: 9, opacity: 0.95 }, // bright red
		{ maxMin: 15, color: '#f97316', radius: 8, opacity: 0.9 }, // orange
		{ maxMin: 30, color: '#eab308', radius: 7, opacity: 0.85 }, // yellow
		{ maxMin: 60, color: '#22c55e', radius: 6, opacity: 0.75 }, // green
		{ maxMin: 120, color: '#14b8a6', radius: 5, opacity: 0.6 }, // teal
		{ maxMin: 240, color: '#3b82f6', radius: 5, opacity: 0.45 }, // blue
		{ maxMin: Infinity, color: '#6b7280', radius: 4, opacity: 0.3 } // gray
	];

	function ageBand(createdAt: number, now: number): AgeBand {
		const ageMin = (now - createdAt) / 60_000;
		return AGE_BANDS.find((b) => ageMin < b.maxMin) ?? AGE_BANDS[AGE_BANDS.length - 1];
	}

	const layerVisibility = new PersistedState<Record<string, boolean>>('tlr-map-layers', {
		Incidents: true,
		Stations: true
	});

	let mapContainer: HTMLDivElement | undefined = $state();
	let leafletLib = $state<typeof L | undefined>(undefined);
	let map: L.Map | undefined;
	let incidentLayer: L.LayerGroup | undefined;
	let stationLayer: L.LayerGroup | undefined;
	let geocodedAlerts: Map<number, GeocodedAlert> = $state(new Map());
	let geocodeVersion = $state(0);

	onMount(async () => {
		const [leaflet, markerIcon, markerIcon2x, markerShadow] = await Promise.all([
			import('leaflet'),
			import('leaflet/dist/images/marker-icon.png'),
			import('leaflet/dist/images/marker-icon-2x.png'),
			import('leaflet/dist/images/marker-shadow.png')
		]);

		// Import Leaflet CSS
		await import('leaflet/dist/leaflet.css');

		leafletLib = leaflet.default;

		const iconUrl = markerIcon.default ?? markerIcon;
		const iconRetinaUrl = markerIcon2x.default ?? markerIcon2x;
		const shadowUrl = markerShadow.default ?? markerShadow;

		leafletLib.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

		if (!mapContainer) return;

		map = leafletLib.map(mapContainer, { attributionControl: false }).setView([40.6632297, -111.9103124], 11);

		leafletLib
			.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
				maxZoom: 19
			})
			.addTo(map);

		incidentLayer = leafletLib.layerGroup();
		stationLayer = leafletLib.layerGroup();

		// Incidents always on by default; stations restore from persisted state
		incidentLayer.addTo(map);
		if (layerVisibility.current.Stations !== false) stationLayer.addTo(map);

		// Add station markers
		for (const station of fireStations) {
			leafletLib
				.marker([station.latitude, station.longitude], { icon: getIcon(leafletLib, station) })
				.bindPopup(`<strong>${station.name}</strong>`)
				.addTo(stationLayer);
		}

		// Layer toggle control
		const overlays: Record<string, L.LayerGroup> = {
			Incidents: incidentLayer,
			Stations: stationLayer
		};

		leafletLib.control.layers(undefined, overlays, { collapsed: false }).addTo(map);

		// Persist layer visibility on toggle (skip Incidents)
		map.on('overlayadd', (e) => {
			if (e.name === 'Incidents') return;
			layerVisibility.current = { ...layerVisibility.current, [e.name]: true };
		});
		map.on('overlayremove', (e) => {
			if (e.name === 'Incidents') return;
			layerVisibility.current = { ...layerVisibility.current, [e.name]: false };
		});

		// addAlerts();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = undefined;
		}
	});

	// Geocode new alerts as they arrive
	$effect(() => {
		const alerts = feed.alerts;

		for (const alert of alerts) {
			if (geocodedAlerts.has(alert.alertId)) continue;

			const pa = alert.parsedAddress;
			if (!pa?.match) continue;

			geocodedAlerts.set(alert.alertId, {
				alert,
				lat: pa.match.lat,
				lon: pa.match.lon,
				address: pa.match.fullAddress,
				incidentType: pa.incidentType ?? null,
				units: (alert.transcriptAnnotations ?? []).filter((a): a is TranscriptAnnotationUnit => a.type === 'unit')
			});
			geocodeVersion++;
		}
	});

	// Sync markers to Leaflet map when geocoded results change
	$effect(() => {
		void geocodeVersion;

		if (!leafletLib || !map || !incidentLayer) return;

		incidentLayer.clearLayers();

		const now = Date.now();

		for (const [, geo] of geocodedAlerts) {
			const unitNames = geo.units.map((u) => formatUnitName(u)).join(', ');
			const band = ageBand(geo.alert.createdAt, now);

			const marker = leafletLib
				.circleMarker([geo.lat, geo.lon], {
					radius: band.radius,
					fillColor: band.color,
					color: '#fff',
					weight: band.radius >= 7 ? 2 : 1,
					fillOpacity: band.opacity
				})
				.bindPopup(() => {
					// Compute relative time lazily on popup open so it's always fresh
					const timeAgo = formatRelativeTime(geo.alert.createdAt, Date.now());
					return `
						<div style="font-size: 13px; line-height: 1.4;">
							<strong>${geo.incidentType ?? 'Unknown'}</strong><br/>
							${geo.address}<br/>
							${unitNames ? `<span style="color: #94a3b8;">${unitNames}</span><br/>` : ''}
							<span style="color: #94a3b8; font-size: 11px;">${timeAgo}</span>
						</div>
					`;
				});

			incidentLayer.addLayer(marker);
		}
	});

	// Invalidate map size when tab becomes visible
	$effect(() => {
		if (map) {
			setTimeout(() => {
				map?.invalidateSize();
			}, 100);
		}
	});
</script>

<Card class="h-full w-full">
	<CardContent class="h-full w-full">
		<div bind:this={mapContainer} class="h-full w-full" style="min-height: 400px;"></div>
	</CardContent>
</Card>

<style>
	:global(.leaflet-container img) {
		max-width: none !important;
	}
</style>
