import type { CallChannel, TlrConfig } from '../../core/types.ts';
import { systemRef, talkgroupRef, TlrDirectory } from '../../core/directory.ts';

export interface ChannelSelection {
	groups: string[];
	channels: CallChannel[];
}

export interface ChannelChoice extends CallChannel {
	key: string;
	label: string;
	systemLabel: string;
	groups: string[];
	favorite: boolean;
}

export const channelKey = (channel: CallChannel): string => `${channel.system}:${channel.talkgroup}`;

export function parseChannelSelection(value: unknown): ChannelSelection {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		if (!parsed || typeof parsed !== 'object') return { groups: [], channels: [] };
		const selection = parsed as Partial<ChannelSelection>;
		const groups = Array.isArray(selection.groups) ? [...new Set<string>(selection.groups.filter((v: unknown) => typeof v === 'string'))] : [];
		const channels = new Map<string, CallChannel>();
		for (const channel of Array.isArray(selection.channels) ? selection.channels : []) {
			if (channel && [channel.system, channel.talkgroup].every((ref) => Number.isInteger(ref) && ref > 0 && ref <= 2147483647)) {
				const pair = { system: channel.system, talkgroup: channel.talkgroup };
				channels.set(channelKey(pair), pair);
			}
		}
		return { groups, channels: [...channels.values()] };
	} catch {
		return { groups: [], channels: [] };
	}
}

export function channelChoices(config: TlrConfig | null): ChannelChoice[] {
	const directory = new TlrDirectory(config);
	const memberships = new Map<string, string[]>();
	for (const [group, systems] of Object.entries(config?.groups ?? {})) {
		for (const [system, talkgroups] of Object.entries(systems)) {
			for (const talkgroup of talkgroups) {
				const key = channelKey({ system: Number(system), talkgroup });
				memberships.set(key, [...(memberships.get(key) ?? []), group]);
			}
		}
	}
	const choices: ChannelChoice[] = [];
	for (const system of directory.systems) {
		const ref = systemRef(system);
		if (ref == null) continue;
		const favorites = new Set(directory.favoriteTalkgroups(ref) ?? []);
		for (const talkgroup of system.talkgroups ?? []) {
			const tgRef = talkgroupRef(talkgroup);
			if (tgRef == null) continue;
			const key = channelKey({ system: ref, talkgroup: tgRef });
			choices.push({
				system: ref,
				talkgroup: tgRef,
				key,
				label: talkgroup.label ?? talkgroup.name ?? String(tgRef),
				systemLabel: system.label ?? String(ref),
				groups: memberships.get(key) ?? [],
				favorite: favorites.has(tgRef)
			});
		}
	}
	return choices.sort(
		(a, b) => a.systemLabel.localeCompare(b.systemLabel) || a.system - b.system || a.label.localeCompare(b.label) || a.talkgroup - b.talkgroup
	);
}

export function resolveChannelSelection(selection: ChannelSelection, config: TlrConfig | null, system?: number) {
	const choices = channelChoices(config);
	const available = new Map(choices.map((choice) => [choice.key, choice]));
	const resolved = new Map<string, CallChannel>();
	const notices: string[] = [];
	const include = (channel: CallChannel) => {
		if (system == null || channel.system === system) resolved.set(channelKey(channel), { system: channel.system, talkgroup: channel.talkgroup });
	};
	for (const group of selection.groups) {
		if (!Object.hasOwn(config?.groups ?? {}, group)) {
			notices.push(`${group}: unavailable in the current configuration or access.`);
			continue;
		}
		const members = choices.filter((choice) => choice.groups.includes(group));
		for (const member of members) include(member);
		if (!members.some((member) => system == null || member.system === system)) {
			notices.push(`${group}: no available channels in the current System scope.`);
		}
	}
	for (const channel of selection.channels) {
		const choice = available.get(channelKey(channel));
		if (!choice) {
			notices.push(`${channel.system}:${channel.talkgroup}: unavailable in the current configuration or access.`);
		} else if (system != null && channel.system !== system) {
			notices.push(`${choice.systemLabel} / ${choice.label}: outside the current System scope.`);
		} else {
			include(channel);
		}
	}
	return { channels: selection.groups.length || selection.channels.length ? [...resolved.values()] : undefined, notices };
}

export function selectionSummary(selection: ChannelSelection, choices: ChannelChoice[]): string {
	if (selection.groups.length + selection.channels.length === 0) return 'All channels';
	if (selection.groups.length === 1 && selection.channels.length === 0) return selection.groups[0];
	if (selection.groups.length === 0 && selection.channels.length === 1) {
		return choices.find((choice) => choice.key === channelKey(selection.channels[0]))?.label ?? channelKey(selection.channels[0]);
	}
	return [
		selection.groups.length ? `${selection.groups.length} group${selection.groups.length === 1 ? '' : 's'}` : '',
		selection.channels.length ? `${selection.channels.length} talkgroup${selection.channels.length === 1 ? '' : 's'}` : ''
	]
		.filter(Boolean)
		.join(' + ');
}
