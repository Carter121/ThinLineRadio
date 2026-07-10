<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<h3 class={cn(className, 'scroll-m-20 text-2xl font-semibold tracking-tight')}>
	{@render children?.()}
</h3>
