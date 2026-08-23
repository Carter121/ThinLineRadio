<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { SystemsPageState } from './SystemsPageState.svelte.ts';
	import type { TalkgroupPatch } from './systems-api.ts';
	import { SYSTEM_TYPES, systemTypeLabel, type AdminSystemFull, type AdminTalkgroup, type AdminToneSet } from './systems-types.ts';
	import MultiSelect from './MultiSelect.svelte';
	import ToneSetsEditor from './ToneSetsEditor.svelte';

	interface Props {
		page: SystemsPageState;
		system: AdminSystemFull;
		//* null creates a new talkgroup.
		talkgroup: AdminTalkgroup | null;
		open: boolean;
	}

	let { page, system, talkgroup, open = $bindable() }: Props = $props();

	interface FormModel {
		talkgroupRef: number;
		label: string;
		name: string;
		type: string;
		tagId: number;
		groupIds: number[];
		delay: number;
		frequency: number;
		retentionDays: number;
		alertCooldownSeconds: number;
		transcriptionPrompt: string;
		linkedVoiceTalkgroupRef: number;
		linkedVoiceWindowSeconds: number;
		linkedVoiceMinDurationSeconds: number;
		alertsEnabled: boolean;
		alertingTalkgroup: boolean;
		toneDetectionEnabled: boolean;
		autoLearnToneSets: boolean;
		autoLearnUnitAliases: boolean;
		toneDownstreamEnabled: boolean;
		toneDownstreamURL: string;
		toneDownstreamAPIKey: string;
		toneSets: AdminToneSet[];
	}

	function fromTalkgroup(tg: AdminTalkgroup | null): FormModel {
		const firstTag = page.tags[0]?.id ?? 0;
		return {
			talkgroupRef: tg?.talkgroupRef ?? 0,
			label: tg?.label ?? '',
			name: tg?.name ?? '',
			type: tg?.type ?? '',
			tagId: tg?.tagId ?? firstTag,
			groupIds: [...(tg?.groupIds ?? [])],
			delay: tg?.delay ?? 0,
			frequency: tg?.frequency ?? 0,
			retentionDays: tg?.retentionDays ?? 0,
			alertCooldownSeconds: tg?.alertCooldownSeconds ?? 0,
			transcriptionPrompt: tg?.transcriptionPrompt ?? '',
			linkedVoiceTalkgroupRef: tg?.linkedVoiceTalkgroupRef ?? 0,
			linkedVoiceWindowSeconds: tg?.linkedVoiceWindowSeconds ?? 0,
			linkedVoiceMinDurationSeconds: tg?.linkedVoiceMinDurationSeconds ?? 0,
			alertsEnabled: tg?.alertsEnabled ?? true,
			alertingTalkgroup: tg?.alertingTalkgroup ?? false,
			toneDetectionEnabled: tg?.toneDetectionEnabled ?? false,
			autoLearnToneSets: tg?.autoLearnToneSets ?? false,
			autoLearnUnitAliases: tg?.autoLearnUnitAliases ?? false,
			toneDownstreamEnabled: tg?.toneDownstreamEnabled ?? false,
			toneDownstreamURL: tg?.toneDownstreamURL ?? '',
			toneDownstreamAPIKey: tg?.toneDownstreamAPIKey ?? '',
			toneSets: (tg?.toneSets ?? []).map((set) => ({ ...set }))
		};
	}

	let form = $state<FormModel>(fromTalkgroup(talkgroup));
	const baseline = JSON.stringify(fromTalkgroup(talkgroup));
	const dirty = $derived(JSON.stringify(form) !== baseline);
	let saving = $state(false);

	const isNew = $derived(talkgroup === null);
	const tagLabel = $derived(form.tagId ? (page.tagLabels.get(form.tagId) ?? `Tag ${form.tagId}`) : 'Select tag');

	function num(event: Event, field: keyof FormModel, min = 0) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		(form as unknown as Record<string, unknown>)[field] = Number.isFinite(value) && value >= min ? Math.floor(value) : min;
	}

	function validate(): string | null {
		if (!Number.isInteger(form.talkgroupRef) || form.talkgroupRef < 1) return 'Talkgroup ID must be a positive integer';
		if (!form.label.trim()) return 'Label is required';
		if (system.talkgroups.some((tg) => tg.id !== talkgroup?.id && tg.talkgroupRef === form.talkgroupRef))
			return `Talkgroup ID ${form.talkgroupRef} is already used in this system`;
		if (form.toneDownstreamEnabled && !form.toneDownstreamURL.trim()) return 'Destination URL is required when forwarding tones';
		return null;
	}

	async function save() {
		const error = validate();
		if (error) return toast.error(error);
		saving = true;
		try {
			//* Edits send only changed keys; creates send the whole form.
			const before = JSON.parse(baseline) as FormModel;
			const patch: TalkgroupPatch = {};
			for (const key of Object.keys(form) as (keyof FormModel)[]) {
				if (isNew || JSON.stringify(form[key]) !== JSON.stringify(before[key])) {
					(patch as Record<string, unknown>)[key] = form[key];
				}
			}
			if (patch.label !== undefined) patch.label = patch.label.trim();
			if (patch.name !== undefined) patch.name = patch.name.trim();
			const saved = isNew ? await page.api.createTalkgroup(system.id, patch) : await page.api.patchTalkgroup(system.id, talkgroup!.id, patch);
			page.applyTalkgroup(system.id, saved);
			toast.success(isNew ? `Added talkgroup ${saved.label}` : `Saved ${saved.label}`);
			open = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save talkgroup');
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open>
	<DialogContent class="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-3xl">
		<DialogHeader class="border-b border-border px-6 py-4">
			<DialogTitle>{isNew ? 'Add talkgroup' : `Edit ${talkgroup?.label}`}</DialogTitle>
			<DialogDescription
				>{isNew
					? `New talkgroup in ${system.label}.`
					: `Talkgroup ${talkgroup?.talkgroupRef} in ${system.label}. Only changed fields are sent.`}</DialogDescription
			>
		</DialogHeader>

		<div class="flex-1 overflow-y-auto px-6 py-4">
			<div class="grid gap-4">
				<section class="grid gap-3 sm:grid-cols-2">
					<div class="grid gap-1.5">
						<Label for="tg-ref">Talkgroup ID</Label>
						<Input id="tg-ref" type="number" min="1" step="1" value={form.talkgroupRef || ''} oninput={(e) => num(e, 'talkgroupRef', 0)} />
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
						<Label for="tg-label">Label</Label>
						<Input id="tg-label" bind:value={form.label} placeholder="Shown on buttons and the call list" />
					</div>
					<div class="grid gap-1.5">
						<Label for="tg-name">Name</Label>
						<Input id="tg-name" bind:value={form.name} placeholder="Longer description" />
					</div>
					<div class="grid gap-1.5">
						<Label>Tag</Label>
						<Select type="single" value={String(form.tagId || '')} onValueChange={(v) => (form.tagId = Number(v))}>
							<SelectTrigger class="w-full">{tagLabel}</SelectTrigger>
							<SelectContent>
								{#each page.tags as tag (tag.id)}
									<SelectItem value={String(tag.id)} label={tag.label} />
								{/each}
							</SelectContent>
						</Select>
					</div>
					<div class="grid gap-1.5">
						<Label>Groups</Label>
						<MultiSelect
							items={page.groups}
							value={form.groupIds}
							onchange={(ids) => {
								form.groupIds = ids;
							}}
							placeholder="Select groups"
						/>
					</div>
				</section>

				<section class="grid gap-3 sm:grid-cols-4">
					<div class="grid gap-1.5">
						<Label for="tg-delay">Delay (min)</Label>
						<Input id="tg-delay" type="number" min="0" step="1" value={form.delay} oninput={(e) => num(e, 'delay')} />
					</div>
					<div class="grid gap-1.5">
						<Label for="tg-freq">Frequency (Hz)</Label>
						<Input id="tg-freq" type="number" min="0" step="1" value={form.frequency || ''} oninput={(e) => num(e, 'frequency')} />
					</div>
					<div class="grid gap-1.5">
						<Label for="tg-retention">Retention (days)</Label>
						<Input
							id="tg-retention"
							type="number"
							min="0"
							step="1"
							value={form.retentionDays || ''}
							oninput={(e) => num(e, 'retentionDays')}
							placeholder="System/global"
						/>
					</div>
					<div class="grid gap-1.5">
						<Label for="tg-cooldown">Alert cooldown (s)</Label>
						<Input
							id="tg-cooldown"
							type="number"
							min="0"
							step="1"
							value={form.alertCooldownSeconds || ''}
							oninput={(e) => num(e, 'alertCooldownSeconds')}
							placeholder="0 = off"
						/>
					</div>
					<div class="grid gap-1.5 sm:col-span-4">
						<Label for="tg-prompt">Transcription prompt</Label>
						<Textarea
							id="tg-prompt"
							bind:value={form.transcriptionPrompt}
							rows={2}
							placeholder="Overrides the system and global prompt for this talkgroup"
						/>
					</div>
				</section>

				<section class="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2">
					{#snippet toggle(label: string, hint: string, checked: boolean, onchange: (v: boolean) => void)}
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="text-sm font-medium">{label}</p>
								<p class="text-xs text-muted-foreground">{hint}</p>
							</div>
							<Switch {checked} onCheckedChange={onchange} />
						</div>
					{/snippet}
					{@render toggle(
						'Alerts enabled',
						'Allow alerts and transcription. Disabling deletes user alert preferences for this talkgroup.',
						form.alertsEnabled,
						(v) => (form.alertsEnabled = v)
					)}
					{@render toggle(
						'Alerting talkgroup',
						'Always transcribe and alert on voice, without tone or keyword matching.',
						form.alertingTalkgroup,
						(v) => (form.alertingTalkgroup = v)
					)}
					{@render toggle(
						'Tone detection',
						'Detect two-tone and long-tone pages on this talkgroup.',
						form.toneDetectionEnabled,
						(v) => (form.toneDetectionEnabled = v)
					)}
					{@render toggle(
						'Auto-learn tone sets',
						'Observe paging patterns and propose tone sets for review.',
						form.autoLearnToneSets,
						(v) => (form.autoLearnToneSets = v)
					)}
					{@render toggle(
						'Auto-learn unit aliases',
						'Learn radio unit ID to label mappings from this channel.',
						form.autoLearnUnitAliases,
						(v) => (form.autoLearnUnitAliases = v)
					)}
				</section>

				<section class="grid gap-3 sm:grid-cols-3">
					<div class="grid gap-1.5">
						<Label for="tg-linked">Linked voice talkgroup ID</Label>
						<Input
							id="tg-linked"
							type="number"
							min="0"
							step="1"
							value={form.linkedVoiceTalkgroupRef || ''}
							oninput={(e) => num(e, 'linkedVoiceTalkgroupRef')}
							placeholder="0 = off"
						/>
						<p class="text-xs text-muted-foreground">After tones here, also watch this talkgroup for the voice dispatch.</p>
					</div>
					{#if form.linkedVoiceTalkgroupRef > 0}
						<div class="grid gap-1.5">
							<Label for="tg-linked-window">Voice window (s)</Label>
							<Input
								id="tg-linked-window"
								type="number"
								min="0"
								step="1"
								value={form.linkedVoiceWindowSeconds || ''}
								oninput={(e) => num(e, 'linkedVoiceWindowSeconds')}
								placeholder="30"
							/>
						</div>
						<div class="grid gap-1.5">
							<Label for="tg-linked-min">Min voice duration (s)</Label>
							<Input
								id="tg-linked-min"
								type="number"
								min="0"
								step="1"
								value={form.linkedVoiceMinDurationSeconds || ''}
								oninput={(e) => num(e, 'linkedVoiceMinDurationSeconds')}
								placeholder="0"
							/>
						</div>
					{/if}
				</section>

				{#if form.toneDetectionEnabled}
					<section class="grid gap-3">
						<div class="flex items-center justify-between gap-3 rounded-md border border-border p-3">
							<div>
								<p class="text-sm font-medium">Forward all tone sets to TonesToActive</p>
								<p class="text-xs text-muted-foreground">Per-channel forwarding; individual tone sets can forward on their own below.</p>
							</div>
							<Switch checked={form.toneDownstreamEnabled} onCheckedChange={(v) => (form.toneDownstreamEnabled = v)} />
						</div>
						{#if form.toneDownstreamEnabled}
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="grid gap-1.5">
									<Label for="tg-ds-url">Destination URL</Label>
									<Input id="tg-ds-url" bind:value={form.toneDownstreamURL} placeholder="https://host/api/tone-alert" />
								</div>
								<div class="grid gap-1.5">
									<Label for="tg-ds-key">API key</Label>
									<Input id="tg-ds-key" bind:value={form.toneDownstreamAPIKey} autocomplete="new-password" />
								</div>
							</div>
						{/if}
						<div>
							<p class="mb-2 text-sm font-medium">Tone sets</p>
							<ToneSetsEditor
								value={form.toneSets}
								onchange={(sets) => {
									form.toneSets = sets;
								}}
							/>
						</div>
					</section>
				{/if}
			</div>
		</div>

		<DialogFooter class="border-t border-border px-6 py-3">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={save} disabled={saving || (!isNew && !dirty)}>{saving ? 'Saving' : isNew ? 'Add talkgroup' : 'Save changes'}</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
