<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import BrandingImages from './BrandingImages.svelte';
	import OptionField from './OptionField.svelte';
	import SystemOverridesTable from './SystemOverridesTable.svelte';
	import { OPTION_PANELS, buildPatch, getOptionValue, toDraftValue, toWireValue, type OptionFieldSpec, type OptionPanelSpec } from './options-spec.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	//* Draft and baseline are keyed by dot-path; a field is dirty when they differ.
	let draft = $state<Record<string, unknown>>({});
	let baseline: Record<string, unknown> = {};
	let savingPanel = $state<string | null>(null);
	let testEmailAddress = $state('');
	let sendingTestEmail = $state(false);

	//* Sync from every incoming config document (initial load, websocket pushes,
	//* save responses), preserving unsaved local edits.
	$effect(() => {
		const options = session.options;
		if (!options) return;
		untrack(() => {
			const nextBaseline: Record<string, unknown> = {};
			for (const panel of OPTION_PANELS) {
				for (const field of panel.fields) {
					nextBaseline[field.key] = toDraftValue(field, getOptionValue(options, field.key));
				}
			}
			for (const [key, value] of Object.entries(nextBaseline)) {
				if (!(key in draft) || draft[key] === baseline[key]) draft[key] = value;
			}
			baseline = nextBaseline;
		});
	});

	function isDirty(field: OptionFieldSpec): boolean {
		return field.type !== 'toggle' && draft[field.key] !== baseline[field.key];
	}

	function visibleFields(panel: OptionPanelSpec): OptionFieldSpec[] {
		return panel.fields.filter((field) => !field.showIf || field.showIf(draft));
	}

	function dirtyFields(panel: OptionPanelSpec): OptionFieldSpec[] {
		return visibleFields(panel).filter(isDirty);
	}

	//* Toggles save immediately with a single-key patch (like the old admin).
	async function handleToggle(field: OptionFieldSpec, checked: boolean) {
		const previous = draft[field.key];
		draft[field.key] = checked;
		const entries: Record<string, unknown> = { [field.key]: checked };
		//* The flat transcription toggle is mirrored into transcriptionConfig.enabled.
		if (field.key === 'transcriptionEnabled') entries['transcriptionConfig.enabled'] = checked;
		try {
			await session.saveOptions(buildPatch(entries));
		} catch (error) {
			draft[field.key] = previous;
			toast.error(error instanceof Error ? error.message : `Failed to save ${field.label}`);
		}
	}

	async function savePanel(panel: OptionPanelSpec) {
		const fields = dirtyFields(panel);
		if (fields.length === 0) return;
		savingPanel = panel.id;
		const entries: Record<string, unknown> = {};
		for (const field of fields) entries[field.key] = toWireValue(field, draft[field.key]);
		try {
			await session.saveOptions(buildPatch(entries));
			toast.success(`${panel.label} saved`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to save ${panel.label}`);
		} finally {
			savingPanel = null;
		}
	}

	async function sendTestEmail() {
		if (!testEmailAddress) return;
		sendingTestEmail = true;
		try {
			const result = await session.client.emailTest(testEmailAddress);
			if (result?.error) toast.error(result.error);
			else toast.success(result?.message ?? 'Test email sent');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send test email');
		} finally {
			sendingTestEmail = false;
		}
	}
</script>

<div class="space-y-3">
	{#each OPTION_PANELS as panel (panel.id)}
		{@const dirty = dirtyFields(panel)}
		<Card class="gap-0 py-0">
			<Collapsible.Root>
				<div class="flex items-center gap-2 px-4 py-3">
					<Collapsible.Trigger class="flex flex-1 cursor-pointer items-center gap-2 text-base font-medium [&[data-state=open]>svg]:rotate-90">
						<ChevronRight class="size-4 shrink-0 transition-transform duration-200" />
						{panel.label}
						{#if dirty.length > 0}
							<span class="text-xs font-normal text-primary">{dirty.length} unsaved</span>
						{/if}
					</Collapsible.Trigger>
					{#if dirty.length > 0}
						<Button size="sm" class="h-8 gap-1.5" disabled={savingPanel === panel.id} onclick={() => savePanel(panel)}>
							{#if savingPanel === panel.id}
								<Loader2 class="size-3.5 animate-spin" />
							{:else}
								<Save class="size-3.5" />
							{/if}
							Save
						</Button>
					{/if}
				</div>

				<Collapsible.Content>
					<CardContent class="space-y-4 px-4 pt-0 pb-4">
						{#if panel.description}
							<p class="text-xs text-muted-foreground">{panel.description}</p>
						{/if}

						<div class="grid gap-4 sm:grid-cols-2">
							{#each visibleFields(panel) as field (field.key)}
								<OptionField
									{field}
									value={draft[field.key]}
									dirty={isDirty(field)}
									onchange={(value) => {
										if (field.type === 'toggle') void handleToggle(field, value === true);
										else draft[field.key] = value;
									}}
								/>
							{/each}
						</div>

						{#if panel.id === 'branding'}
							<BrandingImages {session} />
						{/if}

						{#if panel.id === 'email' && draft['emailServiceEnabled'] === true}
							<div class="flex items-end gap-2 border-t border-border pt-3">
								<div class="max-w-xs flex-1 space-y-1.5">
									<label for="admin-test-email" class="text-sm font-medium">Send a test email</label>
									<Input id="admin-test-email" type="email" placeholder="you@example.com" bind:value={testEmailAddress} />
								</div>
								<Button variant="outline" size="sm" class="gap-1.5" disabled={sendingTestEmail || !testEmailAddress} onclick={sendTestEmail}>
									{#if sendingTestEmail}
										<Loader2 class="size-3.5 animate-spin" />
									{:else}
										<Send class="size-3.5" />
									{/if}
									Send
								</Button>
							</div>
						{/if}
					</CardContent>
				</Collapsible.Content>
			</Collapsible.Root>
		</Card>
	{/each}

	<SystemOverridesTable {session} />
</div>
