<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import LogOut from '@lucide/svelte/icons/log-out';
	import LogIn from '@lucide/svelte/icons/log-in';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { getTlrClient, getAudioCoordinator, getTlrAlertFeed } from '$lib/apps/tlr/context.ts';
	import { DashboardState } from './DashboardState.svelte.ts';
	import AudioPlayer from '../live-audio/AudioPlayer.svelte';
	import LoginDialog from '../LoginDialog.svelte';
	import SummaryCards from './SummaryCards.svelte';
	import AlertFeedCard from './AlertFeedCard.svelte';
	import StatsCard from './StatsCard.svelte';
	import SystemAlertsCard from './SystemAlertsCard.svelte';
	import UnitInfoCard from './UnitInfoCard.svelte';
	import { toast } from 'svelte-sonner';
	import { MediaQuery } from 'svelte/reactivity';

	const client = getTlrClient();
	const coordinator = getAudioCoordinator();
	const feed = getTlrAlertFeed();

	const dashboard = new DashboardState(client, coordinator, feed);

	onMount(() => {
		if (dashboard) void dashboard.start();
	});

	onDestroy(() => {
		dashboard?.destroy();
	});

	let loginDialogOpen = $state(false);

	function logout() {
		dashboard.logout();
		toast.success('Logged out');
	}

	const connectionAlive = $derived(dashboard.connection.status === 'authenticated' || dashboard.connection.status === 'connected');

	const desktopQuery = new MediaQuery('width >= 80rem');
	const useDesktopLayout = $derived(desktopQuery.current);
</script>

<div class="space-y-4 pb-6">
	<!-- Header bar -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2">
				<CircleDot class={['size-3.5', connectionAlive ? 'text-emerald-500' : 'text-muted-foreground/50']} />
				<span class="text-sm font-medium text-foreground">{dashboard.connectionLabel}</span>
			</div>

			{#if dashboard.listenerCount !== null}
				<span class="text-xs text-muted-foreground">{dashboard.listenerCount} listeners</span>
			{/if}

			{#if dashboard.version}
				<Badge variant="outline" class="text-[10px]">v{dashboard.version}</Badge>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<span class="text-xs leading-none text-muted-foreground tabular-nums">{dashboard.timeStr}</span>
			<span class="text-xs leading-none text-muted-foreground">{dashboard.dateStr}</span>

			{#if dashboard.authenticated}
				<Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={logout}>
					<LogOut class="size-3" />Log Out
				</Button>
			{:else}
				<Button variant="outline" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={() => (loginDialogOpen = true)}>
					<LogIn class="size-3" />Log In
				</Button>
			{/if}
		</div>
	</div>

	<!-- Stat cards -->
	<SummaryCards state={dashboard.summaryCards} />

	<!-- Error banners -->
	{#if dashboard.authError}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
			{dashboard.authError}
		</div>
	{/if}
	{#if dashboard.socketError}
		<div class="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
			Socket: {dashboard.socketError}
		</div>
	{/if}

	{#if useDesktopLayout}
		<!-- Desktop: two-column masonry layout -->
		<div class="hidden gap-3 xl:grid xl:grid-cols-[1fr_1fr]">
			<div class="flex flex-col gap-3">
				<AudioPlayer player={dashboard.audioPlayer} config={dashboard.config} now={dashboard.now} />
				<StatsCard state={dashboard.statsCard} />
				{#if dashboard.systemAlertsCard.isSystemAdmin}
					<SystemAlertsCard state={dashboard.systemAlertsCard} />
				{/if}
			</div>
			<div class="flex flex-col gap-3">
				<AlertFeedCard state={dashboard.alertFeed} />
				<UnitInfoCard state={dashboard.unitInfoCard} />
			</div>
		</div>
	{:else}
		<!-- Mobile: Live Audio, Alert Feed, Stats, Incidents, System Alerts -->
		<div class="flex flex-col gap-3">
			<AudioPlayer player={dashboard.audioPlayer} config={dashboard.config} now={dashboard.now} />
			<AlertFeedCard state={dashboard.alertFeed} />
			<UnitInfoCard state={dashboard.unitInfoCard} />
			<StatsCard state={dashboard.statsCard} />

			{#if dashboard.systemAlertsCard.isSystemAdmin}
				<SystemAlertsCard state={dashboard.systemAlertsCard} />
			{/if}
		</div>
	{/if}
</div>

<LoginDialog {client} dashboardState={dashboard} bind:open={loginDialogOpen} />
