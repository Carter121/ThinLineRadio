<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';
	import SystemAccessPicker from './SystemAccessPicker.svelte';
	import { describeAccess, toPickerLabels, toPickerSystems, type AccessSystems } from './access-types.ts';

	interface Props {
		session: AdminSessionState;
		open: boolean;
		value: AccessSystems;
		title?: string;
		description?: string;
		onsave: (value: AccessSystems) => void;
	}

	let { session, open = $bindable(), value, title = 'System access', description, onsave }: Props = $props();

	const systems = $derived(toPickerSystems(session.config?.systems));
	const tags = $derived(toPickerLabels(session.config?.tags));
	const groups = $derived(toPickerLabels(session.config?.groups));

	//* Edits happen on a draft; the caller only sees the value on Save.
	let draft = $state<AccessSystems>('*');

	function onOpenChange(next: boolean) {
		if (next) draft = structuredClone($state.snapshot(value));
		open = next;
	}

	function save() {
		onsave(structuredClone($state.snapshot(draft)));
		open = false;
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="flex max-h-[85vh] w-[95vw] flex-col sm:max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>
				{description ?? 'Choose which systems and talkgroups are accessible.'}
				<span class="block pt-1 text-xs">Current selection: {describeAccess(draft, systems)}</span>
			</Dialog.Description>
		</Dialog.Header>
		<div class="min-h-0 flex-1 overflow-y-auto pr-1">
			<SystemAccessPicker bind:value={draft} {systems} {tags} {groups} />
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button onclick={save}>Apply</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
