<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { AdminSystem } from '$lib/core/admin-types.ts';
	import SearchableSelect, { type SearchableOption } from './SearchableSelect.svelte';
	import {
		DIRWATCH_MIN_DELAY,
		DIRWATCH_TYPES,
		MASK_TAGS,
		dirwatchShows,
		validateDirwatch,
		type DirwatchEntry,
		type DirwatchErrors
	} from './monitoring-types.ts';

	interface Props {
		open: boolean;
		entry: DirwatchEntry | null;
		others: DirwatchEntry[];
		systems: AdminSystem[];
		onsave: (entry: DirwatchEntry) => void;
	}

	let { open = $bindable(), entry, others, systems, onsave }: Props = $props();

	//* Working copy; the caller only sees it on Save.
	let draft = $state<DirwatchEntry>({});
	let attempted = $state(false);

	$effect(() => {
		if (open) {
			draft = { ...(entry ?? {}) };
			attempted = false;
		}
	});

	const isNew = $derived(!entry?.id);
	const type = $derived(draft.type || 'default');
	const errors = $derived<DirwatchErrors>(attempted ? validateDirwatch(draft, others) : {});
	const typeLabel = $derived(DIRWATCH_TYPES.find((t) => t.value === type)?.label ?? 'Default');

	const systemOptions = $derived<SearchableOption[]>(
		systems.filter((s) => s.id > 0).map((s) => ({ value: s.id, label: s.label, hint: s.systemRef !== undefined ? `#${s.systemRef}` : undefined }))
	);
	const selectedSystem = $derived(systems.find((s) => s.id === draft.systemId));
	const talkgroupOptions = $derived<SearchableOption[]>(
		(selectedSystem?.talkgroups ?? [])
			.filter((tg) => tg.id > 0)
			.map((tg) => ({ value: tg.id, label: tg.label || tg.name || `Talkgroup ${tg.talkgroupRef}`, hint: String(tg.talkgroupRef) }))
	);
	const siteOptions = $derived<SearchableOption[]>(
		((selectedSystem?.sites as { id?: number; label?: string; siteRef?: number }[] | undefined) ?? [])
			.filter((site) => (site.id ?? 0) > 0)
			.map((site) => ({ value: site.id as number, label: site.label || `Site ${site.siteRef ?? site.id}` }))
	);

	const directoryHint = $derived.by(() => {
		switch (type) {
			case 'dsdplus':
				return 'Path of the DSDPlus Record, 1R-Record or VC-Record directory.';
			case 'sdr-trunk':
				return 'Path of the SDR Trunk Recordings directory.';
			case 'trunk-recorder':
				return 'Path of the trunk-recorder captureDir.';
			default:
				return 'Path of the local directory to monitor.';
		}
	});

	function numberOrUndefined(event: Event): number | undefined {
		const raw = (event.currentTarget as HTMLInputElement).value;
		if (raw.trim() === '') return undefined;
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	function submit() {
		attempted = true;
		if (Object.keys(validateDirwatch(draft, others)).length > 0) return;
		onsave({ ...draft });
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
		<Dialog.Header class="px-6 pt-6 pb-4">
			<Dialog.Title>{isNew ? 'New dirwatch' : 'Edit dirwatch'}</Dialog.Title>
			<Dialog.Description>Changes are applied to the list; use Save on the Dirwatch page to persist and restart the watchers.</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-5 overflow-y-auto px-6 pb-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<Label for="dw-type">Type</Label>
					<Select type="single" value={type} onValueChange={(v) => (draft.type = v)}>
						<SelectTrigger id="dw-type" size="sm" class="w-full">{typeLabel}</SelectTrigger>
						<SelectContent>
							{#each DIRWATCH_TYPES as option (option.value)}
								<SelectItem value={option.value} label={option.label} />
							{/each}
						</SelectContent>
					</Select>
					<p class="text-xs text-muted-foreground">{DIRWATCH_TYPES.find((t) => t.value === type)?.description}</p>
				</div>

				<div class="flex flex-col gap-3 pt-1">
					<div class="flex items-center justify-between gap-3">
						<div>
							<Label for="dw-enabled">Enabled</Label>
							<p class="text-xs text-muted-foreground">Disabled watchers are kept but do not ingest.</p>
						</div>
						<Switch id="dw-enabled" checked={!draft.disabled} onCheckedChange={(checked: boolean) => (draft.disabled = !checked)} />
					</div>
					<div class="flex items-center justify-between gap-3">
						<div>
							<Label for="dw-delete">Delete after ingest</Label>
							<p class="text-xs text-muted-foreground">
								When on, pre-existing files are ingested and deleted at server start. When off, pre-existing files are ignored.
							</p>
						</div>
						<Switch id="dw-delete" checked={!!draft.deleteAfter} onCheckedChange={(checked: boolean) => (draft.deleteAfter = checked)} />
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<Label for="dw-directory">Directory</Label>
				<Input
					id="dw-directory"
					class="font-mono text-sm"
					placeholder="/var/lib/trunk-recorder/audio"
					autocomplete="off"
					aria-invalid={!!errors.directory}
					value={draft.directory ?? ''}
					oninput={(e: Event) => (draft.directory = (e.currentTarget as HTMLInputElement).value)}
				/>
				<p class="text-xs text-muted-foreground">{directoryHint} Dirwatch is not compatible with networked disks.</p>
				{#if errors.directory}<p class="text-xs text-destructive">{errors.directory}</p>{/if}
			</div>

			{#if dirwatchShows(type, 'extension')}
				<div class="flex flex-col gap-1.5">
					<Label for="dw-extension">Extension</Label>
					<Input
						id="dw-extension"
						class="w-40 font-mono text-sm"
						placeholder="wav"
						autocomplete="off"
						aria-invalid={!!errors.extension}
						value={draft.extension ?? ''}
						oninput={(e: Event) => (draft.extension = (e.currentTarget as HTMLInputElement).value)}
					/>
					<p class="text-xs text-muted-foreground">Audio file extension to watch, without the period (mp3, wav, m4a). Defaults to wav.</p>
					{#if errors.extension}<p class="text-xs text-destructive">{errors.extension}</p>{/if}
				</div>
			{/if}

			{#if dirwatchShows(type, 'system')}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="dw-system">System</Label>
						<SearchableSelect
							id="dw-system"
							options={systemOptions}
							value={draft.systemId}
							placeholder="Select system"
							searchPlaceholder="Search systems"
							onchange={(v) => {
								draft.systemId = v;
								draft.talkgroupId = undefined;
								draft.siteId = undefined;
							}}
						/>
						<p class="text-xs text-muted-foreground">System the ingested calls belong to.</p>
						{#if errors.systemId}<p class="text-xs text-destructive">{errors.systemId}</p>{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="dw-talkgroup">Talkgroup</Label>
						<SearchableSelect
							id="dw-talkgroup"
							options={talkgroupOptions}
							value={draft.talkgroupId}
							placeholder={draft.systemId ? 'Select talkgroup' : 'Select a system first'}
							searchPlaceholder={`Search ${talkgroupOptions.length.toLocaleString()} talkgroups`}
							disabled={!draft.systemId}
							onchange={(v) => (draft.talkgroupId = v)}
						/>
						<p class="text-xs text-muted-foreground">Talkgroup the ingested calls belong to.</p>
						{#if errors.talkgroupId}<p class="text-xs text-destructive">{errors.talkgroupId}</p>{/if}
					</div>
					{#if siteOptions.length > 0}
						<div class="flex flex-col gap-1.5">
							<Label for="dw-site">Site</Label>
							<SearchableSelect
								id="dw-site"
								options={siteOptions}
								value={draft.siteId}
								placeholder="Optional"
								searchPlaceholder="Search sites"
								onchange={(v) => (draft.siteId = v)}
							/>
						</div>
					{/if}
				</div>
			{/if}

			{#if dirwatchShows(type, 'mask')}
				<div class="flex flex-col gap-1.5">
					<Label for="dw-mask">Mask</Label>
					<Input
						id="dw-mask"
						class="font-mono text-sm"
						placeholder="cymx_#TG_#DATE_#TIME_#HZ"
						autocomplete="off"
						aria-invalid={!!errors.mask}
						value={draft.mask ?? ''}
						oninput={(e: Event) => (draft.mask = (e.currentTarget as HTMLInputElement).value)}
					/>
					<p class="text-xs text-muted-foreground">
						Metadata is extracted from the file name using meta tags. #SYS and #TG in the mask replace the System and Talkgroup selections.
					</p>
					{#if errors.mask}<p class="text-xs text-destructive">{errors.mask}</p>{/if}
					<Collapsible.Root>
						<Collapsible.Trigger
							class="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-90"
						>
							<ChevronRight class="size-3.5 transition-transform duration-200" />
							Available meta tags
						</Collapsible.Trigger>
						<Collapsible.Content>
							<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-muted/40 p-3 text-xs">
								{#each MASK_TAGS as tag (tag.tag)}
									<dt class="font-mono font-medium">{tag.tag}</dt>
									<dd class="text-muted-foreground">{tag.description}</dd>
								{/each}
							</dl>
						</Collapsible.Content>
					</Collapsible.Root>
				</div>
			{/if}

			{#if dirwatchShows(type, 'frequency')}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<Label for="dw-frequency">Frequency (Hz)</Label>
						<Input
							id="dw-frequency"
							type="number"
							min={1}
							class="font-mono text-sm"
							placeholder="Optional"
							aria-invalid={!!errors.frequency}
							value={draft.frequency ?? ''}
							onchange={(e: Event) => (draft.frequency = numberOrUndefined(e))}
						/>
						<p class="text-xs text-muted-foreground">Fake frequency shown on the main screen for ingested calls.</p>
						{#if errors.frequency}<p class="text-xs text-destructive">{errors.frequency}</p>{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="dw-delay">Delay (ms)</Label>
						<Input
							id="dw-delay"
							type="number"
							min={DIRWATCH_MIN_DELAY}
							step={500}
							class="font-mono text-sm"
							aria-invalid={!!errors.delay}
							value={draft.delay ?? DIRWATCH_MIN_DELAY}
							onchange={(e: Event) => (draft.delay = numberOrUndefined(e) ?? DIRWATCH_MIN_DELAY)}
						/>
						<p class="text-xs text-muted-foreground">Time for a new file to settle before it is ingested. Minimum {DIRWATCH_MIN_DELAY} ms.</p>
						{#if errors.delay}<p class="text-xs text-destructive">{errors.delay}</p>{/if}
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Footer class="border-t border-border px-6 py-4">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={submit}>{isNew ? 'Add to list' : 'Apply'}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
