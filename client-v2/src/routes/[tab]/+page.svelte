<script lang="ts">
	import Dashboard from '$lib/apps/tlr/ui/dashboard/Dashboard.svelte';
	import CallHistory from '$lib/apps/tlr/ui/call-history/CallHistory.svelte';
	import IncidentMap from '$lib/apps/tlr/ui/map/IncidentMap.svelte';
	import AlertHistory from '$lib/apps/tlr/ui/alert-history/AlertHistory.svelte';
	import TranscriptSearch from '$lib/apps/tlr/ui/transcripts/TranscriptSearch.svelte';
	import UnitsDebug from '$lib/apps/tlr/ui/units-debug/UnitsDebug.svelte';
	import MqttDashboard from '$lib/apps/tlr/ui/mqtt-dashboard/MqttDashboard.svelte';
	import ApparatusCard from '$lib/apps/tlr/ui/apparatus/ApparatusCard.svelte';
	import SettingsTab from '$lib/apps/tlr/ui/settings/SettingsTab.svelte';
	import type { PageProps } from './$types';
	import type { Component } from 'svelte';

	let { params }: PageProps = $props();
	const activeTab = $derived(params.tab);
</script>

{#snippet tab(id: string, Component: Component)}
	{#if activeTab === id}
		<div class="flex h-full w-full flex-col items-center gap-6 px-2 sm:px-10">
			<div class="w-full max-w-6xl">
				<Component />
			</div>
		</div>
	{/if}
{/snippet}

<div>
	{@render tab('dashboard', Dashboard)}
	{@render tab('calls', CallHistory)}
	{@render tab('alert-log', AlertHistory)}
	{@render tab('transcripts', TranscriptSearch)}

	{#if activeTab === 'map'}
		<div class="flex h-full w-full flex-col items-center gap-6 px-2 sm:px-10">
			<div class="w-full" style="height: calc(100dvh - 10rem);">
				<IncidentMap />
			</div>
		</div>
	{/if}

	{@render tab('apparatus', ApparatusCard)}

	{#if activeTab === 'mqtt'}
		<div class="flex h-full w-full flex-col items-center gap-6 px-2 sm:px-10">
			<div class="w-full max-w-screen-2xl">
				<MqttDashboard />
			</div>
		</div>
	{/if}

	{@render tab('settings', SettingsTab)}
	{@render tab('debug', UnitsDebug)}
</div>
