<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<div class={cn(className, 'text-sm leading-none font-medium')}>{@render children?.()}</div>
