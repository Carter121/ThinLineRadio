<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { buttonVariants } from '$lib/components/ui/button';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { IncidentDetail, IncidentMembership } from '$lib/core/types';
	import type { TlrClient } from '$lib/core/tlr-client';
	import { incidentManagement as management } from './incident-management.svelte';
	let { call, client, compact = false }: { call: IncidentMembership; client: TlrClient; compact?: boolean } = $props();
	let incident = $state.raw<IncidentDetail | null>(null);
	let loading = $state(false);
	let loadFailed = $state(false);
	let requestId = 0;

	function menuChanged(open: boolean) {
		const request = ++requestId;
		incident = null;
		loadFailed = false;
		loading = open && !!call.incidentId;
		if (!loading) return;
		void client
			.getIncident(call.incidentId!)
			.then((detail) => {
				if (request === requestId) incident = detail;
			})
			.catch(() => {
				if (request === requestId) loadFailed = true;
			})
			.finally(() => {
				if (request === requestId) loading = false;
			});
	}
</script>

{#if call.canManageIncidents}
	<DropdownMenu.Root onOpenChange={menuChanged}>
		<DropdownMenu.Trigger
			class={buttonVariants({
				variant: 'ghost',
				size: 'icon',
				class: ['text-muted-foreground hover:text-foreground', compact ? 'size-6' : 'size-7']
			})}
			aria-label="Manage incident"
			onclick={(event) => event.stopPropagation()}
		>
			<Ellipsis />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			<DropdownMenu.Group>
				{#if !call.incidentId}
					<DropdownMenu.Item onclick={() => management.show(client, 'create', [call])}>Create incident</DropdownMenu.Item>
				{:else if loading}
					<DropdownMenu.Item disabled>Loading incident...</DropdownMenu.Item>
				{:else if incident}
					{@const current = incident}
					<DropdownMenu.Item onclick={() => management.show(client, 'edit', [], current)}>Edit incident</DropdownMenu.Item>
					{#if current.callCount > 1}
						<DropdownMenu.Item onclick={() => management.show(client, 'separate', [{ ...call, incidentCallCount: current.callCount }], current)}
							>Separate into new incident</DropdownMenu.Item
						>
					{/if}
				{:else if loadFailed}
					<DropdownMenu.Item disabled>Incident details unavailable. Reopen to retry.</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item onclick={() => management.show(client, 'assign', [call])}
					>{call.incidentId ? 'Move to incident' : 'Add to incident'}</DropdownMenu.Item
				>
				{#if call.incidentId}
					<DropdownMenu.Item onclick={() => management.show(client, 'remove', [call])}>Remove from incident</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Group>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
