<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { DateTime } from 'luxon';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import { cn } from '$lib/utils/shadcn.ts';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Eraser from '@lucide/svelte/icons/eraser';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import X from '@lucide/svelte/icons/x';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import type { AdminSystem } from '$lib/core/admin-types.ts';
	import {
		dismissSystemAlert,
		fetchAdminCallAudio,
		fetchSystemAlerts,
		fetchTranscriptionFailures,
		resetTranscriptionFailures
	} from './monitoring/monitoring-api.ts';
	import { groupAlerts, parseAlertData, type FailedCall, type SystemAlert } from './monitoring/monitoring-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const ALERT_LIMIT = 100;
	const AUTO_REFRESH_MS = 60000;

	//* API key fields used by the "monitored sources" table (config payload).
	interface ApiKeySummary {
		id: number;
		ident?: string;
		disabled?: boolean;
		lastCallAt?: number;
		noAudioAlertsEnabled?: boolean;
		noAudioThresholdMinutes?: number;
	}

	let alerts = $state.raw<SystemAlert[]>([]);
	let includeDismissed = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lastLoaded = $state<DateTime | null>(null);
	let autoRefresh = $state(true);

	let failedCalls = $state.raw<FailedCall[]>([]);
	let loadingFailures = $state(false);
	let resettingFailures = $state(false);

	let dismissingIds = $state<number[]>([]);
	let clearingGroup = $state<{ type: string; label: string; alerts: SystemAlert[] } | null>(null);
	let confirmResetAll = $state(false);

	//* One shared audio element for failed-call playback.
	let audio: HTMLAudioElement | null = null;
	let audioUrl: string | null = null;
	let playingCallId = $state<number | null>(null);
	let loadingCallId = $state<number | null>(null);

	const activeAlerts = $derived(alerts.filter((alert) => !alert.dismissed));
	const stats = $derived({
		total: activeAlerts.length,
		critical: activeAlerts.filter((a) => a.severity === 'critical').length,
		error: activeAlerts.filter((a) => a.severity === 'error').length,
		warning: activeAlerts.filter((a) => a.severity === 'warning').length,
		info: activeAlerts.filter((a) => a.severity === 'info').length
	});
	const statCards = $derived<{ label: string; value: number; tone: string }[]>([
		{ label: 'Active', value: stats.total, tone: '' },
		{ label: 'Critical', value: stats.critical, tone: 'text-destructive' },
		{ label: 'Errors', value: stats.error, tone: 'text-destructive' },
		{ label: 'Warnings', value: stats.warning, tone: '' },
		{ label: 'Info', value: stats.info, tone: 'text-muted-foreground' }
	]);
	const groups = $derived(groupAlerts(includeDismissed ? alerts : activeAlerts));
	const systems = $derived<AdminSystem[]>(session.config?.systems ?? []);
	const apiKeys = $derived<ApiKeySummary[]>((session.config?.apikeys as ApiKeySummary[] | undefined) ?? []);
	const healthAlertsEnabled = $derived(session.options?.systemHealthAlertsEnabled ?? true);

	async function loadAlerts() {
		loading = true;
		error = null;
		try {
			alerts = await fetchSystemAlerts(session.client, ALERT_LIMIT, includeDismissed);
			lastLoaded = DateTime.now();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load system alerts';
			alerts = [];
		} finally {
			loading = false;
		}
	}

	async function loadFailures() {
		loadingFailures = true;
		try {
			failedCalls = await fetchTranscriptionFailures(session.client);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to load transcription failures');
		} finally {
			loadingFailures = false;
		}
	}

	function refreshAll() {
		void loadAlerts();
		void loadFailures();
	}

	async function dismiss(alert: SystemAlert) {
		dismissingIds = [...dismissingIds, alert.id];
		try {
			await dismissSystemAlert(session.client, alert.id);
			toast.success('Alert dismissed');
			await loadAlerts();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to dismiss alert');
		} finally {
			dismissingIds = dismissingIds.filter((id) => id !== alert.id);
		}
	}

	async function clearGroup() {
		const group = clearingGroup;
		clearingGroup = null;
		if (!group) return;
		const targets = group.alerts.filter((a) => !a.dismissed);
		try {
			await Promise.all(targets.map((a) => dismissSystemAlert(session.client, a.id)));
			toast.success(`${targets.length} alert${targets.length === 1 ? '' : 's'} dismissed`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to dismiss alerts');
		}
		await loadAlerts();
	}

	async function resetFailures(callIds: number[] = []) {
		confirmResetAll = false;
		resettingFailures = true;
		try {
			const result = await resetTranscriptionFailures(session.client, callIds);
			toast.success(`${result?.rowsAffected ?? 0} call${result?.rowsAffected === 1 ? '' : 's'} queued for re-transcription`);
			refreshAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to reset transcription failures');
		} finally {
			resettingFailures = false;
		}
	}

	function stopAudio() {
		audio?.pause();
		audio = null;
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		audioUrl = null;
		playingCallId = null;
	}

	async function togglePlay(callId: number) {
		if (playingCallId === callId) {
			stopAudio();
			return;
		}
		stopAudio();
		loadingCallId = callId;
		try {
			const blob = await fetchAdminCallAudio(session.client, callId);
			const url = URL.createObjectURL(blob);
			const element = new Audio(url);
			element.onended = () => {
				if (audio === element) stopAudio();
			};
			element.onerror = () => {
				if (audio === element) stopAudio();
				toast.error('Failed to play audio');
			};
			audio = element;
			audioUrl = url;
			playingCallId = callId;
			await element.play();
		} catch (err) {
			stopAudio();
			toast.error(err instanceof Error ? err.message : 'Failed to play audio');
		} finally {
			loadingCallId = null;
		}
	}

	$effect(() => {
		if (!autoRefresh) return;
		const timer = setInterval(() => {
			if (!loading) void loadAlerts();
			if (!loadingFailures) void loadFailures();
		}, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	});

	function severityVariant(severity: string): 'destructive' | 'secondary' | 'outline' {
		if (severity === 'critical' || severity === 'error') return 'destructive';
		if (severity === 'warning') return 'secondary';
		return 'outline';
	}

	function formatAbsolute(ms: number): string {
		return DateTime.fromMillis(ms).toFormat('MMM d, yyyy HH:mm:ss');
	}

	function formatRelative(ms: number | undefined): string {
		if (!ms) return 'never';
		return DateTime.fromMillis(ms).toRelative() ?? '';
	}

	//* Flattens the alert's JSON payload into label/value chips.
	function alertDetails(alert: SystemAlert): { label: string; value: string }[] {
		const data = parseAlertData(alert);
		const details: { label: string; value: string }[] = [];
		if (data.systemLabel) details.push({ label: 'System', value: data.systemLabel });
		else if (data.systemId) details.push({ label: 'System', value: systems.find((s) => s.id === data.systemId)?.label ?? `#${data.systemId}` });
		if (data.apiKeyIdent) details.push({ label: 'API key', value: data.apiKeyIdent });
		if (data.service) details.push({ label: 'Service', value: data.service });
		if (data.talkgroupId) details.push({ label: 'Talkgroup', value: `#${data.talkgroupId}` });
		if (data.count !== undefined) details.push({ label: 'Count', value: data.threshold ? `${data.count} / ${data.threshold}` : String(data.count) });
		if (data.minutesSinceLast !== undefined) details.push({ label: 'Silent for', value: `${data.minutesSinceLast} min` });
		if (data.lastCallTime) details.push({ label: 'Last call', value: formatAbsolute(data.lastCallTime) });
		if (data.callId) details.push({ label: 'Call', value: `#${data.callId}` });
		if (data.error) details.push({ label: 'Error', value: data.error });
		return details;
	}

	onMount(() => {
		refreshAll();
	});

	onDestroy(() => {
		stopAudio();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">System Health</h2>
			<p class="text-sm text-muted-foreground">
				Active system alerts and failed transcriptions. Thresholds and toggles are configured under Options, Alerts &amp; Health.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2">
				<Switch id="health-auto-refresh" bind:checked={autoRefresh} aria-label="Auto-refresh" />
				<Label for="health-auto-refresh" class="text-sm font-normal text-muted-foreground">Auto-refresh</Label>
			</div>
			<Button variant="outline" size="sm" disabled={loading} onclick={refreshAll}>
				<RotateCcw data-icon="inline-start" class={loading ? 'animate-spin' : undefined} />
				Refresh
			</Button>
		</div>
	</div>

	{#if !healthAlertsEnabled}
		<p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
			System health alerts are turned off in Options, so no new alerts are generated.
		</p>
	{/if}

	<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
		{#each statCards as card (card.label)}
			<Card class="gap-0 py-0">
				<CardContent class="px-4 py-3">
					<p class="text-xs text-muted-foreground uppercase">{card.label}</p>
					<p class={cn('text-2xl font-semibold tabular-nums', card.value > 0 ? card.tone : 'text-muted-foreground')}>{card.value}</p>
				</CardContent>
			</Card>
		{/each}
	</div>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-3 pb-2">
			<CardTitle class="flex flex-wrap items-center gap-3 text-base">
				Alerts
				<span class="ml-auto flex items-center gap-2">
					<Switch
						id="health-show-dismissed"
						size="sm"
						checked={includeDismissed}
						onCheckedChange={(checked: boolean) => {
							includeDismissed = checked;
							void loadAlerts();
						}}
					/>
					<Label for="health-show-dismissed" class="text-xs font-normal text-muted-foreground">Show dismissed</Label>
					{#if lastLoaded}
						<span class="text-xs font-normal text-muted-foreground">Updated {lastLoaded.toFormat('HH:mm:ss')}</span>
					{/if}
				</span>
			</CardTitle>
		</CardHeader>
		<CardContent class="px-4 pt-0 pb-4">
			{#if error}
				<p class="py-4 text-sm text-destructive">{error}</p>
			{:else if loading && alerts.length === 0}
				<div class="flex min-h-24 items-center justify-center">
					<Spinner class="size-6" />
				</div>
			{:else if groups.length === 0}
				<div class="flex items-center gap-2 py-6 text-sm text-muted-foreground">
					<CircleCheck class="size-4" />
					No {includeDismissed ? '' : 'active '}alerts
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					{#each groups as group (group.type)}
						{@const activeInGroup = group.alerts.filter((a) => !a.dismissed)}
						<div class="flex flex-col gap-2">
							<div class="flex items-center gap-2">
								<h3 class="text-sm font-medium">{group.label}</h3>
								<Badge variant="secondary">{group.alerts.length}</Badge>
								{#if activeInGroup.length > 0}
									<Button variant="ghost" size="sm" class="ml-auto h-7 text-xs" onclick={() => (clearingGroup = group)}>
										<Eraser data-icon="inline-start" />
										Clear group
									</Button>
								{/if}
							</div>
							<div class="flex flex-col gap-2">
								{#each group.alerts as alert (alert.id)}
									{@const details = alertDetails(alert)}
									<div class={cn('rounded-md border border-border p-3', alert.dismissed && 'opacity-60')}>
										<div class="flex items-start gap-2">
											<Badge variant={severityVariant(alert.severity)} class="mt-0.5 shrink-0 px-1.5 py-0 text-[10px] uppercase"
												>{alert.severity}</Badge
											>
											<div class="min-w-0 flex-1">
												<p class="text-sm font-medium">{alert.title}</p>
												<p class="text-xs text-muted-foreground" title={formatAbsolute(alert.createdAt)}>
													{formatRelative(alert.createdAt)}
													{#if alert.dismissed}
														<span class="ml-1">(dismissed)</span>
													{/if}
												</p>
											</div>
											{#if !alert.dismissed}
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Dismiss alert"
													disabled={dismissingIds.includes(alert.id)}
													onclick={() => void dismiss(alert)}
												>
													<X class="size-3.5" />
												</Button>
											{/if}
										</div>
										{#if alert.message}
											<p class="mt-2 text-sm whitespace-pre-wrap">{alert.message}</p>
										{/if}
										{#if details.length > 0}
											<dl class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
												{#each details as detail (detail.label)}
													<div class="flex gap-1">
														<dt class="text-muted-foreground">{detail.label}:</dt>
														<dd class="font-medium break-all">{detail.value}</dd>
													</div>
												{/each}
											</dl>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-3 pb-2">
			<CardTitle class="flex flex-wrap items-center gap-2 text-base">
				Failed Transcriptions
				<Badge variant="secondary">{failedCalls.length}</Badge>
				<span class="text-xs font-normal text-muted-foreground">last 24 hours, newest first</span>
				{#if failedCalls.length > 0}
					<Button variant="outline" size="sm" class="ml-auto" disabled={resettingFailures} onclick={() => (confirmResetAll = true)}>
						{#if resettingFailures}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<RotateCcw data-icon="inline-start" />
						{/if}
						Retry all
					</Button>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="px-4 pt-0 pb-4">
			{#if loadingFailures && failedCalls.length === 0}
				<div class="flex min-h-16 items-center justify-center">
					<Spinner class="size-5" />
				</div>
			{:else if failedCalls.length === 0}
				<div class="flex items-center gap-2 py-4 text-sm text-muted-foreground">
					<CircleCheck class="size-4" />
					No failed transcriptions
				</div>
			{:else}
				<div class="overflow-x-auto">
					<Table class="text-xs">
						<TableHeader>
							<TableRow>
								<TableHead class="w-24">Call</TableHead>
								<TableHead class="w-40">Time</TableHead>
								<TableHead>System / Talkgroup</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead class="w-36"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{#each failedCalls as call (call.callId)}
								<TableRow>
									<TableCell class="font-mono">#{call.callId}</TableCell>
									<TableCell class="whitespace-nowrap tabular-nums">{formatAbsolute(call.timestamp)}</TableCell>
									<TableCell>
										{call.systemLabel || `System #${call.systemId}`}
										<span class="text-muted-foreground"> / </span>
										{call.talkgroupLabel || `Talkgroup #${call.talkgroupId}`}
										{#if call.talkgroupName && call.talkgroupName !== call.talkgroupLabel}
											<span class="text-muted-foreground"> ({call.talkgroupName})</span>
										{/if}
									</TableCell>
									<TableCell class={cn('break-words', call.failureReason ? 'text-destructive' : 'text-muted-foreground')}>
										{call.failureReason || 'No reason recorded'}
									</TableCell>
									<TableCell>
										<div class="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="sm"
												class="h-7"
												disabled={loadingCallId === call.callId}
												onclick={() => void togglePlay(call.callId)}
											>
												{#if loadingCallId === call.callId}
													<Loader2 data-icon="inline-start" class="animate-spin" />
												{:else if playingCallId === call.callId}
													<Pause data-icon="inline-start" />
												{:else}
													<Play data-icon="inline-start" />
												{/if}
												{playingCallId === call.callId ? 'Stop' : 'Play'}
											</Button>
											<Button variant="ghost" size="sm" class="h-7" disabled={resettingFailures} onclick={() => void resetFailures([call.callId])}>
												Retry
											</Button>
										</div>
									</TableCell>
								</TableRow>
							{/each}
						</TableBody>
					</Table>
				</div>
			{/if}
		</CardContent>
	</Card>

	{#if apiKeys.length > 0 || systems.length > 0}
		<Card class="gap-0 py-0">
			<CardHeader class="px-4 pt-3 pb-2">
				<CardTitle class="flex items-center gap-2 text-base">
					<KeyRound class="size-4" />
					Monitored Sources
				</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3 px-4 pt-0 pb-4">
				<p class="text-xs text-muted-foreground">
					No-audio monitoring per ingest source. Per-system thresholds are edited under Options, API key thresholds under API Keys.
				</p>
				<div class="grid gap-4 lg:grid-cols-2">
					{#if apiKeys.length > 0}
						<div class="overflow-x-auto">
							<Table class="text-xs">
								<TableHeader>
									<TableRow>
										<TableHead>API key</TableHead>
										<TableHead>Last upload</TableHead>
										<TableHead class="text-center">No-audio alerts</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each apiKeys as key (key.id)}
										<TableRow class={key.disabled ? 'opacity-60' : undefined}>
											<TableCell class="font-medium">
												{key.ident || `Key #${key.id}`}
												{#if key.disabled}<span class="ml-1 text-muted-foreground">(disabled)</span>{/if}
											</TableCell>
											<TableCell title={key.lastCallAt ? formatAbsolute(key.lastCallAt) : undefined}>{formatRelative(key.lastCallAt)}</TableCell>
											<TableCell class="text-center text-muted-foreground">
												{key.noAudioAlertsEnabled ? `${key.noAudioThresholdMinutes ?? 30} min` : 'Off'}
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
					{#if systems.length > 0}
						<div class="overflow-x-auto">
							<Table class="text-xs">
								<TableHeader>
									<TableRow>
										<TableHead>System</TableHead>
										<TableHead class="text-center">No-audio alerts</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each systems as system (system.id)}
										<TableRow>
											<TableCell class="font-medium">{system.label}</TableCell>
											<TableCell class="text-center text-muted-foreground">
												{(system.noAudioAlertsEnabled ?? true) ? `${system.noAudioThresholdMinutes ?? 30} min` : 'Off'}
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

<AlertDialog.Root open={clearingGroup !== null} onOpenChange={(isOpen) => (isOpen ? undefined : (clearingGroup = null))}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Dismiss all {clearingGroup?.label ?? ''} alerts?</AlertDialog.Title>
			<AlertDialog.Description>
				{clearingGroup?.alerts.filter((a) => !a.dismissed).length ?? 0} active alert(s) in this group will be dismissed.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => void clearGroup()}>Dismiss all</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={confirmResetAll}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Retry all failed transcriptions?</AlertDialog.Title>
			<AlertDialog.Description
				>Every call that failed transcription in the last 24 hours is set back to pending and re-queued.</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => void resetFailures()}>Retry all</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
