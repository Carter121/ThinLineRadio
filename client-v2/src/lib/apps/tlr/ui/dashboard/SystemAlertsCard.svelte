<script lang="ts">
	import { formatRelativeTime, formatAbsoluteTime } from '$lib/apps/tlr/format.ts';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Info from '@lucide/svelte/icons/info';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Alert as AlertBox, AlertTitle, AlertDescription } from '$lib/components/ui/alert/index.ts';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.ts';
	import type { SystemAlertsCardState } from './SystemAlertsCardState.svelte.ts';
	import type { SystemAlert } from '$lib/apps/tlr/types.ts';

	let { state: cardState }: { state: SystemAlertsCardState } = $props();

	function systemAlertSubtitle(alert: SystemAlert): string {
		return [alert.data?.service, alert.type, alert.source].filter(Boolean).join(' / ');
	}

	function systemAlertTimestamp(alert: SystemAlert): number {
		if (typeof alert.createdAt === 'number') return alert.createdAt;
		if (typeof alert.updatedAt === 'number') return alert.updatedAt;
		return 0;
	}
</script>

<Card class="flex flex-col gap-0 border-border/60 py-0">
	<CardHeader class="flex-none px-3.5 pt-3 pb-2">
		<div class="flex items-center">
			<CardTitle class="text-sm">System Alerts</CardTitle>
		</div>
	</CardHeader>
	<CardContent class="flex-1 overflow-hidden p-0">
		{#if !cardState.authenticated}
			<div class="px-3.5 pb-3">
				<p class="text-sm text-muted-foreground">Log in to view system alerts.</p>
			</div>
		{:else if cardState.systemAlerts.length === 0}
			<div class="px-3.5 pb-3">
				<p class="text-sm text-muted-foreground">No system alerts.</p>
			</div>
		{:else}
			<div class="max-h-96 overflow-y-auto px-3.5 pb-3">
				<div class="space-y-1.5">
					{#each cardState.systemAlerts as alert, index (`${alert.id ?? index}-${alert.title ?? ''}`)}
						<AlertBox
							variant={alert.severity === 'critical' || alert.severity === 'error'
								? 'destructive'
								: alert.severity === 'warning'
									? 'warning'
									: 'default'}
							class="px-3 py-2"
						>
							{#if alert.severity === 'critical'}
								<ShieldAlert class="size-4" />
							{:else if alert.severity === 'error'}
								<CircleAlert class="size-4" />
							{:else if alert.severity === 'warning'}
								<TriangleAlert class="size-4" />
							{:else}
								<Info class="size-4" />
							{/if}
							<AlertTitle class="flex items-center justify-between gap-2">
								<span class="flex items-center gap-1.5 truncate">
									{#if alert.dismissedAt}
										<Badge variant="outline" class="text-[10px]">dismissed</Badge>
									{/if}
									{alert.title ?? 'System alert'}
								</span>
								<span class="shrink-0 text-[11px] font-normal text-muted-foreground" title={formatAbsoluteTime(systemAlertTimestamp(alert))}>
									{#if alert.data?.count}
										<span class="opacity-60">{alert.data.count} events &middot; </span>
									{/if}
									{formatRelativeTime(systemAlertTimestamp(alert), cardState.nowMs)}
								</span>
							</AlertTitle>
							{#if alert.message || alert.data?.error || systemAlertSubtitle(alert)}
								<AlertDescription>
									{#if systemAlertSubtitle(alert)}
										<p class="text-xs text-muted-foreground">{systemAlertSubtitle(alert)}</p>
									{/if}
									{#if alert.message || alert.data?.error}
										<p>{alert.message ?? alert.data?.error}</p>
									{/if}
								</AlertDescription>
							{/if}
						</AlertBox>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
