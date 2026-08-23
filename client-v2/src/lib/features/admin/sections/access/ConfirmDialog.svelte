<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import Loader2 from '@lucide/svelte/icons/loader-2';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		destructive?: boolean;
		busy?: boolean;
		onconfirm: () => void | Promise<void>;
	}

	let { open = $bindable(), title, description, confirmLabel = 'Confirm', destructive = false, busy = false, onconfirm }: Props = $props();

	async function confirm(event: Event) {
		//* Keep the dialog open while the async action runs; the caller closes it.
		event.preventDefault();
		await onconfirm();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			{#if description}
				<AlertDialog.Description>{description}</AlertDialog.Description>
			{/if}
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action class={buttonVariants({ variant: destructive ? 'destructive' : 'default' })} disabled={busy} onclick={confirm}>
				{#if busy}
					<Loader2 data-icon="inline-start" class="animate-spin" />
				{/if}
				{confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
