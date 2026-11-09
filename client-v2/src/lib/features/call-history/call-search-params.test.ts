import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { channelChoices, parseChannelSelection, resolveChannelSelection, selectionSummary } from './channel-selection.ts';
import type { TlrConfig } from '../../core/types.ts';

test('Runed URL validation retains selection objects for requests and the trigger summary', async () => {
	const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
	try {
		const { callSearchParamsSchema } = await server.ssrLoadModule('/src/lib/features/call-history/call-search-params.ts');
		const { validateSearchParams, useSearchParams } = await server.ssrLoadModule('runed/kit');
		const config: TlrConfig = {
			systems: [{ systemRef: 1, talkgroups: [{ talkgroupRef: 101, label: 'Channel 11' }] }],
			groups: { Fire: { '1': [101] } }
		};
		const params = useSearchParams(callSearchParamsSchema, { updateURL: false });
		for (const { selection, channels, summary } of [
			{ selection: { groups: ['Fire'], channels: [] }, channels: [{ system: 1, talkgroup: 101 }], summary: 'Fire' },
			{ selection: { groups: [], channels: [{ system: 1, talkgroup: 101 }] }, channels: [{ system: 1, talkgroup: 101 }], summary: 'Channel 11' },
			{
				selection: { groups: ['Fire'], channels: [{ system: 1, talkgroup: 101 }] },
				channels: [{ system: 1, talkgroup: 101 }],
				summary: '1 group + 1 talkgroup'
			},
			{ selection: { groups: ['Unavailable'], channels: [] }, channels: [], summary: 'Unavailable' },
			{ selection: { groups: [], channels: [] }, channels: undefined, summary: 'All channels' }
		]) {
			params.selection = selection;
			assert.deepEqual(parseChannelSelection(params.selection), selection);
			const url = new URL('http://localhost/calls?system=1&sort=1&date=2026-11-08');
			url.searchParams.set('selection', JSON.stringify(selection));
			const restored = validateSearchParams(url, callSearchParamsSchema);
			assert.deepEqual(parseChannelSelection(restored.data.selection), selection);
			assert.equal(restored.data.system, '1');
			assert.equal(restored.data.sort, 1);
			assert.equal(restored.data.date, '2026-11-08');
			const readBack = parseChannelSelection(restored.data.selection);
			assert.deepEqual(resolveChannelSelection(readBack, config).channels, channels);
			assert.equal(selectionSummary(readBack, channelChoices(config)), summary);
			const second = validateSearchParams(new URL(`http://localhost/calls?${restored.searchParams}`), callSearchParamsSchema);
			assert.deepEqual(parseChannelSelection(second.data.selection), selection);
		}
	} finally {
		await server.close();
	}
});
