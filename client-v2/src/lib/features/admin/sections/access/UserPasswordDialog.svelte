<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, resetUserPassword } from './access-api.ts';
	import type { AdminUserRecord } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		user: AdminUserRecord;
		onclose: () => void;
		onsaved: () => void;
	}

	let { session, user, onclose, onsaved }: Props = $props();

	let open = $state(true);
	let saving = $state(false);
	let newPassword = $state('');
	let confirmPassword = $state('');

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function save() {
		if (newPassword.length < 6) {
			toast.error('Password must be at least 6 characters');
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error('Passwords do not match');
			return;
		}
		saving = true;
		try {
			await resetUserPassword(session.client, user.id, newPassword);
			toast.success(`Password reset for ${user.email}. They must change it at next login.`);
			open = false;
			onsaved();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to reset password'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Reset password</Dialog.Title>
			<Dialog.Description>Set a temporary password for {user.email}. The user is forced to choose a new one on their next login.</Dialog.Description>
		</Dialog.Header>
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<Label for="reset-new">New password</Label>
				<Input id="reset-new" type="password" bind:value={newPassword} autocomplete="new-password" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="reset-confirm">Confirm new password</Label>
				<Input id="reset-confirm" type="password" bind:value={confirmPassword} autocomplete="new-password" />
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button disabled={saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Reset password
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
