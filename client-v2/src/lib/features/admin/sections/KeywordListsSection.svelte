<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import KeywordChipEditor from './radio/KeywordChipEditor.svelte';
	import {
		categoryToLabel,
		createKeywordList,
		deleteKeywordList,
		fetchKeywordLists,
		normalizeKeywordList,
		normalizeKeywords,
		parseKeywordFile,
		updateKeywordList
	} from './radio/radio-api.ts';
	import type { AdminKeywordList, AdminKeywordListInput } from './radio/radio-types.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	const PREVIEW_COUNT = 12;

	//* Seeded from the config document so the cards render before the fetch
	//* lands; keyword list changes do not push a config update, so the list
	//* is refetched after every mutation.
	let lists = $state.raw<AdminKeywordList[]>(
		untrack(() => ((session.config?.keywordLists ?? []) as Partial<AdminKeywordList>[]).map(normalizeKeywordList))
	);
	let loading = $state(true);

	interface EditState {
		id: number | null;
		label: string;
		description: string;
		order: number;
		keywords: string[];
	}
	let editing = $state<EditState | null>(null);
	let savingEdit = $state(false);
	let deleteTarget = $state<AdminKeywordList | null>(null);
	let deleting = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	//* A multi-category JSON import waits here for the user to pick a mode.
	let pendingCategories = $state<Record<string, string[]> | null>(null);
	let importing = $state(false);

	const sorted = $derived([...lists].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)));
	const editingNew = $derived(editing != null && editing.id == null);

	async function load() {
		loading = true;
		try {
			lists = await fetchKeywordLists(session.client);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to load keyword lists');
		} finally {
			loading = false;
		}
	}

	function startEdit(list: AdminKeywordList) {
		editing = { id: list.id, label: list.label, description: list.description, order: list.order, keywords: [...list.keywords] };
	}

	function startNew() {
		editing = { id: null, label: '', description: '', order: 0, keywords: [] };
	}

	function cancelEdit() {
		editing = null;
	}

	function inputFrom(state: EditState): AdminKeywordListInput {
		return {
			label: state.label.trim(),
			description: state.description.trim(),
			keywords: normalizeKeywords(state.keywords),
			order: Number.isFinite(state.order) && state.order >= 0 ? Math.floor(state.order) : 0
		};
	}

	async function saveEdit() {
		if (!editing) return;
		const input = inputFrom(editing);
		if (!input.label) {
			toast.error('A label is required.');
			return;
		}
		savingEdit = true;
		try {
			if (editing.id == null) await createKeywordList(session.client, input);
			else await updateKeywordList(session.client, editing.id, input);
			editing = null;
			await load();
			toast.success('Keyword list saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save keyword list');
		} finally {
			savingEdit = false;
		}
	}

	async function confirmDelete() {
		const target = deleteTarget;
		if (!target) return;
		deleting = true;
		try {
			await deleteKeywordList(session.client, target.id);
			if (editing?.id === target.id) editing = null;
			deleteTarget = null;
			await load();
			toast.success(`Deleted "${target.label}"`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to delete keyword list');
		} finally {
			deleting = false;
		}
	}

	function onFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !editing) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const parsed = parseKeywordFile(file.name, file.type, String(reader.result ?? ''));
				if ('categories' in parsed) {
					pendingCategories = parsed.categories;
				} else {
					mergeIntoEditing(parsed.keywords);
				}
			} catch (error) {
				toast.error(error instanceof Error ? `Could not read file: ${error.message}` : 'Could not read file');
			}
		};
		reader.onerror = () => toast.error('Error reading file');
		reader.readAsText(file);
	}

	function mergeIntoEditing(keywords: string[]) {
		if (!editing) return;
		const before = editing.keywords.length;
		editing.keywords = normalizeKeywords([...editing.keywords, ...keywords]);
		const added = editing.keywords.length - before;
		if (added === 0) toast.info('No new keywords: everything in the file is already in the list.');
		else toast.success(`Added ${added} ${added === 1 ? 'keyword' : 'keywords'} from file`);
	}

	function importAllIntoCurrent() {
		if (!pendingCategories) return;
		mergeIntoEditing(Object.values(pendingCategories).flat());
		pendingCategories = null;
	}

	//* One list per JSON category; categories whose label already exists
	//* (case-insensitive) or that are empty are skipped.
	async function createListsFromCategories() {
		const categories = pendingCategories;
		pendingCategories = null;
		if (!categories) return;
		importing = true;
		const existing = new Set(lists.map((list) => list.label.toLowerCase()));
		let created = 0;
		let skipped = 0;
		try {
			for (const [index, [key, keywords]] of Object.entries(categories).entries()) {
				const label = categoryToLabel(key);
				if (keywords.length === 0 || existing.has(label.toLowerCase())) {
					skipped++;
					continue;
				}
				await createKeywordList(session.client, {
					label,
					description: `Imported from JSON file (${keywords.length} keywords)`,
					keywords,
					order: index
				});
				existing.add(label.toLowerCase());
				created++;
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to create keyword lists');
		} finally {
			importing = false;
		}
		if (editingNew) editing = null;
		await load();
		toast.success(`Created ${created} ${created === 1 ? 'list' : 'lists'}${skipped > 0 ? `, skipped ${skipped} (empty or duplicate name)` : ''}`);
	}

	onMount(() => {
		void load();
	});
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Keyword Lists</h2>
			<p class="text-sm text-muted-foreground">
				Reusable keyword sets that users can attach to alert preferences; a call alerts when its transcript contains a keyword (whole word, any case).
				Each list saves on its own.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
				<RotateCcw data-icon="inline-start" />
				Reload
			</Button>
			<Button size="sm" disabled={editingNew} onclick={startNew}>
				<Plus data-icon="inline-start" />
				New list
			</Button>
		</div>
	</div>

	{#snippet editor(state: EditState)}
		<div class="flex flex-col gap-3">
			<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
				<div class="flex flex-col gap-1.5">
					<Label for="kw-label">Label</Label>
					<Input id="kw-label" placeholder="e.g. Fire keywords" bind:value={state.label} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="kw-order">Order</Label>
					<Input id="kw-order" type="number" min={0} class="w-24" bind:value={state.order} />
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="kw-description">Description</Label>
				<Textarea id="kw-description" rows={2} placeholder="Optional" bind:value={state.description} />
			</div>
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">Keywords</span>
					<Badge variant="secondary">{state.keywords.length}</Badge>
					<Button variant="outline" size="sm" class="ml-auto" disabled={importing} onclick={() => fileInput?.click()}>
						<FileUp data-icon="inline-start" />
						Import file
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">Import a .txt (one keyword per line) or .json (array, or an object of category to array) file.</p>
				<KeywordChipEditor bind:items={state.keywords} />
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="ghost" size="sm" disabled={savingEdit} onclick={cancelEdit}>Cancel</Button>
				<Button size="sm" disabled={savingEdit || state.label.trim().length === 0} onclick={() => void saveEdit()}>
					{#if savingEdit}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Save data-icon="inline-start" />
					{/if}
					Save list
				</Button>
			</div>
		</div>
	{/snippet}

	<input bind:this={fileInput} type="file" accept=".txt,.json,text/plain,application/json" class="hidden" onchange={onFileChosen} />

	{#if editing && editing.id == null}
		<Card class="border-primary/40 py-0">
			<CardHeader class="px-5 pt-4 pb-0">
				<CardTitle class="text-base">New keyword list</CardTitle>
			</CardHeader>
			<CardContent class="px-5 pt-3 pb-4">
				{@render editor(editing)}
			</CardContent>
		</Card>
	{/if}

	{#if loading && lists.length === 0}
		<div class="flex min-h-40 items-center justify-center">
			<Spinner class="size-6" />
		</div>
	{:else if lists.length === 0 && !editingNew}
		<Card class="py-0">
			<CardContent class="flex flex-col items-center gap-2 py-10 text-center">
				<p class="text-sm text-muted-foreground">No keyword lists yet.</p>
				<Button size="sm" onclick={startNew}>
					<Plus data-icon="inline-start" />
					Add first list
				</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-4 xl:grid-cols-2">
			{#each sorted as list (list.id)}
				<Card class={['py-0', editing?.id === list.id && 'border-primary/40']}>
					<CardHeader class="px-5 pt-4 pb-0">
						<CardTitle class="flex items-center gap-2 text-base">
							<span class="truncate">{list.label || 'Unnamed list'}</span>
							<Badge variant="secondary">{list.keywords.length}</Badge>
							{#if list.order > 0}
								<span class="text-xs font-normal text-muted-foreground">order {list.order}</span>
							{/if}
							{#if editing?.id !== list.id}
								<div class="ml-auto flex items-center">
									<Button variant="ghost" size="icon-sm" class="size-7" aria-label="Edit list" onclick={() => startEdit(list)}>
										<Pencil class="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										class="size-7 text-destructive"
										aria-label="Delete list"
										onclick={() => (deleteTarget = list)}
									>
										<Trash2 class="size-4" />
									</Button>
								</div>
							{/if}
						</CardTitle>
						{#if editing?.id !== list.id && list.description}
							<p class="text-xs text-muted-foreground">{list.description}</p>
						{/if}
					</CardHeader>
					<CardContent class="px-5 pt-3 pb-4">
						{#if editing && editing.id === list.id}
							{@render editor(editing)}
						{:else if list.keywords.length === 0}
							<p class="text-sm text-muted-foreground">No keywords defined yet.</p>
						{:else}
							<div class="flex flex-wrap gap-1">
								{#each list.keywords.slice(0, PREVIEW_COUNT) as keyword (keyword)}
									<Badge variant="secondary" class="font-mono text-[11px]">{keyword}</Badge>
								{/each}
								{#if list.keywords.length > PREVIEW_COUNT}
									<Badge variant="outline" class="text-[11px] text-muted-foreground">+{list.keywords.length - PREVIEW_COUNT} more</Badge>
								{/if}
							</div>
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>

<AlertDialog.Root open={deleteTarget != null} onOpenChange={(open) => !open && !deleting && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete "{deleteTarget?.label}"?</AlertDialog.Title>
			<AlertDialog.Description>
				The list and its {deleteTarget?.keywords.length ?? 0} keywords are removed permanently, and it is detached from every user's alert preferences that
				reference it.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={deleting}>Cancel</AlertDialog.Cancel>
			<Button variant="destructive" disabled={deleting} onclick={() => void confirmDelete()}>
				{#if deleting}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				Delete
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={pendingCategories != null} onOpenChange={(open) => !open && (pendingCategories = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>JSON file has {Object.keys(pendingCategories ?? {}).length} categories</AlertDialog.Title>
			<AlertDialog.Description>
				{Object.keys(pendingCategories ?? {}).join(', ')}. Create one keyword list per category (existing labels are skipped), or add all of the
				keywords to the list you are editing.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button variant="outline" onclick={importAllIntoCurrent}>Add all to this list</Button>
			<AlertDialog.Action onclick={() => void createListsFromCategories()}>Create separate lists</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
