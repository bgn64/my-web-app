import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/course-picker.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		jsx: ts.JsxEmit.ReactJSX,
	},
}).outputText;

const initialCatalog = {
	query: "",
	page: 1,
	total: 51,
	courses: [
		{
			id: 42,
			name: "Example course",
			location: "Example city",
		},
	],
};

/** Exercise render branches and handlers without running effects or starting a server. */
function renderPicker(overrides = {}, startResult = {
	ok: true,
	roundId: 7,
}, environment = {})
{
	const updates = [];
	const routes = [];
	const starts = [];
	const effects = [];
	let stateIndex = 0;
	const hooks = {
		useState(initial)
		{
			const index = stateIndex++;
			const value = Object.hasOwn(overrides, index) ? overrides[index] : initial;

			return [
				value,
				(next) =>
				{
					updates.push([index, typeof next === "function" ? next(value) : next]);
				},
			];
		},
		useEffect(effect)
		{
			effects.push(effect);
		},
	};
	const jsx = (type, props, key) => ({
		type,
		props,
		key,
	});
	const modules = {
		react: hooks,
		"react/jsx-runtime": {
			jsx,
			jsxs: jsx,
			Fragment: "fragment",
		},
		"next/navigation": {
			useRouter: () => ({
				push: (url) => routes.push(url),
			}),
		},
		"./golf-actions": {
			startRound: async (id) =>
			{
				starts.push(id);
				return startResult;
			},
		},
	};
	const exports = {};
	runInNewContext(compiled, {
		exports,
		require: (name) => modules[name],
		console,
		...environment,
	});

	return {
		tree: exports.CoursePicker({
			initialCatalog,
		}),
		updates,
		routes,
		starts,
		effects,
	};
}

function findNode(node, predicate)
{
	if (!node || typeof node !== "object")
	{
		return undefined;
	}

	if (predicate(node))
	{
		return node;
	}

	if (typeof node.type === "function")
	{
		return findNode(node.type(node.props), predicate);
	}

	const children = node.props?.children;

	for (const child of Array.isArray(children) ? children : [children])
	{
		const match = findNode(child, predicate);

		if (match)
		{
			return match;
		}
	}

	return undefined;
}

test("picker preserves result priority and retry state ordering", () =>
{
	const failed = renderPicker({
		0: "new query",
		4: {
			query: "new query",
			page: 1,
			message: "Search failed",
		},
	});

	const alert = findNode(failed.tree, (node) => node.props?.role === "alert");
	assert.equal(alert.props.children[0].props.children, "Search failed");
	assert.equal(findNode(failed.tree, (node) => node.props?.role === "status"), undefined);
	findNode(failed.tree, (node) => node.type === "button" && node.props.children === "Retry search")
		.props.onClick();
	assert.deepEqual(failed.updates, [[4, null], [2, 1]]);

	const searching = renderPicker({
		0: "new query",
	});
	assert.equal(findNode(searching.tree, (node) => node.props?.role === "status").props.children,
		"Searching courses...");
	const empty = renderPicker({
		3: {
			...initialCatalog,
			courses: [],
		},
	});
	assert.ok(findNode(empty.tree, (node) => node.type === "p" &&
		node.props.children === "No courses match this search or page."));
});

