import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { ScoreSaveQueue } from "../app/score-save-queue.ts";

function controlledQueue()
{
	const calls = [];
	const requests = [];
	const queue = new ScoreSaveQueue((hole, strokes) =>
	{
		calls.push({
			hole,
			strokes,
		});
		return new Promise((resolve, reject) => requests.push({
			resolve,
			reject,
		}));
	});

	return {
		queue,
		calls,
		complete(result = {
			ok: true,
		})
		{
			requests.shift().resolve(result);
		},
		reject(error)
		{
			requests.shift().reject(error);
		},
	};
}

test("rapid edits are coalesced and writes never overlap", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(1, 5);
	queue.enqueue(1, 6);
	assert.deepEqual(calls, [{
		hole: 1,
		strokes: 4,
	}]);
	assert.equal(queue.getSnapshot().hasUnsavedChanges, true);

	complete();
	await setImmediate();
	assert.deepEqual(calls, [{
		hole: 1,
		strokes: 4,
	}, {
		hole: 1,
		strokes: 6,
	}]);
	assert.equal(queue.getSnapshot().hasUnsavedChanges, true);
	complete();
	assert.equal(await queue.flush(), true);
	assert.deepEqual(queue.getSnapshot(), {
		hasUnsavedChanges: false,
		error: null,
	});
});

test("multiple holes keep their latest scores and clears", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(2, 3);
	queue.enqueue(1, 6);
	queue.enqueue(2, 5);
	queue.enqueue(2, null);

	complete();
	await setImmediate();
	assert.deepEqual(calls[1], {
		hole: 1,
		strokes: 6,
	});
	complete();
	await setImmediate();
	assert.deepEqual(calls[2], {
		hole: 2,
		strokes: null,
	});
	complete();
	assert.equal(await queue.flush(), true);
	assert.equal(calls.length, 3);
});

test("returning to the in-flight value needs no redundant write", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(1, 5);
	queue.enqueue(1, 4);
	complete();
	assert.equal(await queue.flush(), true);
	assert.deepEqual(calls, [{
		hole: 1,
		strokes: 4,
	}]);
});

test("flush waits for every pending score, including newer edits", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	let flushed = false;
	const flush = queue.flush().then((result) =>
	{
		flushed = true;
		return result;
	});
	queue.enqueue(2, 3);
	complete();
	await setImmediate();
	assert.equal(flushed, false);
	assert.deepEqual(calls[1], {
		hole: 2,
		strokes: 3,
	});
	queue.enqueue(2, 4);
	complete();
	await setImmediate();
	assert.equal(flushed, false);
	assert.deepEqual(calls[2], {
		hole: 2,
		strokes: 4,
	});
	complete();
	assert.equal(await flush, true);
	assert.equal(flushed, true);
});

test("server failure pauses writes and retry saves the latest edits on all holes", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(1, 6);
	queue.enqueue(2, 3);
	complete({
		ok: false,
		error: "Session expired.",
	});
	assert.equal(await queue.flush(), false);
	assert.deepEqual(queue.getSnapshot(), {
		hasUnsavedChanges: true,
		error: "Session expired.",
	});
	assert.equal(calls.length, 1);

	queue.enqueue(1, 7);
	queue.enqueue(2, null);
	await setImmediate();
	assert.equal(calls.length, 1);
	assert.equal(queue.getSnapshot().error, "Session expired.");
	queue.retry();
	assert.equal(queue.getSnapshot().error, null);
	assert.deepEqual(calls[1], {
		hole: 1,
		strokes: 7,
	});
	complete();
	await setImmediate();
	assert.deepEqual(calls[2], {
		hole: 2,
		strokes: null,
	});
	complete();
	assert.equal(await queue.flush(), true);
});

test("network rejection is logged and preserves the failed score for retry", async (t) =>
{
	const log = t.mock.method(console, "error", () =>
	{
	});
	const { queue, calls, reject, complete } = controlledQueue();
	queue.enqueue(3, 5);
	const error = new Error("Connection lost.");
	reject(error);
	assert.equal(await queue.flush(), false);
	assert.deepEqual(log.mock.calls[0].arguments, ["Could not save score:", error]);
	assert.match(queue.getSnapshot().error, /Score not saved/);
	queue.retry();
	assert.deepEqual(calls[1], {
		hole: 3,
		strokes: 5,
	});
	complete();
	assert.equal(await queue.flush(), true);
});

test("confirmed discard waits for the active write without sending queued scores", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(1, 6);
	queue.enqueue(2, 3);
	let paused = false;
	const pause = queue.pause().then(() =>
	{
		paused = true;
	});
	await setImmediate();
	assert.equal(paused, false);
	complete();
	await pause;
	assert.equal(calls.length, 1);
	assert.equal(queue.getSnapshot().hasUnsavedChanges, true);
	queue.discardPending();
	assert.deepEqual(queue.getSnapshot(), {
		hasUnsavedChanges: false,
		error: null,
	});
	assert.equal(await queue.flush(), true);
});

test("a failed discard can resume saving without dropping queued edits", async () =>
{
	const { queue, calls, complete } = controlledQueue();
	queue.enqueue(1, 4);
	queue.enqueue(1, 6);
	const pause = queue.pause();
	complete();
	await pause;
	queue.resume();
	assert.deepEqual(calls[1], {
		hole: 1,
		strokes: 6,
	});
	complete();
	assert.equal(await queue.flush(), true);
});

test("discarding pending changes requires a settled, paused queue", async () =>
{
	const { queue, complete } = controlledQueue();
	assert.throws(() => queue.discardPending(), /Pause score saving/);
	queue.enqueue(1, 4);
	const pause = queue.pause();
	assert.throws(() => queue.discardPending(), /Pause score saving/);
	complete();
	await pause;
	queue.discardPending();
});

test("snapshots are stable and unsubscribed listeners are not notified", async () =>
{
	const { queue, complete } = controlledQueue();
	const initial = queue.getSnapshot();
	let notifications = 0;
	const unsubscribe = queue.subscribe(() =>
	{
		notifications++;
	});
	queue.enqueue(1, 4);
	const dirty = queue.getSnapshot();
	assert.notEqual(dirty, initial);
	queue.enqueue(1, 5);
	assert.equal(queue.getSnapshot(), dirty);
	assert.equal(notifications, 1);
	complete();
	await setImmediate();
	assert.equal(queue.getSnapshot(), dirty);
	unsubscribe();
	complete();
	assert.equal(await queue.flush(), true);
	assert.equal(notifications, 1);
});
