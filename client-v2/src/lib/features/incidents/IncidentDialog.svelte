<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { TlrApiError } from '$lib/core/tlr-client';
	import { formatDateTime } from '$lib/core/format';
	import type { Alert, Incident, IncidentMutationResult } from '$lib/core/types';
	import { incidentManagement as management } from './incident-management.svelte';

	let incidentType = $state('Incident');
	let address = $state('');
	let search = $state('');
	let offset = $state(0);
	let incidents = $state.raw<Incident[]>([]);
	let hasMore = $state(false);
	let target = $state<Incident | null>(null);
	let busy = $state(false);
	let loading = $state(false);
	let error = $state('');
	let confirm = $state(false);
	let searchVersion = 0;
	const title = $derived(
		{ create: 'Create incident', assign: 'Add alerts to incident', remove: 'Remove from incident', edit: 'Edit incident' }[management.action]
	);
	const metadata = $derived(management.action === 'create' || management.action === 'edit');
	const sourceIds = $derived([...new Set(management.calls.flatMap((call) => (call.incidentId ? [call.incidentId] : [])))]);

	$effect(() => {
		if (!management.open) return;
		void management.requestId;
		untrack(() => {
			const first = management.calls[0] as Alert | undefined;
			incidentType = management.incident?.incidentType || first?.incidentType || first?.parsedAddress?.incidentType || 'Incident';
			address =
				management.incident?.address || first?.incidentAddress || first?.parsedAddress?.originalAddress || first?.parsedAddress?.address || '';
			target = management.action === 'assign' ? management.incident : null;
			error = '';
			confirm = false;
			search = '';
			offset = 0;
		});
	});

	$effect(() => {
		if (!management.open || management.action !== 'assign') return;
		const query = search;
		const start = offset;
		const version = ++searchVersion;
		const timer = setTimeout(async () => {
			loading = true;
			try {
				const result = await management.client!.searchIncidents({ search: query, offset: start, limit: 20 });
				if (version !== searchVersion) return;
				incidents = result.incidents;
				hasMore = result.hasMore;
			} catch (err) {
				if (version === searchVersion) error = err instanceof Error ? err.message : 'Could not load incidents';
			} finally {
				if (version === searchVersion) loading = false;
			}
		}, 200);
		return () => {
			clearTimeout(timer);
			searchVersion++;
		};
	});

	async function save() {
		if (busy || !management.client) return;
		if (!confirm && (management.action === 'remove' || (management.action !== 'edit' && sourceIds.some((id) => id !== target?.incidentId)))) {
			confirm = true;
			return;
		}
		busy = true;
		error = '';
		try {
			const client = management.client;
			const calls = management.calls.map((call) => ({ callId: call.callId, expectedIncidentId: call.incidentId ?? null }));
			let result: IncidentMutationResult;
			if (management.action === 'create') result = await client.createIncident(incidentType, address, calls);
			else if (management.action === 'edit') result = await client.editIncident(management.incident!.incidentId, incidentType, address);
			else
				result = await client.assignIncidentCalls(
					management.action === 'remove' ? management.calls[0].incidentId! : target!.incidentId,
					calls,
					management.action === 'remove'
				);
			management.changed(result);
			management.open = false;
			toast.success('Incident updated');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not update incident';
			if (err instanceof TlrApiError && err.status === 409) {
				const refreshed = await Promise.allSettled(management.calls.map((call) => management.client!.getCallMeta(call.callId)));
				if (refreshed.every((result) => result.status === 'fulfilled')) {
					management.calls = refreshed.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
				} else {
					error = 'Some selected calls are unavailable. Close this dialog and select alerts again.';
					management.calls = [];
				}
				confirm = false;
				management.changed({ incidentId: 0, callIds: management.calls.map((call) => call.callId) });
				if (management.calls.length) error = 'Membership changed. Review the refreshed source incidents and submit again.';
			}
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root
	open={management.open}
	onOpenChange={(open) => {
		if (!busy) management.open = open;
	}}
>
	<Dialog.Content
		class="max-h-[90dvh] overflow-y-auto"
		onInteractOutside={(event) => {
			if (busy) event.preventDefault();
		}}
		onEscapeKeydown={(event) => {
			if (busy) event.preventDefault();
		}}
	>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>
				{#if management.action === 'edit'}Update the shared incident details.
				{:else}{management.calls.length} unique {management.calls.length === 1 ? 'call' : 'calls'} selected. All alerts for each call share the same incident
					link.{/if}
				Changes do not send notifications.
			</Dialog.Description>
		</Dialog.Header>
		{#if sourceIds.length && management.action !== 'edit'}
			<p class="text-sm text-muted-foreground">Current incidents: {sourceIds.map((id) => `#${id}`).join(', ')}.</p>
		{/if}
		{#if metadata}
			<Field.FieldGroup>
				<Field.Field>
					<Field.FieldLabel for="incident-type">Incident type</Field.FieldLabel>
					<Input id="incident-type" bind:value={incidentType} maxlength={200} disabled={busy} />
				</Field.Field>
				<Field.Field>
					<Field.FieldLabel for="incident-address">Address (optional)</Field.FieldLabel>
					<Input id="incident-address" bind:value={address} maxlength={500} disabled={busy} />
					<Field.FieldDescription>Address text does not create a map pin.</Field.FieldDescription>
				</Field.Field>
			</Field.FieldGroup>
		{:else if management.action === 'assign'}
			<Field.FieldGroup>
				<Field.Field>
					<Field.FieldLabel for="incident-search">Find an incident</Field.FieldLabel>
					<Input
						id="incident-search"
						value={search}
						oninput={(event) => {
							search = event.currentTarget.value;
							offset = 0;
						}}
						placeholder="Type, address, or incident number"
						disabled={busy}
					/>
				</Field.Field>
			</Field.FieldGroup>
			{#if target}<p class="text-sm">Selected: #{target.incidentId} {target.incidentType}{target.address ? `, ${target.address}` : ''}</p>{/if}
			<div class="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-busy={loading}>
				{#if loading}<p class="text-sm text-muted-foreground">Loading incidents...</p>{/if}
				{#each incidents as incident (incident.incidentId)}
					<Button
						variant={target?.incidentId === incident.incidentId ? 'secondary' : 'outline'}
						class="h-auto justify-start text-left whitespace-normal"
						disabled={busy}
						onclick={() => {
							target = incident;
							confirm = false;
						}}
					>
						<span
							>#{incident.incidentId}
							{incident.incidentType || 'Incident'}{incident.address ? `, ${incident.address}` : ''}<br />
							<span class="text-xs text-muted-foreground">{formatDateTime(incident.lastSeenAt)} · {incident.callCount} calls</span>
						</span>
					</Button>
				{:else}{#if !loading}<p class="text-sm text-muted-foreground">No incidents found.</p>{/if}{/each}
			</div>
			<div class="flex justify-between gap-2">
				<Button variant="outline" disabled={offset === 0 || busy || loading} onclick={() => (offset = Math.max(0, offset - 20))}>Previous</Button>
				<Button variant="outline" disabled={!hasMore || busy || loading} onclick={() => (offset += 20)}>Next</Button>
			</div>
		{/if}
		{#if management.action === 'remove'}<p class="text-sm">
				Removed calls stay unlinked until you manually assign them again. An incident with no remaining calls is deleted.
			</p>{/if}
		{#if confirm}<p role="status" class="text-sm">
				Confirm {management.action === 'remove' ? 'removing' : 'moving'}
				{management.calls.length} unique calls from {sourceIds.map((id) => `#${id}`).join(', ')}{target
					? ` to #${target.incidentId}`
					: management.action === 'create'
						? ' to the new incident'
						: ''}.
			</p>{/if}
		{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" disabled={busy} onclick={() => (management.open = false)}>Cancel</Button>
			<Button
				disabled={busy ||
					(metadata && !incidentType.trim()) ||
					(management.action === 'assign' && !target) ||
					(management.action === 'remove' && management.calls.some((call) => !call.incidentId)) ||
					(management.action !== 'edit' && !management.calls.length)}
				onclick={save}
			>
				{busy ? 'Saving...' : confirm ? 'Confirm change' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
