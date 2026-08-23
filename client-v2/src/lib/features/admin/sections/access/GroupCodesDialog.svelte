<script lang="ts">
	import { onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import Copy from '@lucide/svelte/icons/copy';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import { deleteGroupCode, errorMessage, generateGroupCode, listGroupCodes } from './access-api.ts';
	import type { AdminUserGroupRecord, RegistrationCode } from './access-types.ts';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		session: AdminSessionState;
		group: AdminUserGroupRecord;
		onclose: () => void;
	}

	let { session, group, onclose }: Props = $props();

	let open = $state(true);
	let loading = $state(true);
	let generating = $state(false);
	let codes = $state.raw<RegistrationCode[]>([]);
	let label = $state('');
	let customCode = $state('');
	let expiresAt = $state('');
	let maxUses = $state(0);
	let isOneTime = $state(false);
	let deleting = $state<RegistrationCode | null>(null);
	let deleteBusy = $state(false);

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) onclose();
	}

	async function load() {
		loading = true;
		try {
			codes = await listGroupCodes(session.client, group.id);
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to load registration codes'));
		} finally {
			loading = false;
		}
	}

	async function generate() {
		let expires = 0;
		if (expiresAt.trim()) {
			const parsed = DateTime.fromISO(expiresAt);
			if (!parsed.isValid) {
				toast.error('Invalid expiration date');
				return;
			}
			expires = Math.floor(parsed.toSeconds());
		}
		generating = true;
		try {
			const result = await generateGroupCode(session.client, group.id, {
				label: label.trim(),
				code: customCode.trim(),
				expiresAt: expires,
				maxUses: isOneTime ? 1 : Math.max(0, Math.floor(Number(maxUses) || 0)),
				isOneTime
			});
			toast.success(`Code generated: ${result.code}`, { duration: 8000 });
			label = '';
			customCode = '';
			expiresAt = '';
			maxUses = 0;
			isOneTime = false;
			await load();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to generate code'));
		} finally {
			generating = false;
		}
	}

	async function confirmDelete() {
		if (!deleting) return;
		deleteBusy = true;
		try {
			await deleteGroupCode(session.client, group.id, deleting.id);
			toast.success('Registration code deleted');
			deleting = null;
			await load();
		} catch (error) {
			toast.error(errorMessage(error, 'Failed to delete code'));
		} finally {
			deleteBusy = false;
		}
	}

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			toast.success('Code copied');
		} catch {
			toast.error('Could not copy to clipboard');
		}
	}

	function formatDate(seconds: number): string {
		if (!seconds) return 'Never';
		return DateTime.fromSeconds(seconds).toLocaleString(DateTime.DATETIME_SHORT);
	}

	function isExpired(code: RegistrationCode): boolean {
		return code.expiresAt > 0 && code.expiresAt * 1000 < Date.now();
	}

	function isUsedUp(code: RegistrationCode): boolean {
		return code.maxUses > 0 && code.currentUses >= code.maxUses;
	}

	onMount(() => {
		void load();
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex max-h-[90vh] w-[95vw] flex-col sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Registration codes</Dialog.Title>
			<Dialog.Description>Codes that let people register directly into {group.name}.</Dialog.Description>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			<div class="flex flex-col gap-4">
				<div class="rounded-md border border-border p-3">
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<Label for="code-label">Label</Label>
							<Input id="code-label" bind:value={label} placeholder="e.g. Station 12 crew" autocomplete="off" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="code-custom">Custom code (optional)</Label>
							<Input id="code-custom" class="font-mono" bind:value={customCode} placeholder="Auto-generated if blank" autocomplete="off" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="code-expires">Expires</Label>
							<Input id="code-expires" type="datetime-local" bind:value={expiresAt} />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="code-max">Max uses</Label>
							<Input id="code-max" type="number" min={0} bind:value={maxUses} disabled={isOneTime} placeholder="0 for unlimited" />
						</div>
						<label class="flex items-center gap-2 text-sm sm:col-span-2">
							<Checkbox checked={isOneTime} onCheckedChange={(v: boolean) => (isOneTime = v)} />
							One-time code (deactivated after first use)
						</label>
					</div>
					<div class="mt-3 flex justify-end">
						<Button size="sm" disabled={generating} onclick={generate}>
							{#if generating}
								<Loader2 data-icon="inline-start" class="animate-spin" />
							{:else}
								<Plus data-icon="inline-start" />
							{/if}
							Generate code
						</Button>
					</div>
				</div>

				{#if loading}
					<div class="flex min-h-24 items-center justify-center">
						<Spinner class="size-5" />
					</div>
				{:else if codes.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">No registration codes yet.</p>
				{:else}
					<div class="overflow-x-auto rounded-md border border-border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Code</TableHead>
									<TableHead>Label</TableHead>
									<TableHead>Uses</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead>Status</TableHead>
									<TableHead class="w-20"></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each codes as code (code.id)}
									<TableRow>
										<TableCell class="font-mono text-sm">{code.code}</TableCell>
										<TableCell class="text-sm">{code.label || '-'}</TableCell>
										<TableCell class="text-sm">
											{code.currentUses}{code.maxUses > 0 ? ` / ${code.maxUses}` : ''}
											{#if code.isOneTime}
												<Badge variant="outline" class="ml-1">One-time</Badge>
											{/if}
										</TableCell>
										<TableCell class="text-sm">{formatDate(code.expiresAt)}</TableCell>
										<TableCell>
											{#if !code.isActive}
												<Badge variant="secondary">Inactive</Badge>
											{:else if isExpired(code)}
												<Badge variant="destructive">Expired</Badge>
											{:else if isUsedUp(code)}
												<Badge variant="secondary">Used up</Badge>
											{:else}
												<Badge>Active</Badge>
											{/if}
										</TableCell>
										<TableCell>
											<div class="flex items-center justify-end gap-1">
												<Button variant="ghost" size="icon-sm" aria-label="Copy code" onclick={() => copy(code.code)}>
													<Copy class="size-4" />
												</Button>
												<Button variant="ghost" size="icon-sm" class="text-destructive" aria-label="Delete code" onclick={() => (deleting = code)}>
													<Trash2 class="size-4" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={() => deleting !== null, (v) => (deleting = v ? deleting : null)}
	title="Delete this registration code?"
	description={deleting ? `Code ${deleting.code} stops working immediately. This cannot be undone.` : ''}
	confirmLabel="Delete"
	destructive
	busy={deleteBusy}
	onconfirm={confirmDelete}
/>
