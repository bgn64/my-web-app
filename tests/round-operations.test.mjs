import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/_features/rounds/operations.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
	},
}).outputText;

function operations({ session = { user: { id: "user-1" } }, query, connect, scorecard, createRound } = {})
{
	class CourseDetailsError extends Error {}
	const db = { query, connect };
	const modules = {
		"server-only": {},
		"../../_lib/db": { getDb: () => db },
		"../../_lib/parse-id": {
			parseId: (value) => /^[1-9]\d*$/.test(value) ? Number(value) : null,
		},
		"../auth/session": { getSession: async () => session },
		"../courses/data": { requireCourseScorecard: scorecard },
		"../courses/course-scorecard": { CourseDetailsError },
		"./golf-round-start": { createScorecardRound: createRound },
	};
	const exports = {};
	runInNewContext(compiled, {
		exports,
		require: (name) => modules[name],
		console: { error() {}, warn() {} },
	});

	return exports;
}

test("starting a round checks activity, hydrates and invalidates in order", async () =>
{
	const events = [];
	const card = {};
	const api = operations({
		query: async () =>
		{
			events.push("active");
			return { rowCount: 0 };
		},
		scorecard: async (id) =>
		{
			events.push(`course:${id}`);
			return card;
		},
		createRound: async (_db, user, selectedCard) =>
		{
			assert.equal(user, "user-1");
			assert.equal(selectedCard, card);
			events.push("create");
			return 7;
		},
	});
	const result = await api.startRound("42", (id) => events.push(`invalidate:${id}`));

	assert.equal(result.ok, true);
	assert.equal(result.roundId, 7);
	assert.deepEqual(events, ["active", "course:42", "create", "invalidate:7"]);
});

test("score save retains transaction and invalidation ordering, including failure", async () =>
{
	for (const failInvalidation of [false, true])
	{
		const events = [];
		const client = {
			query: async (sql) =>
			{
				events.push(sql.startsWith("SELECT") ? "SELECT" : sql.startsWith("UPDATE") ? "UPDATE" : sql);
				return { rowCount: 1 };
			},
			release: () => events.push("release"),
		};
		const api = operations({ connect: async () => client });
		const result = await api.saveScore(7, 1, 4, () =>
		{
			events.push("invalidate");

			if (failInvalidation)
			{
				throw new Error("invalidation failed");
			}
		});

		assert.equal(result.ok, true);
		assert.deepEqual(events, ["BEGIN", "SELECT", "UPDATE", "COMMIT", "invalidate", "release"]);
	}
});

test("unauthenticated or invalid round operations do not write", async () =>
{
	let writes = 0;
	const query = async () =>
	{
		writes++;
		return { rowCount: 1 };
	};
	const unauthenticated = operations({ session: null, query });
	const invalid = operations({ query });

	assert.equal((await unauthenticated.startRound("42", () => {})).ok, false);
	assert.equal((await invalid.closeRound(0, "finish", () => {})).ok, false);
	assert.equal(writes, 0);
});
