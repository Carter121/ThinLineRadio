import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TlrClient } from '../../core/tlr-client.ts';
import type { TlrSocketEvent } from '../../core/types.ts';

class TestSocket extends EventTarget {
	static OPEN = 1;
	static CONNECTING = 0;
	static CLOSING = 2;
	static CLOSED = 3;
	static latest: TestSocket;
	readyState = TestSocket.CONNECTING;
	sent: unknown[][] = [];
	constructor() {
		super();
		TestSocket.latest = this;
	}
	send(frame: string) {
		this.sent.push(JSON.parse(frame));
	}
	open() {
		this.readyState = TestSocket.OPEN;
		this.dispatchEvent(new Event('open'));
	}
	close() {
		this.readyState = TestSocket.CLOSED;
		this.dispatchEvent(new Event('close'));
	}
	receive(frame: unknown[]) {
		this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
	}
}

test('socket drains stale LCL errors and successes across view changes and retains frozen pages', (t) => {
	const originals = new Map(['window', 'localStorage', 'WebSocket'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
	Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
	Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
	Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: TestSocket });
	const client = new TlrClient('http://localhost', 'http://localhost');
	t.after(() => {
		client.disconnectSocket();
		for (const [key, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	});
	const events: TlrSocketEvent[] = [];
	let unsubscribe = client.subscribe((event) => events.push(event));
	client.connectSocket();
	const socket = TestSocket.latest;
	socket.open();
	client.requestCallList({ channels: [{ system: 1, talkgroup: 101 }], date: 'first', limit: 400 });
	assert.equal(client.requestCallListPage(400), false);
	client.requestCallList({ channels: [], date: 'latest', limit: 400 });
	assert.equal(socket.sent.filter((frame) => frame[0] === 'LCL').length, 1);
	socket.receive(['ERR', { command: 'LCL', code: 'invalid_filters', message: 'old error' }]);
	assert.equal(
		events.some((event) => event.type === 'call-list-error'),
		false
	);
	assert.deepEqual(socket.sent.at(-1), ['LCL', { channels: [], date: 'latest', limit: 400, offset: 0 }]);
	socket.receive(['LCL', { results: [], count: 0, hasMore: false }]);
	const success = events.at(-1);
	assert.equal(success?.type, 'call-list');
	if (success?.type === 'call-list') assert.equal(success.replace, true);
	assert.equal(client.requestCallListPage(400), true);
	assert.deepEqual(socket.sent.at(-1), ['LCL', { channels: [], date: 'latest', limit: 400, offset: 400 }]);
	unsubscribe();
	unsubscribe = client.subscribe((event) => events.push(event));
	client.requestCallList({ system: 2 });
	const before = events.length;
	socket.receive(['LCL', { results: [{ id: 999 }], count: 1, hasMore: false }]);
	assert.equal(events.length, before);
	assert.deepEqual(socket.sent.at(-1), ['LCL', { system: 2, offset: 0 }]);
	socket.receive(['ERR', { command: 'LCL', code: 'search_failed', message: 'Please retry' }]);
	assert.deepEqual(events.at(-1), { type: 'call-list-error', code: 'search_failed', message: 'Please retry' });
	socket.receive(['CFG', { groups: { Old: {} } }]);
	client.resumeSocket({ force: true });
	const restored: TlrSocketEvent[] = [];
	const unsubscribeRestored = client.subscribe((event) => restored.push(event));
	assert.equal(
		restored.some((event) => event.type === 'config'),
		false
	);
	TestSocket.latest.open();
	client.requestCallList({ system: 3 });
	const eventCount = events.length;
	socket.receive(['LCL', { results: [{ id: 999 }], count: 1, hasMore: false }]);
	assert.equal(events.length, eventCount);
	TestSocket.latest.receive(['LCL', { results: [], count: 0, hasMore: false }]);
	assert.equal(events.at(-1)?.type, 'call-list');
	unsubscribeRestored();
	unsubscribe();
});
