<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import type { ConsoleMessage } from '$lib/core/mqtt-types.ts';
	import Terminal from '@lucide/svelte/icons/terminal';

	let { consoleMessages }: { consoleMessages: ConsoleMessage[] } = $props();

	function severityClass(severity: string): string {
		switch (severity) {
			case 'warning':
				return 'text-amber-400';
			case 'error':
			case 'critical':
				return 'text-destructive';
			default:
				return 'text-muted-foreground';
		}
	}

	function formatTime(timeStr: string): string {
		try {
			return new Date(timeStr).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			});
		} catch {
			return timeStr;
		}
	}
</script>

<Card.Root class="gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<Terminal class="size-3.5 text-muted-foreground" />
			Console
		</Card.Title>
	</Card.Header>
	<Card.Content class="p-0 pb-1">
		{#if consoleMessages.length === 0}
			<p class="px-3.5 pb-2 text-sm text-muted-foreground">No console messages yet</p>
		{:else}
			<div class="flex max-h-56 flex-col-reverse overflow-y-auto font-mono">
				{#each consoleMessages as msg (msg.console.time + msg.console.log_msg)}
					<div class="flex gap-2 px-3.5 py-0.5 text-[11px] leading-snug">
						<span class="shrink-0 text-muted-foreground/60">{formatTime(msg.console.time)}</span>
						<span class={['min-w-0 break-all', severityClass(msg.console.severity)]}>
							{msg.console.log_msg}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
