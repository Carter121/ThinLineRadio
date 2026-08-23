<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Save from '@lucide/svelte/icons/save';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { SystemPatch } from './systems-api.ts';
	import { SYSTEM_TYPES, systemTypeLabel, type AdminSystemFull } from './systems-types.ts';
	import MultiSelect from './MultiSelect.svelte';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
	}

	let { page, system }: Props = $props();

	//* Editable copy of the system-level fields (child lists are edited elsewhere).
	interface FormModel {
		label: string;
		systemRef: number;
		type: string;
		delay: number;
		retentionDays: number;
		blacklists: string;
		transcriptionPrompt: string;
		autoPopulate: boolean;
		autoPopulateAlertsEnabled: boolean;
		autoPopulateUnits: boolean;
		alertsEnabled: boolean;
		duplicateDetectionEnabled: boolean;
		autoLearnToneSets: boolean;
		autoLearnToneSetsTagIds: number[];
		autoLearnToneSetsAutoOffDays: number;
		autoLearnUnitAliases: boolean;
		autoLearnUnitAliasesTagIds: number[];
		autoLearnUnitAliasesAutoOffDays: number;
		bulkToneDetectionEnabled: boolean;
		bulkToneDetectionTagIds: number[];
	}

	function fromSystem(s: AdminSystemFull): FormModel {
		return {
			label: s.label ?? '',
			systemRef: s.systemRef ?? 0,
			type: s.type ?? '',
			delay: s.delay ?? 0,
			retentionDays: s.retentionDays ?? 0,
			blacklists: s.blacklists ?? '',
			transcriptionPrompt: s.transcriptionPrompt ?? '',
			autoPopulate: !!s.autoPopulate,
			autoPopulateAlertsEnabled: s.autoPopulateAlertsEnabled ?? true,
			autoPopulateUnits: !!s.autoPopulateUnits,
			alertsEnabled: s.alertsEnabled ?? true,
			duplicateDetectionEnabled: s.duplicateDetectionEnabled ?? true,
			autoLearnToneSets: !!s.autoLearnToneSets,
			autoLearnToneSetsTagIds: [...(s.autoLearnToneSetsTagIds ?? [])],
			autoLearnToneSetsAutoOffDays: s.autoLearnToneSetsAutoOffDays ?? 0,
			autoLearnUnitAliases: !!s.autoLearnUnitAliases,
			autoLearnUnitAliasesTagIds: [...(s.autoLearnUnitAliasesTagIds ?? [])],
			autoLearnUnitAliasesAutoOffDays: s.autoLearnUnitAliasesAutoOffDays ?? 0,
			bulkToneDetectionEnabled: !!s.bulkToneDetectionEnabled,
			bulkToneDetectionTagIds: [...(s.bulkToneDetectionTagIds ?? [])]
		};
	}

	let form = $state<FormModel>(fromSystem(system));
	let baseline = $state(JSON.stringify(fromSystem(system)));
	let saving = $state(false);

	const dirty = $derived(JSON.stringify(form) !== baseline);

	//* Adopt server pushes only while the form is clean so in-progress edits survive.
	$effect(() => {
		const fresh = fromSystem(system);
		const serialized = JSON.stringify(fresh);
		if (serialized !== baseline && !dirty) {
			form = fresh;
			baseline = serialized;
		}
	});

	//* Tags actually used by this system's talkgroups (the rollout selectors only offer those).
	const usedTags = $derived.by(() => {
		const ids = new Set(system.talkgroups.map((tg) => tg.tagId).filter((id): id is number => !!id));
		return page.tags.filter((tag) => ids.has(tag.id));
	});

	const blacklistsValid = $derived(/^\s*(\d+\s*(,\s*\d+\s*)*)?$/.test(form.blacklists));

	const talkgroupsUsingTags = (tagIds: number[]) => system.talkgroups.filter((tg) => tg.tagId && tagIds.includes(tg.tagId)).length;

	function expiresLabel(expiresAt: number | undefined): string {
		if (!expiresAt) return '';
		return `Auto-off scheduled for ${new Date(expiresAt).toLocaleString()}`;
	}

	function reset() {
		form = fromSystem(system);
		baseline = JSON.stringify(form);
	}

	function num(event: Event, field: keyof FormModel, min = 0) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		(form as unknown as Record<string, unknown>)[field] = Number.isFinite(value) && value >= min ? Math.floor(value) : min;
	}

	async function save() {
		if (!form.label.trim()) return toast.error('Label is required');
		if (!Number.isInteger(form.systemRef) || form.systemRef < 1) return toast.error('System ID must be a positive integer');
		if (page.systems.some((s) => s.id !== system.id && s.systemRef === form.systemRef)) return toast.error(`System ID ${form.systemRef} is already used`);
		if (!blacklistsValid) return toast.error('Blacklists must be a comma-separated list of talkgroup IDs');

		//* Only send what changed; the server merges the patch into the stored system.
		const before = JSON.parse(baseline) as FormModel;
		const patch: SystemPatch = {};
		for (const key of Object.keys(form) as (keyof FormModel)[]) {
			if (JSON.stringify(form[key]) !== JSON.stringify(before[key])) {
				(patch as Record<string, unknown>)[key] = key === 'blacklists' ? form.blacklists.replace(/\s+/g, '') : form[key];
			}
		}
		if (Object.keys(patch).length === 0) return;

		saving = true;
		try {
			const summary = await page.api.patchSystem(system.id, patch);
			page.applySystemSummary(summary);
			baseline = JSON.stringify(form);
			toast.success('System settings saved');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save system');
		} finally {
			saving = false;
		}
	}
