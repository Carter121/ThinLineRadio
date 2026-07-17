import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { DefaultTab } from '$lib/apps/tlr/tabs.ts';

export const load: PageLoad = ({ url }) => {
	//* Preserve query params: verification email links land on /?verify=<token>
	redirect(302, `/${DefaultTab}${url.search}`);
};
