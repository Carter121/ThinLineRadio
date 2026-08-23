<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { deleteGroup, deleteUser, errorMessage, transferUser } from './access-api.ts';
	import type { AdminUserGroupRecord, AdminUserRecord } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		group: AdminUserGroupRecord;
		members: AdminUserRecord[];
		otherGroups: AdminUserGroupRecord[];
		onclose: () => void;
		ondeleted: () => void;
	}

	let { session, group, members, otherGroups, onclose, ondeleted }: Props = $props();

	type MemberAction = 'unassign' | 'move' | 'delete';

	let open = $state(true);
	let busy = $state(false);
	let action = $state<MemberAction>('unassign');
	let targetGroupId = $state(untrack(() => otherGroups[0]?.id ?? 0));

	const targetGroup = $derived(otherGroups.find((g) => g.id === targetGroupId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function confirm() {
		busy = true;
		try {
			if (members.length > 0 && action === 'move') {
				if (!targetGroupId) {
					toast.error('Choose a target group');
					return;
				}
				for (const user of members) await transferUser(session.client, user.id, targetGroupId);
			} else if (members.length > 0 && action === 'delete') {
				for (const user of members) await deleteUser(session.client, user.id);
			}
			//* The server unassigns any remaining members itself.
			await deleteGroup(session.client, group.id);
			toast.success(`Deleted group ${group.name}`);
			open = false;
			ondeleted();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to delete group'));
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete {group.name}?</Dialog.Title>
			<Dialog.Description>
				{#if members.length === 0}
					This group has no members. Its registration codes stop working.
				{:else}
					{members.length} user{members.length === 1 ? ' belongs' : 's belong'} to this group. Choose what happens to them.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if members.length > 0}
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-1.5">
					<Label>Members</Label>
					<Select type="single" value={action} onValueChange={(v) => (action = (v as MemberAction) || 'unassign')}>
						<SelectTrigger class="w-full">
							{action === 'move' ? 'Move to another group' : action === 'delete' ? 'Delete the users' : 'Leave unassigned (no group)'}
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="unassign" label="Leave unassigned (no group)" />
							<SelectItem value="move" label="Move to another group" disabled={otherGroups.length === 0} />
							<SelectItem value="delete" label="Delete the users" />
						</SelectContent>
					</Select>
				</div>
				{#if action === 'move'}
					<div class="flex flex-col gap-1.5">
						<Label>Target group</Label>
						<Select type="single" value={targetGroupId ? String(targetGroupId) : ''} onValueChange={(v) => (targetGroupId = Number(v) || 0)}>
							<SelectTrigger class="w-full">{targetGroup?.name ?? 'Select a group'}</SelectTrigger>
							<SelectContent>
								{#each otherGroups as other (other.id)}
									<SelectItem value={String(other.id)} label={other.name} />
								{/each}
							</SelectContent>
						</Select>
					</div>
				{:else if action === 'delete'}
					<p class="text-sm text-destructive">All {members.length} accounts will be permanently deleted.</p>
				{/if}
				<ul class="max-h-40 overflow-y-auto rounded-md border border-border text-xs">
					{#each members as user (user.id)}
						<li class="truncate px-3 py-1 text-muted-foreground">{user.email}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" disabled={busy} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button variant="destructive" disabled={busy || (action === 'move' && !targetGroupId)} onclick={confirm}>
				{#if busy}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Delete group
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
