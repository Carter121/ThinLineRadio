import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TlrConfig } from '../../core/types.ts';
import { channelChoices, parseChannelSelection, resolveChannelSelection } from './channel-selection.ts';

const config: TlrConfig = {
	systems: [
		{
			id: 10,
			systemRef: 1,
			label: 'North',
			talkgroups: [
				{ id: 110, talkgroupRef: 101, label: 'Channel 11' },
				{ id: 120, talkgroupRef: 102, label: 'Channel 12' },
				{ id: 130, talkgroupRef: 103, label: 'Ungrouped' }
			]
		},
		{ id: 20, systemRef: 2, label: 'South', talkgroups: [{ id: 210, talkgroupRef: 101, label: 'Channel 11' }] }
	],
	groups: { 'XYZ FD': { '1': [101, 102] }, Mutual: { '1': [101], '2': [101] }, Empty: {} },
	userSettings: { favorites: [{ type: 'talkgroup', systemId: 2, talkgroupId: 101 }] }
};

test('unions overlapping groups and explicit reference pairs without a cross product', () => {
	const selection = {
		groups: ['XYZ FD', 'Mutual'],
		channels: [
			{ system: 1, talkgroup: 101 },
			{ system: 2, talkgroup: 101 }
		]
	};
	assert.deepEqual(resolveChannelSelection(selection, config).channels, [
		{ system: 1, talkgroup: 101 },
		{ system: 1, talkgroup: 102 },
		{ system: 2, talkgroup: 101 }
	]);
	assert.deepEqual(resolveChannelSelection({ ...selection, groups: ['Mutual'] }, config).channels, [
		{ system: 1, talkgroup: 101 },
		{ system: 2, talkgroup: 101 }
	]);
	assert.deepEqual(resolveChannelSelection({ ...selection, groups: [] }, config).channels, selection.channels);
});

test('scope preserves explicit choices and never broadens empty resolutions', () => {
	const selection = { groups: [], channels: [{ system: 2, talkgroup: 101 }] };
	assert.deepEqual(resolveChannelSelection(selection, config, 1).channels, []);
	assert.equal(resolveChannelSelection(selection, config, 1).notices.length, 1);
	assert.deepEqual(resolveChannelSelection(selection, config).channels, selection.channels);
	assert.deepEqual(resolveChannelSelection({ groups: ['XYZ FD'], channels: [] }, config, 2).channels, []);
	assert.deepEqual(resolveChannelSelection({ groups: ['Empty'], channels: [] }, config).channels, []);
	assert.equal(resolveChannelSelection({ groups: [], channels: [] }, config, 1).channels, undefined);
});

test('URL round-trip preserves explicit selections, unavailable entries and group names', () => {
	const selection = {
		groups: ['XYZ FD', 'Removed & renamed'],
		channels: [
			{ system: 2, talkgroup: 101 },
			{ system: 99, talkgroup: 999 }
		]
	};
	const restored = parseChannelSelection(JSON.stringify(selection));
	assert.deepEqual(restored, selection);
	const resolution = resolveChannelSelection(restored, config);
	assert.equal(resolution.notices.length, 2);
	assert.equal(resolution.channels?.length, 3);
	assert.deepEqual(resolveChannelSelection({ groups: ['Removed'], channels: [] }, config).channels, []);
});

test('refresh resolves changed membership while retained snapshots are independent', () => {
	const selection = { groups: ['XYZ FD'], channels: [] };
	const first = resolveChannelSelection(selection, config).channels;
	const changed = { ...config, groups: { 'XYZ FD': { '2': [101] } } };
	assert.deepEqual(resolveChannelSelection(selection, changed).channels, [{ system: 2, talkgroup: 101 }]);
	assert.deepEqual(first, [
		{ system: 1, talkgroup: 101 },
		{ system: 1, talkgroup: 102 }
	]);
});

test('catalog preserves group context, cross-system favorites, ungrouped channels and refs', () => {
	const choices = channelChoices(config);
	assert.deepEqual(choices.find((choice) => choice.key === '1:101')?.groups, ['XYZ FD', 'Mutual']);
	assert.equal(choices.find((choice) => choice.key === '2:101')?.favorite, true);
	assert.deepEqual(choices.find((choice) => choice.key === '1:103')?.groups, []);
	assert.equal(choices.filter((choice) => choice.label === 'Channel 11').length, 2);
	assert.equal(
		choices.some((choice) => choice.system === 10 || choice.talkgroup === 110),
		false
	);
});

test('URL parser deduplicates references and rejects invalid pairs', () => {
	assert.deepEqual(parseChannelSelection('bad JSON'), { groups: [], channels: [] });
	assert.deepEqual(
		parseChannelSelection(
			JSON.stringify({
				groups: ['XYZ FD', 'XYZ FD', 1],
				channels: [
					{ system: 1, talkgroup: 101 },
					{ system: 1, talkgroup: 101 },
					{ system: '1', talkgroup: 102 },
					{ system: 0, talkgroup: 101 },
					{ system: 1, talkgroup: 2.5 }
				]
			})
		),
		{ groups: ['XYZ FD'], channels: [{ system: 1, talkgroup: 101 }] }
	);
});
