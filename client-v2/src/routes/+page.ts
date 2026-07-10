import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { DefaultTab } from '$lib/apps/tlr/tabs.ts';

export const load: PageLoad = () => {
	redirect(302, `/${DefaultTab}`);
};
