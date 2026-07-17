<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import { tlrOrigin } from '$lib/tlr-config.ts';
	import type { AdminSessionState } from '$lib/core/admin-session.svelte.ts';

	interface Props {
		session: AdminSessionState;
	}

	let { session }: Props = $props();

	//* Bumped after every upload/delete so the previews bypass the browser cache.
	let cacheBust = $state(0);
	let busy = $state<string | null>(null);

	interface ImageSlot {
		id: string;
		label: string;
		caption: string;
		accept: string;
		maxBytes: number;
		servedAt: string;
		hasImage: () => boolean;
		upload: (file: File) => Promise<unknown>;
		remove: () => Promise<unknown>;
	}

	const slots: ImageSlot[] = [
		{
			id: 'favicon',
			label: 'Favicon',
			caption: 'PNG, JPG, SVG, or ICO up to 2MB.',
			accept: '.png,.jpg,.jpeg,.svg,.ico,image/png,image/jpeg,image/svg+xml,image/x-icon',
			maxBytes: 2 * 1024 * 1024,
			servedAt: '/favicon',
			hasImage: () => !!session.options?.faviconFilename,
			upload: (file) => session.client.uploadFavicon(file),
			remove: () => session.client.deleteFavicon()
		},
		{
			id: 'logo',
			label: 'Server Logo',
			caption: 'PNG, JPG, or SVG up to 5MB. Used in emails and on the login page.',
			accept: '.png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml',
			maxBytes: 5 * 1024 * 1024,
			servedAt: '/email-logo',
			hasImage: () => !!session.options?.emailLogoFilename,
			upload: (file) => session.client.uploadEmailLogo(file),
			remove: () => session.client.deleteEmailLogo()
		}
	];

	async function handleFile(slot: ImageSlot, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > slot.maxBytes) {
			toast.error(`${slot.label} must be under ${Math.round(slot.maxBytes / 1024 / 1024)}MB`);
			return;
		}
		busy = slot.id;
		try {
			await slot.upload(file);
			await session.refreshConfig();
			cacheBust += 1;
			toast.success(`${slot.label} updated`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to upload ${slot.label}`);
		} finally {
			busy = null;
		}
	}

	async function handleRemove(slot: ImageSlot) {
		busy = slot.id;
		try {
			await slot.remove();
			await session.refreshConfig();
			cacheBust += 1;
			toast.success(`${slot.label} removed`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : `Failed to remove ${slot.label}`);
		} finally {
			busy = null;
		}
	}
</script>

<div class="grid gap-6 sm:grid-cols-2">
	{#each slots as slot (slot.id)}
		<div class="space-y-2">
			<p class="text-sm font-medium">{slot.label}</p>
			<div class="flex items-center gap-3">
				<div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
					{#if slot.hasImage()}
						<img src={`${tlrOrigin()}${slot.servedAt}?v=${cacheBust}`} alt={slot.label} class="max-h-full max-w-full object-contain" />
					{:else}
						<ImageIcon class="size-5 text-muted-foreground" />
					{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" class="gap-1.5" disabled={busy === slot.id}>
						<label class="flex cursor-pointer items-center gap-1.5">
							<Upload class="size-3.5" />
							{slot.hasImage() ? 'Change' : 'Upload'}
							<input type="file" class="hidden" accept={slot.accept} onchange={(e: Event) => handleFile(slot, e)} />
						</label>
					</Button>
					{#if slot.hasImage()}
						<Button variant="ghost" size="sm" class="gap-1.5 text-destructive" disabled={busy === slot.id} onclick={() => handleRemove(slot)}>
							<Trash2 class="size-3.5" />
							Remove
						</Button>
					{/if}
				</div>
			</div>
			<p class="text-xs text-muted-foreground">{slot.caption}</p>
		</div>
	{/each}
</div>
