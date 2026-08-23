<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, transferUser } from './access-api.ts';
	import type { AdminUserGroupRecord, AdminUserRecord } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		user: AdminUserRecord;
		groups: AdminUserGroupRecord[];
		onclose: () => void;
		onsaved: () => void;
	}

	let { session, user, groups, onclose, onsaved }: Props = $props();

	let open = $state(true);
	let saving = $state(false);
	const available = $derived(groups.filter((g) => g.id !== user.userGroupId));
	let toGroupId = $state(0);
	const selectedGroup = $derived(available.find((g) => g.id === toGroupId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function save() {
		if (!toGroupId) {
			toast.error('Choose a target group');
			return;
		}
		saving = true;
		try {
			await transferUser(session.client, user.id, toGroupId);
			toast.success(`${user.email} moved to ${selectedGroup?.name ?? 'the group'}`);
			open = false;
			onsaved();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to transfer user'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Transfer to group</Dialog.Title>
			<Dialog.Description>Move {user.email} into another user group. Group admin status is cleared on transfer.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-1.5">
			<Label>Target group</Label>
			<Select type="single" value={toGroupId ? String(toGroupId) : ''} onValueChange={(v) => (toGroupId = Number(v) || 0)}>
				<SelectTrigger class="w-full">{selectedGroup?.name ?? 'Select a group'}</SelectTrigger>
				<SelectContent>
					{#each available as group (group.id)}
						<SelectItem value={String(group.id)} label={group.name} />
					{/each}
				</SelectContent>
			</Select>
			{#if available.length === 0}
				<p class="text-xs text-muted-foreground">No other groups to transfer to.</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button disabled={saving || !toGroupId} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Transfer
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
