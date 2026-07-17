<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { formatFrequency } from '$lib/core/format.ts';
	import type { ActiveCall } from '$lib/core/mqtt-types.ts';
	import Radio from '@lucide/svelte/icons/radio';

	let { activeCalls }: { activeCalls: ActiveCall[] } = $props();
</script>

<Card.Root class="flex h-full flex-col gap-0 border-border/60 py-0">
	<Card.Header class="px-3.5 pt-3 pb-2">
		<Card.Title class="flex items-center gap-2 text-sm">
			<Radio class="size-3.5 text-muted-foreground" />
			Active Calls
			{#if activeCalls.length > 0}
				<Badge variant="secondary" class="ml-auto text-xs">{activeCalls.length}</Badge>
			{/if}
		</Card.Title>
	</Card.Header>
	<Card.Content class="min-h-0 flex-1 px-0 pb-0">
		{#if activeCalls.length === 0}
			<p class="px-3.5 text-sm text-muted-foreground">No active calls</p>
		{:else}
			<div class="h-full space-y-px overflow-y-auto">
				{#each activeCalls as call (call.id)}
					<div
						class={[
							'flex items-start gap-2 px-3.5 py-1.5 text-xs',
							call.emergency && 'bg-destructive/10',
							!call.emergency && call.encrypted && 'bg-amber-500/15'
						]}
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="truncate font-medium">
									{call.talkgroup_alpha_tag || call.talkgroup}
								</span>
								{#if call.emergency}
									<Badge variant="destructive" class="shrink-0 px-1 py-0 text-[10px]">EMERG</Badge>
								{/if}
								{#if call.encrypted}
									<Badge variant="outline" class="shrink-0 px-1 py-0 text-[10px]">ENC</Badge>
								{/if}
							</div>
							<div class="mt-0.5 text-muted-foreground">
								{call.sys_name}
								{#if call.talkgroup_group}
									&middot; {call.talkgroup_group}
								{/if}
							</div>
						</div>
						<div class="shrink-0 text-right text-muted-foreground">
							<div>{formatFrequency(call.freq)}</div>
							<div class="mt-0.5">{call.elapsed}s &middot; {call.rec_state_type}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