</script>

{#snippet toggle(label: string, hint: string, checked: boolean, onchange: (v: boolean) => void)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="text-sm font-medium">{label}</p>
			<p class="text-xs text-muted-foreground">{hint}</p>
		</div>
		<Switch {checked} onCheckedChange={onchange} />
	</div>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex items-center justify-end gap-2">
		{#if dirty}
			<span class="text-xs text-muted-foreground">Unsaved changes</span>
			<Button variant="ghost" size="sm" onclick={reset}>
				<RotateCcw data-icon="inline-start" />
				Discard
			</Button>
		{/if}
		<Button size="sm" onclick={save} disabled={!dirty || saving}>
			<Save data-icon="inline-start" />
			{saving ? 'Saving' : 'Save settings'}
		</Button>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<Card class="gap-0 py-0">
			<CardHeader class="px-4 pt-3 pb-2">
				<CardTitle class="text-sm">Identity</CardTitle>
			</CardHeader>
			<CardContent class="grid gap-3 px-4 pt-0 pb-4 sm:grid-cols-2">
				<div class="grid gap-1.5 sm:col-span-2">
					<Label for="sys-label">Label</Label>
					<Input id="sys-label" bind:value={form.label} />
				</div>
				<div class="grid gap-1.5">
					<Label for="sys-ref">System ID</Label>
					<Input id="sys-ref" type="number" min="1" step="1" value={form.systemRef} oninput={(e) => num(e, 'systemRef', 1)} />
				</div>
				<div class="grid gap-1.5">
					<Label>Type</Label>
					<Select type="single" value={form.type} onValueChange={(v) => (form.type = v)}>
						<SelectTrigger class="w-full">{systemTypeLabel(form.type)}</SelectTrigger>
						<SelectContent>
							{#each SYSTEM_TYPES as option (option.value)}
								<SelectItem value={option.value} label={option.label} />
							{/each}
						</SelectContent>
					</Select>
				</div>
				<div class="grid gap-1.5">
					<Label for="sys-delay">Delay (minutes)</Label>
					<Input id="sys-delay" type="number" min="0" step="1" value={form.delay} oninput={(e) => num(e, 'delay')} />
				</div>
				<div class="grid gap-1.5">
					<Label for="sys-retention">Retention (days)</Label>
					<Input id="sys-retention" type="number" min="0" step="1" value={form.retentionDays} oninput={(e) => num(e, 'retentionDays')} />
					<p class="text-xs text-muted-foreground">0 uses the global prune setting.</p>
				</div>
				<div class="grid gap-1.5 sm:col-span-2">
					<Label for="sys-blacklists">Blacklists</Label>
					<Input id="sys-blacklists" bind:value={form.blacklists} placeholder="Comma-separated talkgroup IDs to ignore" aria-invalid={!blacklistsValid} />
					{#if !blacklistsValid}
						<p class="text-xs text-destructive">Comma-separated list of talkgroup IDs.</p>
					{/if}
				</div>
				<div class="grid gap-1.5 sm:col-span-2">
					<Label for="sys-prompt">Transcription prompt</Label>
					<Textarea id="sys-prompt" bind:value={form.transcriptionPrompt} rows={2} placeholder="e.g. Engine 4 Ladder 2 Station 12 Code 3 dispatch" />
					<p class="text-xs text-muted-foreground">Overrides the global prompt for this system. Talkgroups can override it again.</p>
				</div>
			</CardContent>
		</Card>

		<Card class="gap-0 py-0">
			<CardHeader class="px-4 pt-3 pb-2">
				<CardTitle class="text-sm">Behavior</CardTitle>
			</CardHeader>
			<CardContent class="grid gap-3 px-4 pt-0 pb-4">
				{@render toggle('Alerts enabled', 'Allow alerts and transcription for this system. Disabling deletes user alert preferences on save.', form.alertsEnabled, (v) => (form.alertsEnabled = v))}
				{@render toggle('Duplicate detection', 'Suppress duplicate calls on this system when global duplicate detection is on.', form.duplicateDetectionEnabled, (v) => (form.duplicateDetectionEnabled = v))}
				{@render toggle('Auto-populate talkgroups', 'Create unconfigured talkgroups automatically when audio arrives.', form.autoPopulate, (v) => (form.autoPopulate = v))}
				{#if form.autoPopulate}
					{@render toggle('Auto-populated talkgroups start with alerts on', 'New talkgroups get alerts enabled; change each later as needed.', form.autoPopulateAlertsEnabled, (v) => (form.autoPopulateAlertsEnabled = v))}
				{/if}
				{@render toggle('Auto-populate units', 'Add heard unit IDs and labels to this system\'s unit list.', form.autoPopulateUnits, (v) => (form.autoPopulateUnits = v))}
			</CardContent>
		</Card>

		<Card class="gap-0 py-0 xl:col-span-2">
			<CardHeader class="px-4 pt-3 pb-2">
				<CardTitle class="text-sm">Tag-based rollouts</CardTitle>
			</CardHeader>
			<CardContent class="grid gap-4 px-4 pt-0 pb-4 lg:grid-cols-3">
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<p class="text-sm font-medium">Auto-learn tone sets</p>
						<Switch checked={form.autoLearnToneSets} onCheckedChange={(v) => (form.autoLearnToneSets = v)} />
					</div>
					{#if form.autoLearnToneSets}
						<MultiSelect items={usedTags} placeholder="Select tags" value={form.autoLearnToneSetsTagIds} onchange={(ids) => (form.autoLearnToneSetsTagIds = ids)} />
						<p class="text-xs text-muted-foreground">{talkgroupsUsingTags(form.autoLearnToneSetsTagIds)} talkgroups affected</p>
						<div class="grid gap-1.5">
							<Label for="sys-tone-off">Auto-off after (days)</Label>
							<Input id="sys-tone-off" type="number" min="0" step="1" value={form.autoLearnToneSetsAutoOffDays} oninput={(e) => num(e, 'autoLearnToneSetsAutoOffDays')} placeholder="0 = never" />
						</div>
						{#if system.autoLearnToneSetsExpiresAt}
							<p class="text-xs text-muted-foreground">{expiresLabel(system.autoLearnToneSetsExpiresAt)}</p>
						{/if}
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<p class="text-sm font-medium">Auto-learn unit aliases</p>
						<Switch checked={form.autoLearnUnitAliases} onCheckedChange={(v) => (form.autoLearnUnitAliases = v)} />
					</div>
					{#if form.autoLearnUnitAliases}
						<MultiSelect items={usedTags} placeholder="Select tags" value={form.autoLearnUnitAliasesTagIds} onchange={(ids) => (form.autoLearnUnitAliasesTagIds = ids)} />
						<p class="text-xs text-muted-foreground">{talkgroupsUsingTags(form.autoLearnUnitAliasesTagIds)} talkgroups affected</p>
						<div class="grid gap-1.5">
							<Label for="sys-alias-off">Auto-off after (days)</Label>
							<Input id="sys-alias-off" type="number" min="0" step="1" value={form.autoLearnUnitAliasesAutoOffDays} oninput={(e) => num(e, 'autoLearnUnitAliasesAutoOffDays')} placeholder="0 = never" />
						</div>
						{#if system.autoLearnUnitAliasesExpiresAt}
							<p class="text-xs text-muted-foreground">{expiresLabel(system.autoLearnUnitAliasesExpiresAt)}</p>
						{/if}
					{/if}
				</div>
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<p class="text-sm font-medium">Bulk tone detection</p>
						<Switch checked={form.bulkToneDetectionEnabled} onCheckedChange={(v) => (form.bulkToneDetectionEnabled = v)} />
					</div>
					{#if form.bulkToneDetectionEnabled}
						<MultiSelect items={usedTags} placeholder="Select tags" value={form.bulkToneDetectionTagIds} onchange={(ids) => (form.bulkToneDetectionTagIds = ids)} />
						<p class="text-xs text-muted-foreground">Enables tone detection on {talkgroupsUsingTags(form.bulkToneDetectionTagIds)} talkgroups when saved.</p>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground lg:col-span-3">Rollouts apply to talkgroups with the selected tags when you save. Only tags used by this system are offered.</p>
			</CardContent>
		</Card>
	</div>
</div>
