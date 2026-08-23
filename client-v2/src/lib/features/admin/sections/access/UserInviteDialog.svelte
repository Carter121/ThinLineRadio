<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { errorMessage, inviteUser } from './access-api.ts';
	import type { AdminUserGroupRecord } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		groups: AdminUserGroupRecord[];
		onclose: () => void;
	}

	let { session, groups, onclose }: Props = $props();

	interface InviteResult {
		email: string;
		success: boolean;
		message: string;
	}

	let open = $state(true);
	let sending = $state(false);
	let emailsText = $state('');
	let groupId = $state(untrack(() => groups[0]?.id ?? 0));
	let results = $state<InviteResult[] | null>(null);

	const emails = $derived(
		emailsText
			.split(/[\n,;]+/)
			.map((e) => e.trim())
			.filter((e) => e.length > 0)
	);
	const invalid = $derived(emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)));
	const selectedGroup = $derived(groups.find((g) => g.id === groupId) ?? null);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function send() {
		if (emails.length === 0) {
			toast.error('Enter at least one email address');
			return;
		}
		if (invalid.length > 0) {
			toast.error(`Invalid email: ${invalid[0]}`);
			return;
		}
		if (!groupId) {
			toast.error('Choose a user group');
			return;
		}
		sending = true;
		const out: InviteResult[] = [];
		for (const email of emails) {
			try {
				await inviteUser(session.client, email, groupId);
				out.push({ email, success: true, message: 'Invitation sent' });
			} catch (error) {
				out.push({ email, success: false, message: errorMessage(error, 'Failed') });
			}
		}
		results = out;
		sending = false;
		const ok = out.filter((r) => r.success).length;
		if (ok === out.length) toast.success(`${ok} invitation${ok === 1 ? '' : 's'} sent`);
		else toast.warning(`${ok} of ${out.length} invitations sent`);
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Invite users</Dialog.Title>
			<Dialog.Description>
				Each address receives an invitation link (valid 7 days) to join the selected group. Email service must be enabled for the email to go out.
			</Dialog.Description>
		</Dialog.Header>
		{#if results}
			<ul class="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border text-sm">
				{#each results as result (result.email)}
					<li class="flex items-center gap-2 px-3 py-2">
						{#if result.success}
							<CircleCheck class="size-4 shrink-0 text-primary" />
						{:else}
							<CircleX class="size-4 shrink-0 text-destructive" />
						{/if}
						<span class="min-w-0 flex-1 truncate">{result.email}</span>
						<span class="text-xs text-muted-foreground">{result.message}</span>
					</li>
				{/each}
			</ul>
			<Dialog.Footer>
				<Button onclick={() => onOpenChange(false)}>Done</Button>
			</Dialog.Footer>
		{:else}
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="invite-emails">Email addresses</Label>
					<Textarea id="invite-emails" rows={5} bind:value={emailsText} placeholder="One per line, or comma-separated" />
					<p class="text-xs text-muted-foreground">
						{emails.length} address{emails.length === 1 ? '' : 'es'}{#if invalid.length > 0}, {invalid.length} invalid{/if}
					</p>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label>User group</Label>
					<Select type="single" value={String(groupId)} onValueChange={(v) => (groupId = Number(v) || 0)}>
						<SelectTrigger class="w-full">{selectedGroup?.name ?? 'Select a group'}</SelectTrigger>
						<SelectContent>
							{#each groups as group (group.id)}
								<SelectItem value={String(group.id)} label={group.name} />
							{/each}
						</SelectContent>
					</Select>
					{#if groups.length === 0}
						<p class="text-xs text-destructive">Create a user group first; invitations always target a group.</p>
					{/if}
				</div>
			</div>
			<Dialog.Footer>
				<Button variant="outline" disabled={sending} onclick={() => onOpenChange(false)}>Cancel</Button>
				<Button disabled={sending || groups.length === 0} onclick={send}>
					{#if sending}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{/if}
					Send invitations
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
