import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Radio from '@lucide/svelte/icons/radio';
import MapPinIcon from '@lucide/svelte/icons/map-pin';
import ClipboardList from '@lucide/svelte/icons/clipboard-list';
import FileText from '@lucide/svelte/icons/file-text';
import Antenna from '@lucide/svelte/icons/antenna';
import Truck from '@lucide/svelte/icons/truck';
import Bug from '@lucide/svelte/icons/bug';
import Settings from '@lucide/svelte/icons/settings';

interface TlrTab {
	id: string;
	label: string;
	icon: Component;
}

export const Tabs: TlrTab[] = [
	{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ id: 'calls', label: 'Calls', icon: Radio },
	{ id: 'alert-log', label: 'Alert Log', icon: ClipboardList },
	{ id: 'transcripts', label: 'Transcripts', icon: FileText },
	{ id: 'map', label: 'Map', icon: MapPinIcon },
	{ id: 'apparatus', label: 'Apparatus', icon: Truck },
	{ id: 'mqtt', label: 'MQTT', icon: Antenna },
	{ id: 'settings', label: 'Settings', icon: Settings }
] as const;

export const DefaultTab = 'dashboard';

export const DebugTab: TlrTab = { id: 'debug', label: 'Debug', icon: Bug } as const;
