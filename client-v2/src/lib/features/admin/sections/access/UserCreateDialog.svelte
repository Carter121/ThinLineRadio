<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { createUser, errorMessage } from './access-api.ts';
	import type { AdminUserGroupRecord } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		groups: AdminUserGroupRecord[];
		onclose: () => void;
		onsaved: () => void;
	}

	let { session, groups, onclose, onsaved }: Props = $props();

	let open = $state(true);
	let saving = $state(false);
	let email = $state('');
	let password = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let zipCode = $state('');
	let userGroupId = $state(0);
	let verified = $state(true);

	const selectedGroup = $derived(groups.find((g) => g.id === userGroupId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function save() {
		if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
			toast.error('A valid email is required');
			return;
		}
		if (password.length < 6) {
			toast.error('Password must be at least 6 characters');
			return;
		}
		saving = true;
		try {
			const result = await createUser(session.client, {
				email: email.trim(),
				password,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				zipCode: zipCode.trim(),
				userGroupId,
				verified
			});
			toast.success(`User created. PIN: ${result.pin}`, { duration: 8000 });
			open = false;
			onsaved();
			onclose();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to create user'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Create user</Dialog.Title>
			<Dialog.Description>The account gets a generated PIN and full system access. Edit the user afterwards to restrict access.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5 sm:col-span-2">
				<Label for="create-email">Email</Label>
				<Input id="create-email" type="email" bind:value={email} autocomplete="off" />
			</div>
			<div class="flex flex-col gap-1.5 sm:col-span-2">
				<Label for="create-password">Password</Label>
				<Input id="create-password" type="password" bind:value={password} autocomplete="new-password" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="create-first">First name</Label>
				<Input id="create-first" bind:value={firstName} autocomplete="off" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="create-last">Last name</Label>
				<Input id="create-last" bind:value={lastName} autocomplete="off" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="create-zip">ZIP code</Label>
				<Input id="create-zip" bind:value={zipCode} placeholder="12345" autocomplete="off" />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>User group</Label>
				<Select type="single" value={String(userGroupId)} onValueChange={(v) => (userGroupId = Number(v) || 0)}>
					<SelectTrigger class="w-full">{selectedGroup?.name ?? 'No group'}</SelectTrigger>
					<SelectContent>
						<SelectItem value="0" label="No group" />
						{#each groups as group (group.id)}
							<SelectItem value={String(group.id)} label={group.name} />
						{/each}
					</SelectContent>
				</Select>
			</div>
			<label class="flex items-center gap-2 text-sm sm:col-span-2">
				<Checkbox checked={verified} onCheckedChange={(v: boolean) => (verified = v)} />
				Mark as verified (no verification email needed)
			</label>
		</div>
		<Dialog.Footer>
			<Button variant="outline" disabled={saving} onclick={() => onOpenChange(false)}>Cancel</Button>
			<Button disabled={saving} onclick={save}>
				{#if saving}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Create user
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
