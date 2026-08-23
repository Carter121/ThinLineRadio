<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Phone from '@lucide/svelte/icons/phone';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import PurgeCallsBrowser from './tools/PurgeCallsBrowser.svelte';
	import PurgeLogsBrowser from './tools/PurgeLogsBrowser.svelte';
	import { purgeData, type PurgeType } from './tools/tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PURGE_ALL: Record<PurgeType, { title: string; description: string; confirmText: string; consequences: string }> = {
		calls: {
			title: 'Purge all calls',
			description: 'Deletes every call in the database: audio recordings, transcripts, detected units and addresses, and call metadata.',
			confirmText: 'PURGE ALL CALLS',
			consequences: 'Every recorded call, its audio, transcript and metadata will be permanently deleted for all systems.'
		},
		logs: {
			title: 'Purge all logs',
			description: 'Deletes every server log entry (errors, warnings and info messages) from the database.',
			confirmText: 'PURGE ALL LOGS',
			consequences: 'All server log entries will be permanently deleted. The Logs section will be empty until new events arrive.'
		}
	};

	//* pending stays set while the dialog fades out so its text does not vanish.
	let pending = $state<PurgeType>('calls');
	let confirmOpen = $state(false);
	let confirmInput = $state('');
	let purging = $state<PurgeType | null>(null);
	let browserTab = $state<'calls' | 'logs'>('calls');

	const pendingSpec = $derived(PURGE_ALL[pending]);
	const confirmReady = $derived(confirmInput.trim() === pendingSpec.confirmText);

	function openConfirm(type: PurgeType) {
		confirmInput = '';
		pending = type;
		confirmOpen = true;
	}

	async function runPurge() {
		const type = pending;
		if (!confirmReady) return;
		confirmOpen = false;
		purging = type;
		try {
			const result = await purgeData(session.client, type);
			toast.success(result.message ?? `All ${type} purged`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to purge ${type}`);
		} finally {
			purging = null;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Purge Data</h2>
		<p class="text-sm text-muted-foreground">
			Remove calls or log entries from the database. Every action here is permanent; export a config backup first if in doubt.
		</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		{#each Object.entries(PURGE_ALL) as [key, spec] (key)}
			{@const type = key as PurgeType}
			<Card class="gap-0 py-0">
				<CardHeader class="px-4 pt-4 pb-2">
					<CardTitle class="flex items-center gap-2 text-base">
						{#if type === 'calls'}
							<Phone class="size-4" />
						{:else}
							<ScrollText class="size-4" />
						{/if}
						{spec.title}
					</CardTitle>
					<CardDescription>{spec.description}</CardDescription>
				</CardHeader>
				<CardContent class="px-4 pt-0 pb-4">
					<Button size="sm" variant="destructive" disabled={purging !== null} onclick={() => openConfirm(type)}>
						{#if purging === type}
							<Loader2 data-icon="inline-start" class="animate-spin" />
						{:else}
							<Trash2 data-icon="inline-start" />
						{/if}
						{spec.title}
					</Button>
				</CardContent>
			</Card>
		{/each}
	</div>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<ListFilter class="size-4" />
				Delete specific records
			</CardTitle>
			<CardDescription>Search for calls or log entries, tick the ones to remove, then delete just those.</CardDescription>
		</CardHeader>
		<CardContent class="px-4 pt-0 pb-4">
			<Tabs bind:value={browserTab}>
				<TabsList>
					<TabsTrigger value="calls">Calls</TabsTrigger>
					<TabsTrigger value="logs">Logs</TabsTrigger>
				</TabsList>
				<TabsContent value="calls" class="pt-2">
					<PurgeCallsBrowser {session} />
				</TabsContent>
				<TabsContent value="logs" class="pt-2">
					<PurgeLogsBrowser {session} />
				</TabsContent>
			</Tabs>
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{pendingSpec.title}?</AlertDialog.Title>
			<AlertDialog.Description>{pendingSpec.consequences} This cannot be undone.</AlertDialog.Description>
		</AlertDialog.Header>
		<label class="flex flex-col gap-1.5 text-sm">
			<span class="text-muted-foreground"
				>Type <span class="font-mono font-semibold text-foreground">{pendingSpec.confirmText}</span> to confirm.</span
			>
			<Input bind:value={confirmInput} placeholder={pendingSpec.confirmText} autocomplete="off" />
		</label>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: 'destructive' })} disabled={!confirmReady} onclick={runPurge}>
				{pendingSpec.title}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
