import { today, getLocalTimeZone } from '@internationalized/date';
import { createSearchParamsSchema } from 'runed/kit';
import type { ChannelSelection } from './channel-selection.ts';

export const callSearchParamsSchema = createSearchParamsSchema({
	system: { type: 'string', default: '' },
	//* Runed decodes JSON parameters before validating their schema type.
	selection: { type: 'object', default: { groups: [], channels: [] }, objectType: {} as ChannelSelection },
	date: { type: 'string', default: today(getLocalTimeZone()).toString() },
	sort: { type: 'number', default: -1 }
});
