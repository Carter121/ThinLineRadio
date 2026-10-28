<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { buttonVariants } from '$lib/components/ui/button';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { IncidentMembership } from '$lib/core/types';
	import type { TlrClient } from '$lib/core/tlr-client';
	import { incidentManagement as management } from './incident-management.svelte';
	let { call, client }: { call: IncidentMembership; client: TlrClient } = $props();
</script>

{#if call.incidentId}
	<a href={`/incident/${call.incidentId}`} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>Incident #{call.incidentId}</a>
{/if}
{#if call.canManageIncidents}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class={buttonVariants({ variant: 'ghost', size: 'icon' })}
			aria-label="Manage incident"
			onclick={(event) => event.stopPropagation()}
		>
			<Ellipsis />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			<DropdownMenu.Group>
				<DropdownMenu.Item onclick={() => management.show(client, 'create', [call])}>Create incident</DropdownMenu.Item>
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