test("picker handlers preserve selection, pagination, and start ordering", async () =>
{
	const picker = renderPicker();
	findNode(picker.tree, (node) => node.props?.id === "course-search")
		.props.onChange({
			target: {
				value: "links",
			},
		});
	assert.deepEqual(picker.updates, [[0, "links"], [1, 1], [5, null], [7, ""]]);
	picker.updates.length = 0;
	const course = findNode(picker.tree, (node) => node.props?.className?.startsWith("course-option"));
	assert.equal(course.key, 42);
	course.props.onClick();
	assert.deepEqual(picker.updates, [[5, 42], [7, ""]]);
	picker.updates.length = 0;
	findNode(picker.tree, (node) => node.type === "button" && node.props.children === "Next").props.onClick();
	assert.deepEqual(picker.updates, [[1, 2], [5, null]]);

	const selected = renderPicker({
		5: 42,
	});
	const start = findNode(selected.tree, (node) => node.props?.className?.includes("start-button"));
	await start.props.onClick();
	assert.deepEqual(selected.updates, [[6, true], [7, ""], [6, false]]);
	assert.deepEqual(selected.starts, ["42"]);
	assert.deepEqual(selected.routes, ["/rounds/7/scorecard"]);

	const failed = renderPicker({
		5: 42,
	}, {
		ok: false,
		error: "Unable to start",
	});
	await findNode(failed.tree, (node) => node.props?.className?.includes("start-button")).props.onClick();
	assert.deepEqual(failed.updates, [[6, true], [7, ""], [7, "Unable to start"], [6, false]]);
	assert.deepEqual(failed.routes, []);

	const pending = renderPicker({
		5: 42,
		6: true,
		7: "Previous error",
	});
	const pendingStart = findNode(pending.tree, (node) => node.props?.className?.includes("start-button"));
	assert.equal(pendingStart.props.disabled, true);
	assert.equal(pendingStart.props.children[0], "Preparing scorecard...");
	await pendingStart.props.onClick();
	assert.deepEqual(pending.updates, []);
});

test("search effect cancels stale work and restores browser history", async () =>
{
	let timer;
	let listener;
	let removed;
	let resolveFetch;
	let signal;
	const requests = [];
	const picker = renderPicker({}, undefined, {
		AbortController,
		URLSearchParams,
		setTimeout(callback, delay)
		{
			assert.equal(delay, 250);
			timer = callback;
			return 1;
		},
		clearTimeout(id)
		{
			assert.equal(id, 1);
		},
		fetch(url, options)
		{
			requests.push(url);
			signal = options.signal;
			assert.equal(options.cache, "no-store");
			return new Promise((resolve) =>
			{
				resolveFetch = resolve;
			});
		},
		window: {
			history: {
				replaceState(state, title, url)
				{
					assert.equal(url, "/play/courses?q=&page=1");
				},
			},
			location: {
				search: "?q=links&page=3",
			},
			addEventListener(name, callback)
			{
				assert.equal(name, "popstate");
				listener = callback;
			},
			removeEventListener(name, callback)
			{
				assert.equal(name, "popstate");
				removed = callback;
			},
		},
	});

	const cleanupSearch = picker.effects[0]();
	const pending = timer();
	assert.deepEqual(requests, ["/api/courses?q=&page=1"]);
	cleanupSearch();
	assert.equal(signal.aborted, true);
	resolveFetch({
		ok: true,
		json: async () => initialCatalog,
	});
	await pending;
	assert.deepEqual(picker.updates, []);

	const cleanupHistory = picker.effects[1]();
	listener();
	assert.deepEqual(picker.updates, [[0, "links"], [1, 3], [5, null]]);
	cleanupHistory();
	assert.equal(removed, listener);
});

test("search effect reports an expired session", async () =>
{
	let timer;
	const picker = renderPicker({}, undefined, {
		AbortController,
		URLSearchParams,
		setTimeout(callback)
		{
			timer = callback;
			return 1;
		},
		clearTimeout()
		{
		},
		fetch: async () => ({
			ok: false,
			status: 401,
		}),
		window: {
			history: {
				replaceState()
				{
				},
			},
		},
		console: {
			error()
			{
			},
		},
	});

	const cleanup = picker.effects[0]();
	await timer();
	assert.equal(picker.updates[0][0], 4);
	assert.equal(picker.updates[0][1].query, "");
	assert.equal(picker.updates[0][1].page, 1);
	assert.equal(picker.updates[0][1].message, "Your session has expired. Please sign in again.");
	cleanup();
});
