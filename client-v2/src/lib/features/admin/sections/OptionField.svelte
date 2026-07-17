<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import type { OptionFieldSpec } from './options-spec.ts';

	interface Props {
		field: OptionFieldSpec;
		value: unknown;
		dirty: boolean;
		onchange: (value: unknown) => void;
	}

	let { field, value, dirty, onchange }: Props = $props();

	const selectedLabel = $derived(field.options?.find((option) => option.value === String(value ?? ''))?.label ?? 'Select...');
</script>

{#if field.type === 'toggle'}
	<div class="flex items-start justify-between gap-3">
		<div class="space-y-1">
			<label for={field.key} class="text-sm font-medium">{field.label}</label>
			{#if field.caption}
				<p class="text-xs text-muted-foreground">{field.caption}</p>
			{/if}
		</div>
		<Switch id={field.key} checked={value === true} onCheckedChange={(checked: boolean) => onchange(checked)} />
	</div>
{:else}
	<div class="space-y-1.5">
		<label for={field.key} class={['text-sm font-medium', dirty && 'text-primary']}>{field.label}{dirty ? ' *' : ''}</label>
		{#if field.type === 'select'}
			<Select type="single" value={String(value ?? '')} onValueChange={(v) => onchange(v)}>
				<SelectTrigger id={field.key} size="sm" class="w-full">{selectedLabel}</SelectTrigger>
				<SelectContent>
					{#each field.options ?? [] as option (option.value)}
						<SelectItem value={option.value} label={option.label} />
					{/each}
				</SelectContent>
			</Select>
		{:else if field.type === 'textarea'}
			<Textarea
				id={field.key}
				rows={field.rows ?? 3}
				placeholder={field.placeholder}
				value={String(value ?? '')}
				oninput={(e: Event) => onchange((e.currentTarget as HTMLTextAreaElement).value)}
			/>
		{:else}
			<Input
				id={field.key}
				type={field.type === 'number' ? 'number' : field.masked ? 'password' : 'text'}
				min={field.min}
				max={field.max}
				step={field.step}
				placeholder={field.placeholder}
				autocomplete={field.masked ? 'off' : undefined}
				value={String(value ?? '')}
				oninput={(e: Event) => onchange((e.currentTarget as HTMLInputElement).value)}
			/>
		{/if}
		{#if field.caption}
			<p class="text-xs text-muted-foreground">{field.caption}</p>
		{/if}
	</div>
{/if}
