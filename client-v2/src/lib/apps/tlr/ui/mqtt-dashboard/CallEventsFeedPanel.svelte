<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { formatFrequency, formatAbsoluteTime } from '$lib/apps/tlr/format.ts';
	import type { CallEventEntry } from '$lib/apps/tlr/mqtt-types.ts';
	import PhoneCall from '@lucide/svelte/icons/phone-call';

	let { callFeed }: { callFeed: CallEventEntry[] } = $props();
</script>

<Card.Root class="flex h-full flex-col gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<PhoneCall class="size-3.5 text-muted-foreground" />
			Call Events
		</Card.Title>
	</Card.Header>
	<Card.Content class="min-h-0 flex-1 p-0">
		{#if callFeed.length === 0}
			<p class="px-3.5 pb-2 text-sm text-muted-foreground">No call events yet</p>
		{:else}
			<div class="h-full overflow-y-auto">
				{#each callFeed as entry (entry.id)}
					<div class={['flex items-start gap-2 px-3.5 py-1.5 text-xs', entry.emergency && 'bg-destructive/8']}>
						<Badge variant={entry.kind === 'start' ? 'default' : 'secondary'} class="mt-0.5 shrink-0 px-1 py-0 text-[10px]">
							{entry.kind === 'start' ? 'START' : 'END'}
						</Badge>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1">
								<span class="truncate font-medium">{entry.talkgroup_alpha_tag || `TG ${entry.call_num}`}</span>
								{#if entry.emergency}
									<Badge variant="destructive" class="shrink-0 px-1 py-0 text-[10px]">EMERG</Badge>
								{/if}
								{#if entry.encrypted}
									<Badge variant="outline" class="shrink-0 px-1 py-0 text-[10px]">ENC</Badge>
								{/if}
							</div>
							<div class="text-muted-foreground">
								{entry.sys_name}
								{#if entry.freq}
									&middot; {formatFrequency(entry.freq)}
								{/if}
							</div>
						</div>
						<span class="shrink-0 font-mono text-muted-foreground">{formatAbsoluteTime(entry.timestamp)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
