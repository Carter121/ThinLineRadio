import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallSearchQueue } from '../../core/call-search-queue.ts';

test('only one request is outstanding and the latest search supersedes older results/errors', () => {
	const queue = new CallSearchQueue();
	assert.deepEqual(queue.search({ system: 1, date: 'first', limit: 400 }), { system: 1, date: 'first', limit: 400, offset: 0 });
	assert.equal(queue.page(400), null);
	assert.equal(queue.search({ system: 2, date: 'second' }), null);
	assert.equal(queue.search({ system: 3, date: 'latest' }), null);
	assert.deepEqual(queue.complete(), { accepted: false, replace: true, next: { system: 3, date: 'latest', offset: 0 } });
	assert.equal(queue.page(400), null);
	assert.deepEqual(queue.complete(), { accepted: true, replace: true, next: null });
	assert.deepEqual(queue.complete(), { accepted: false, replace: false, next: null });
});

test('pagination and Load all use an independent snapshot of every search filter', () => {
	const queue = new CallSearchQueue();
	const filters = { system: 1, date: 'original', sort: -1, channels: [{ system: 1, talkgroup: 101 }], limit: 400 };
	const sent = queue.search(filters)!;
	filters.system = 2;
	filters.date = 'edited';
	filters.sort = 1;
	filters.channels[0].talkgroup = 102;
	sent.channels![0].talkgroup = 999;
	queue.complete();
	assert.deepEqual(queue.page(400), { system: 1, date: 'original', sort: -1, channels: [{ system: 1, talkgroup: 101 }], limit: 400, offset: 400 });
	queue.complete();
	assert.deepEqual(queue.page(800)?.channels, [{ system: 1, talkgroup: 101 }]);
	assert.equal(queue.complete().replace, false);
});

test('a new search drains an outstanding pagination response before starting', () => {
	const queue = new CallSearchQueue();
	queue.search({ channels: [] });
	queue.complete();
	queue.page(400);
	assert.equal(queue.search({}), null);
	assert.deepEqual(queue.complete(), { accepted: false, replace: false, next: { offset: 0 } });
	assert.deepEqual(queue.complete(), { accepted: true, replace: true, next: null });
});

test('disconnect resets outstanding requests so reconnect can start a fresh search', () => {
	const queue = new CallSearchQueue();
	queue.search({ system: 1 });
	queue.search({ system: 2 });
	queue.reset();
	assert.equal(queue.complete().accepted, false);
	assert.equal(queue.page(400), null);
	assert.deepEqual(queue.search({ system: 3 }), { system: 3, offset: 0 });
});
