<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import BrandingImages from './BrandingImages.svelte';
	import OptionField from './OptionField.svelte';
	import { OPTION_PANELS, buildPatch, getOptionValue, toDraftValue, toWireValue, type OptionFieldSpec } from './options-spec.ts';

	interface Props {
		session: AdminSessionState;
		//* Which options panel this page renders (an OPTION_PANELS id).
		panelId?: string;
	}

	let { session, panelId }: Props = $props();

	const panel = $derived(OPTION_PANELS.find((p) => p.id === panelId) ?? OPTION_PANELS[0]);

	//* Draft and baseline are keyed by dot-path; a field is dirty when they differ.
	let draft = $state<Record<string, unknown>>({});
	let baseline: Record<string, unknown> = {};
	let saving = $state(false);
	let testEmailAddress = $state('');
	let sendingTestEmail = $state(false);

	//* Sync from every incoming config document (initial load, websocket pushes,
	//* save responses), preserving unsaved local edits.
	$effect(() => {
		const options = session.options;
		const fields = panel.fields;
		if (!options) return;
		untrack(() => {
			const nextBaseline: Record<string, unknown> = {};
			for (const field of fields) {
				nextBaseline[field.key] = toDraftValue(field, getOptionValue(options, field.key));
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

	const visibleFields = $derived(panel.fields.filter((field) => !field.showIf || field.showIf(draft)));
	const dirtyFields = $derived(visibleFields.filter(isDirty));

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

	async function savePanel() {
		if (dirtyFields.length === 0) return;
		saving = true;
		const entries: Record<string, unknown> = {};
		for (const field of dirtyFields) entries[field.key] = toWireValue(field, draft[field.key]);
		try {
			await session.saveOptions(buildPatch(entries));
			toast.success(`${panel.label} saved`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to save ${panel.label}`);
		} finally {
			saving = false;
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

	//* Toggles render first so master switches sit at the top of the page; the
	//* grid otherwise keeps spec order.
	const toggleFields = $derived(visibleFields.filter((field) => field.type === 'toggle'));
	const inputFields = $derived(visibleFields.filter((field) => field.type !== 'toggle'));
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">{panel.label}</h2>
			{#if panel.description}
				<p class="text-sm text-muted-foreground">{panel.description}</p>
			{/if}
		</div>
		{#if dirtyFields.length > 0}
			<div class="flex items-center gap-3">
				<span class="text-sm text-muted-foreground">{dirtyFields.length} unsaved {dirtyFields.length === 1 ? 'change' : 'changes'}</span>
				<Button size="sm" disabled={saving} onclick={savePanel}>
					{#if saving}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Save data-icon="inline-start" />
					{/if}
					Save
				</Button>
			</div>
		{/if}
	</div>

	{#if toggleFields.length > 0}
		<Card class="py-0">
			<CardContent class="grid gap-x-10 gap-y-4 px-5 py-4 md:grid-cols-2 2xl:grid-cols-3">
				{#each toggleFields as field (field.key)}
					<OptionField {field} value={draft[field.key]} dirty={false} onchange={(value) => void handleToggle(field, value === true)} />
				{/each}
			</CardContent>
		</Card>
	{/if}

	{#if inputFields.length > 0}
		<Card class="py-0">
			<CardContent class="grid items-start gap-x-10 gap-y-5 px-5 py-5 md:grid-cols-2 2xl:grid-cols-3">
				{#each inputFields as field (field.key)}
					<OptionField {field} value={draft[field.key]} dirty={isDirty(field)} onchange={(value) => (draft[field.key] = value)} />
				{/each}
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'branding'}
		<Card class="py-0">
			<CardContent class="px-5 py-4">
				<BrandingImages {session} />
			</CardContent>
		</Card>
	{/if}

	{#if panel.id === 'email' && draft['emailServiceEnabled'] === true}
		<Card class="py-0">
			<CardContent class="flex items-end gap-2 px-5 py-4">
				<div class="max-w-xs flex-1 flex flex-col gap-1.5">
					<label for="admin-test-email" class="text-sm font-medium">Send a test email</label>
					<Input id="admin-test-email" type="email" placeholder="you@example.com" bind:value={testEmailAddress} />
				</div>
				<Button variant="outline" size="sm" disabled={sendingTestEmail || !testEmailAddress} onclick={sendTestEmail}>
					{#if sendingTestEmail}
						<Loader2 data-icon="inline-start" class="animate-spin" />
					{:else}
						<Send data-icon="inline-start" />
					{/if}
					Send
				</Button>
			</CardContent>
		</Card>
	{/if}
</div>
