<script lang="ts">
	import { DateTime } from 'luxon';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	import Download from '@lucide/svelte/icons/download';
	import FileJson from '@lucide/svelte/icons/file-json';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import {
		IMPORT_ENTITIES,
		buildExportJson,
		downloadTextFile,
		importConfig,
		parseConfigImport,
		type ImportEntityKey,
		type ParsedConfigImport
	} from './tools/tools-api.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	type ImportMode = 'standard' | 'full';
	const FULL_CONFIRM_TEXT = 'RESTORE';

	let exporting = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let fileName = $state('');
	let parsed = $state.raw<ParsedConfigImport | null>(null);
	let parseError = $state<string | null>(null);
	let included = $state<Record<string, boolean>>({});
	let mode = $state<ImportMode>('standard');
	let confirmOpen = $state(false);
	let confirmText = $state('');
	let importing = $state(false);

	//* Counts of what the live config holds, shown next to the export button.
	const currentCounts = $derived.by(() => {
		const config = session.config;
		if (!config) return [];
		return IMPORT_ENTITIES.filter((e) => e.kind === 'list')
			.map((e) => ({ key: e.key, label: e.label, count: Array.isArray(config[e.key]) ? (config[e.key] as unknown[]).length : 0 }))
			.filter((e) => e.count > 0);
	});

	const selectedEntities = $derived(parsed ? parsed.entities.filter((e) => included[e.key]) : []);
	const effectiveEntities = $derived(selectedEntities.filter((e) => mode === 'full' || !e.fullOnly));
	const skippedFullOnly = $derived(mode === 'standard' ? selectedEntities.filter((e) => e.fullOnly) : []);
	const canImport = $derived(!!parsed && effectiveEntities.length > 0 && !importing);
	const confirmReady = $derived(mode === 'standard' || confirmText.trim() === FULL_CONFIRM_TEXT);

	async function exportConfig() {
		exporting = true;
		try {
			//* Fetch fresh so the file reflects the server state, not a stale push.
			const document = await session.client.getConfig();
			const stamp = DateTime.now().toFormat('yyyy-LL-dd-HHmm');
			downloadTextFile(`ThinLineRadioV7-config-${stamp}.json`, buildExportJson(document.config));
			toast.success('Config exported');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to export config');
		} finally {
			exporting = false;
		}
	}

	async function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.item(0);
		input.value = '';
		if (!file) return;
		fileName = file.name;
		parseError = null;
		parsed = null;
		try {
			const result = parseConfigImport(await file.text());
			const next: Record<string, boolean> = {};
			for (const entity of result.entities) next[entity.key] = true;
			included = next;
			parsed = result;
		} catch (error) {
			parseError = error instanceof Error ? error.message : 'Failed to read file';
		}
	}

	function clearFile() {
		fileName = '';
		parsed = null;
		parseError = null;
		included = {};
	}

	function openConfirm() {
		confirmText = '';
		confirmOpen = true;
	}

	function buildPayload(): Record<string, unknown> {
		if (!parsed) return {};
		const payload: Record<string, unknown> = {};
		for (const entity of effectiveEntities) payload[entity.key] = parsed.config[entity.key];
		//* radioReference rides along with options (the server merges it there).
		if ('options' in payload && 'radioReference' in parsed.config) payload.radioReference = parsed.config.radioReference;
		return payload;
	}

	async function runImport() {
		if (!parsed || !confirmReady) return;
		importing = true;
		confirmOpen = false;
		try {
			await importConfig(session.client, buildPayload(), mode === 'full');
			await session.refreshConfig();
			toast.success(mode === 'full' ? 'Config restored' : 'Config imported');
			clearFile();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Import failed');
			//* The server may have applied part of the file; show what it has now.
			await session.refreshConfig();
		} finally {
			importing = false;
		}
	}

	function toggleIncluded(key: ImportEntityKey, checked: boolean) {
		included = { ...included, [key]: checked };
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h2 class="text-lg font-semibold">Import & Export</h2>
		<p class="text-sm text-muted-foreground">Back up the server configuration to a JSON file, or load a previous export back into the server.</p>
	</div>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<Download class="size-4" />
				Export
			</CardTitle>
			<CardDescription>Downloads the full config document as JSON, the same content the config sync feature writes to disk.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-3 px-4 pt-0 pb-4">
			<Alert>
				<TriangleAlert />
				<AlertTitle>The export contains secrets</AlertTitle>
				<AlertDescription>
					User records (including password hashes and PINs), API keys, downstream keys, and email/integration credentials are all included. Store the
					file somewhere private.
				</AlertDescription>
			</Alert>
			{#if currentCounts.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each currentCounts as entry (entry.key)}
						<Badge variant="secondary">{entry.count} {entry.label.toLowerCase()}</Badge>
					{/each}
				</div>
			{/if}
			<div>
				<Button size="sm" disabled={exporting} onclick={exportConfig}>
					{#if exporting}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Download data-icon="inline-start" />
					{/if}
					Download config JSON
				</Button>
			</div>
		</CardContent>
	</Card>

	<Card class="gap-0 py-0">
		<CardHeader class="px-4 pt-4 pb-2">
			<CardTitle class="flex items-center gap-2 text-base">
				<Upload class="size-4" />
				Import
			</CardTitle>
			<CardDescription>Pick an exported JSON file, review what it contains, choose which sections to apply, then import.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4 px-4 pt-0 pb-4">
			<input bind:this={fileInput} type="file" accept=".json,application/json" class="hidden" onchange={onFileChange} />
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" disabled={importing} onclick={() => fileInput?.click()}>
					<FileJson data-icon="inline-start" />
					Choose file
				</Button>
				{#if fileName}
					<span class="text-sm">{fileName}</span>
					<Button variant="ghost" size="icon-sm" aria-label="Clear file" disabled={importing} onclick={clearFile}>
						<X />
					</Button>
				{:else}
					<span class="text-sm text-muted-foreground">No file selected</span>
				{/if}
			</div>

			{#if parseError}
				<Alert variant="destructive">
					<TriangleAlert />
					<AlertTitle>Cannot import this file</AlertTitle>
					<AlertDescription>{parseError}</AlertDescription>
				</Alert>
			{/if}

			{#if parsed}
				<div class="flex flex-col gap-3">
					<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span>File version: <span class="font-medium text-foreground">{parsed.version ?? 'unknown'}</span></span>
						{#if session.config?.version}
							<span>Server version: <span class="font-medium text-foreground">{session.config.version}</span></span>
						{/if}
					</div>
					{#if parsed.legacyFixes.length > 0}
						<p class="text-xs text-muted-foreground">Legacy format adjustments: {parsed.legacyFixes.join('; ')}.</p>
					{/if}
					{#if parsed.ignoredKeys.length > 0}
						<p class="text-xs text-muted-foreground">Ignored keys (not understood by the server import): {parsed.ignoredKeys.join(', ')}.</p>
					{/if}

					<div class="overflow-x-auto rounded-md border border-border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-10"></TableHead>
									<TableHead>Section</TableHead>
									<TableHead class="text-right">In file</TableHead>
									<TableHead>Applied by</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each parsed.entities as entity (entity.key)}
									<TableRow>
										<TableCell>
											<Checkbox
												checked={included[entity.key] ?? false}
												onCheckedChange={(checked) => toggleIncluded(entity.key, checked === true)}
												aria-label={`Include ${entity.label}`}
												disabled={importing}
											/>
										</TableCell>
										<TableCell class="font-medium">{entity.label}</TableCell>
										<TableCell class="text-right tabular-nums">
											{entity.count}
											{#if entity.detail}
												<span class="text-xs text-muted-foreground">({entity.detail})</span>
											{/if}
										</TableCell>
										<TableCell class="text-xs text-muted-foreground">{entity.fullOnly ? 'Full restore only' : 'Both modes'}</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>

					<div class="grid gap-2 sm:grid-cols-2">
						<button
							type="button"
							class={[
								'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
								mode === 'standard' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
							]}
							aria-pressed={mode === 'standard'}
							onclick={() => (mode = 'standard')}
						>
							<span class="text-sm font-medium">Standard import</span>
							<span class="text-xs text-muted-foreground">
								Options are overwritten. Systems, talkgroups, tags, groups, API keys, dirwatch and downstreams in the file replace the server's
								lists of those types (rows missing from the file are removed). Users and user groups are added or updated but never deleted.
								Keyword lists, alert preferences and device tokens are skipped.
							</span>
						</button>
						<button
							type="button"
							class={[
								'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
								mode === 'full' ? 'border-destructive bg-destructive/5' : 'border-border hover:bg-muted/50'
							]}
							aria-pressed={mode === 'full'}
							onclick={() => (mode = 'full')}
						>
							<span class="flex items-center gap-1.5 text-sm font-medium text-destructive">
								<TriangleAlert class="size-3.5" />
								Full restore (destructive)
							</span>
							<span class="text-xs text-muted-foreground">
								Everything the standard import does, plus: users and user groups missing from the file are deleted, and keyword lists, user
								alert preferences and device tokens are wiped and replaced with the file's contents. Use this to restore a backup.
							</span>
						</button>
					</div>

					{#if skippedFullOnly.length > 0}
						<p class="text-xs text-muted-foreground">
							Skipped in standard mode: {skippedFullOnly.map((e) => e.label.toLowerCase()).join(', ')}.
						</p>
					{/if}

					<div class="flex items-center gap-2">
						<Button size="sm" variant={mode === 'full' ? 'destructive' : 'default'} disabled={!canImport} onclick={openConfirm}>
							{#if importing}
								<Loader2 data-icon="inline-start" class="animate-spin" />
							{:else}
								<Upload data-icon="inline-start" />
							{/if}
							{mode === 'full' ? 'Restore from file' : 'Import'}
						</Button>
						{#if effectiveEntities.length === 0}
							<span class="text-xs text-muted-foreground">Select at least one section to import.</span>
						{/if}
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{mode === 'full' ? 'Restore configuration from file?' : 'Import configuration?'}</AlertDialog.Title>
			<AlertDialog.Description>
				{#if mode === 'full'}
					This replaces the server configuration with the file. Users, user groups, keyword lists, alert preferences and device tokens not in the
					file will be deleted. This cannot be undone; export the current config first if you have not already.
				{:else}
					Sections in the file replace the matching server data (rows missing from the file are removed for systems, tags, groups, API keys,
					dirwatch and downstreams). Users and user groups are only added or updated.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="flex flex-col gap-3 text-sm">
			<div class="flex flex-wrap gap-1.5">
				{#each effectiveEntities as entity (entity.key)}
					<Badge variant="secondary">{entity.count} {entity.label.toLowerCase()}</Badge>
				{/each}
			</div>
			{#if mode === 'full'}
				<label class="flex flex-col gap-1.5">
					<span class="text-muted-foreground">Type <span class="font-mono font-semibold text-foreground">{FULL_CONFIRM_TEXT}</span> to confirm.</span>
					<Input bind:value={confirmText} placeholder={FULL_CONFIRM_TEXT} autocomplete="off" />
				</label>
			{/if}
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={mode === 'full' ? buttonVariants({ variant: 'destructive' }) : undefined}
				disabled={!confirmReady}
				onclick={runImport}
			>
				{mode === 'full' ? 'Restore' : 'Import'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
