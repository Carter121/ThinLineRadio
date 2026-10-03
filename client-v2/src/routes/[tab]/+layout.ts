import type { LayoutLoad } from './$types';
import { AllTabs, DefaultTab } from '$lib/core/tabs.ts';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = ({ params }) => {
	const activeTab = AllTabs.find((tab) => tab.id === params.tab.toLowerCase());

	if (!activeTab) {
		redirect(307, `/${DefaultTab}`);
	}

	return {
		activeTab
	};
};
