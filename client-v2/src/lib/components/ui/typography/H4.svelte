<script lang="ts">
	import { cn } from '$lib/utils/shadcn.ts';
	import type { TypographyProps } from '$lib/components/ui/typography/typography.ts';

	let { class: className, children }: TypographyProps = $props();
</script>

<h4 class={cn(className, 'scroll-m-20 text-xl font-semibold tracking-tight')}>
	{@render children?.()}
</h4>
