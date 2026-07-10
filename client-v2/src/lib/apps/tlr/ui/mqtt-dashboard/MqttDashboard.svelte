<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import { PUBLIC_MQTT_SERVER, PUBLIC_MQTT_WS_PORT, PUBLIC_MQTT_SECURE, PUBLIC_TOPIC, PUBLIC_UNIT_TOPIC } from '$lib/tlr-config.ts';
	import { MqttDashboardState } from './MqttDashboardState.svelte.ts';
	import ActiveCallsPanel from './ActiveCallsPanel.svelte';
	import RecordersPanel from './RecordersPanel.svelte';
	import UnitFeedPanel from './UnitFeedPanel.svelte';
	import SystemStatusPanel from './SystemStatusPanel.svelte';
	import CallEventsFeedPanel from './CallEventsFeedPanel.svelte';
	import ConsoleFeedPanel from './ConsoleFeedPanel.svelte';
	import CallQualityPanel from './CallQualityPanel.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { formatDuration } from '$lib/apps/tlr/format.ts';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import { onDestroy, onMount } from 'svelte';

	const mqttState = new MqttDashboardState();

	onMount(() => mqttState.start());
	onDestroy(() => mqttState.destroy());

	const now = new SvelteDate();
	$effect(() => {
		const interval = setInterval(() => now.setTime(Date.now()), 5000);
		return () => clearInterval(interval);
	});

	const connectionColor = $derived.by(() => {
		switch (mqttState.connection) {
			case 'connected':
				return 'text-emerald-500';
			case 'connecting':
				return 'text-amber-400';
			case 'error':
				return 'text-destructive';
			default:
				return 'text-muted-foreground/50';
		}
	});

	const connectionLabel = $derived.by(() => {
		switch (mqttState.connection) {
			case 'connected':
				return 'Connected';
			case 'connecting':
				return 'Connecting…';
			case 'error':
				return `Error${mqttState.errorMessage ? ': ' + mqttState.errorMessage : ''}`;
			default:
				return 'Disconnected';
		}
	});

	let copied = $state(false);
	async function copyStats() {
		await navigator.clipboard.writeText(mqttState.statsReport);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="space-y-4">
	<!-- Connection bar -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
		<div class="flex items-center gap-1.5">
			<CircleDot class={['size-3', connectionColor]} />
			<span class="font-medium">{connectionLabel}</span>
		</div>
		<span class="hidden sm:inline">
			{PUBLIC_MQTT_SECURE === 'true' ? 'wss' : 'ws'}://{PUBLIC_MQTT_SERVER}{PUBLIC_MQTT_WS_PORT ? `:${PUBLIC_MQTT_WS_PORT}` : ''} &middot; {PUBLIC_TOPIC}/#,
			{PUBLIC_UNIT_TOPIC}/#
		</span>

		<div class="ml-auto flex items-center gap-3">
			{#if mqttState.totalMessageCount > 0}
				<span>{mqttState.totalMessageCount.toLocaleString()} messages</span>
			{/if}
			{#if mqttState.emergencyCallCount > 0}
				<span class="font-medium text-destructive">{mqttState.emergencyCallCount} emergency</span>
			{/if}

			{#if mqttState.isRecording}
				<span class="flex items-center gap-1.5 font-mono font-medium text-destructive">
					<span class="size-1.5 animate-pulse rounded-full bg-destructive"></span>
					{formatDuration(mqttState.recordingElapsed)}
				</span>
				<Button variant="outline" size="sm" class="h-6 text-xs" onclick={() => mqttState.stopRecording()}>Stop</Button>
			{:else}
				<Button variant="outline" size="sm" class="h-6 text-xs" onclick={() => mqttState.startRecording()}>Record</Button>
			{/if}
		</div>
	</div>

	<!-- Main grid -->
	<div class="grid items-start gap-3 xl:grid-cols-3">
		<!-- Left column — fixed height matches recorder card at each breakpoint -->
		<div class="flex flex-col gap-3 xl:h-266 2xl:h-194">
			<SystemStatusPanel systems={mqttState.systems} rates={mqttState.rates} />
			<CallQualityPanel callQuality={mqttState.callQuality} />
			<div class="min-h-0 flex-1">
				<ActiveCallsPanel activeCalls={mqttState.activeCalls} />
			</div>
		</div>

		<!-- Middle column — natural height, drives the design heights above -->
		<div>
			<RecordersPanel recorders={mqttState.recorders} breakdown={mqttState.recorderBreakdown} />
		</div>

		<!-- Right column — same fixed height, panels split it equally -->
		<div class="flex flex-col gap-3 xl:h-266 2xl:h-194">
			<div class="min-h-0 flex-1">
				<CallEventsFeedPanel callFeed={mqttState.callFeed} />
			</div>
			<div class="min-h-0 flex-1">
				<UnitFeedPanel unitEvents={mqttState.unitEvents} />
			</div>
		</div>

		<!-- Full-width console spanning all 3 columns -->
		<div class="xl:col-span-3">
			<ConsoleFeedPanel consoleMessages={mqttState.consoleMessages} />
		</div>
	</div>
</div>

<Dialog.Root bind:open={mqttState.showStatsDialog}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Recording Summary</Dialog.Title>
		</Dialog.Header>
		<pre class="max-h-96 overflow-y-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre">{mqttState.statsReport}</pre>
		<Dialog.Footer>
			<Button variant="outline" onclick={copyStats}>
				{copied ? 'Copied!' : 'Copy to Clipboard'}
			</Button>
			<Button onclick={() => (mqttState.showStatsDialog = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
