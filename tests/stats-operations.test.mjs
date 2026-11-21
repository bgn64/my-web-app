import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import pg from "pg";
import ts from "typescript";
import * as contracts from "../app/_features/stats/contracts.ts";
import { roundSnapshot } from "./fixtures/course.mjs";

function loadModule(path, modules)
{
	const source = readFileSync(new URL(path, import.meta.url), "utf8");
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const exports = {};
	runInNewContext(compiled, {
		exports,
		require: (name) => modules[name],
		console,
	});
	return exports;
}

function apiFor(pool, getSession)
{
	const db = { getDb: () => pool };
	const data = loadModule("../app/_features/stats/data.ts", {
		"server-only": {},
		"../../_lib/db": db,
	});
	return loadModule("../app/_features/stats/operations.ts", {
		"server-only": {},
		"../../_lib/db": db,
		"../auth/session": { getSession },
		"./contracts": contracts,
		"./data": data,
	});
}

test("authenticated atomic configuration and answer lifecycle", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const user = randomUUID();
	const other = randomUUID();
	let identity = user;
	const api = apiFor(pool, async () => identity ? { user: { id: identity } } : null);

	try
	{
		await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3), ($4, $2, $5)', [
			user, "Stats operation test", `${user}@example.test`, other, `${other}@example.test`,
		]);
		const round = await pool.query(
			"INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2) RETURNING id",
			[user, JSON.stringify(roundSnapshot())],
		);
		const roundId = round.rows[0].id;
		await pool.query("INSERT INTO round_scores (round_id, hole_number) VALUES ($1, 1), ($1, 2)", [roundId]);
		const draft = {
			revision: 0,
			baseline: [],
			library: [
				{ key: "putts", id: null, name: "Putts", kind: "number" },
				{ key: "green", id: null, name: "Green", kind: "boolean" },
			],
			deleted: [],
			retained: [],
			added: ["putts", "green"],
		};
		identity = null;
		assert.equal((await api.saveConfiguration(roundId, draft)).ok, false);
		identity = other;
		assert.equal((await api.saveConfiguration(roundId, draft)).ok, false);
		identity = user;
		const saved = await api.saveConfiguration(roundId, draft);
		assert.equal(saved.ok, true);
		assert.equal(saved.snapshot.revision, 1);
		assert.equal(saved.snapshot.stats.length, 2);
		assert.equal((await api.saveConfiguration(roundId, draft)).conflict, true);
		const [number, boolean] = saved.snapshot.stats;
		assert.equal((await api.saveAnswer(roundId, number.id, 1, "number", 0, 1)).ok, true);
		assert.equal((await api.saveAnswer(roundId, boolean.id, 2, "boolean", false, 1)).ok, true);
		assert.equal((await api.saveAnswer(roundId, number.id, 2, "number", 100, 1)).ok, false);
		assert.equal((await api.saveAnswer(roundId, number.id, 3, "number", 1, 1)).ok, false);
		assert.equal((await api.saveAnswer(roundId, number.id, 2, "boolean", true, 1)).ok, false);
		identity = other;
		assert.equal((await api.saveAnswer(roundId, number.id, 1, "number", 2, 1)).ok, false);
		identity = user;
		const loaded = await api.loadConfiguration(roundId);
		assert.equal(loaded.snapshot.stats[0].values[0].value, 0);
		assert.equal(loaded.snapshot.stats[1].values[0].value, false);
		const updated = {
			revision: 1,
			baseline: loaded.library,
			library: loaded.library.map((item) => ({
				...item, key: `existing:${item.id}`, name: item.name === "Putts" ? "New name" : item.name,
			})).concat([{ key: "another", id: null, name: "New name", kind: "number" }]),
			deleted: [`existing:${loaded.library[1].id}`],
			retained: loaded.snapshot.stats.map((item) => item.id),
			added: ["another"],
		};
		const changed = await api.saveConfiguration(roundId, updated);
		assert.equal(changed.ok, true);
		assert.deepEqual(Array.from(changed.snapshot.stats, (item) => item.name), ["Putts", "Green", "New name"]);
		assert.equal(changed.snapshot.stats[1].values[0].value, false);
		assert.equal(changed.library.length, 2);
		assert.equal(changed.snapshot.stats[0].source_definition_id, loaded.library[0].id);
		assert.equal(changed.snapshot.stats[1].source_definition_id, null);
		assert.equal((await api.saveAnswer(roundId, number.id, 1, "number", 2, 1)).conflict, true);
		assert.equal((await api.saveAnswer(roundId, number.id, 1, "number", null, 2)).ok, true);
		const locker = await pool.connect();
		await locker.query("BEGIN");
		await locker.query("SELECT id FROM golf_rounds WHERE id = $1 FOR UPDATE", [roundId]);
		const pendingAnswer = api.saveAnswer(roundId, number.id, 1, "number", 3, 2);
		await locker.query("UPDATE golf_rounds SET finished_at = CURRENT_TIMESTAMP WHERE id = $1", [roundId]);
		await locker.query("COMMIT");
		locker.release();
		assert.equal((await pendingAnswer).ok, false);
		assert.equal((await api.saveAnswer(roundId, number.id, 1, "number", 2, 2)).ok, false);
		assert.equal((await api.saveConfiguration(roundId, updated)).ok, false);
	}
	finally
	{
		await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[user, other]]);
		await pool.end();
	}
});

test("ordered replacements preserve retained identities and reject changed removal impact", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const user = randomUUID();
	const api = apiFor(pool, async () => ({ user: { id: user } }));

	try
	{
		await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
			user, "Ordered stats", `${user}@example.test`,
		]);
		const inserted = await pool.query(
			"INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2) RETURNING id",
			[user, JSON.stringify(roundSnapshot())],
		);
		const id = inserted.rows[0].id;
		await pool.query("INSERT INTO round_scores (round_id, hole_number) VALUES ($1, 1), ($1, 2)", [id]);
		const saved = await api.saveConfiguration(id, {
			revision: 0, baseline: [], deleted: [], retained: [], added: ["a", "b"],
			library: [
				{ key: "a", id: null, name: "Same name", kind: "number" },
				{ key: "b", id: null, name: "Same name", kind: "boolean" },
				{ key: "c", id: null, name: "Replacement", kind: "number" },
			],
		});
		assert.equal(saved.ok, true);
		const [a, b] = saved.snapshot.stats;
		await api.saveAnswer(id, a.id, 1, "number", 0, 1);
		await api.saveAnswer(id, b.id, 1, "boolean", false, 1);
		const loaded = await api.loadConfiguration(id);
		const library = loaded.library.map((item) => ({ ...item, key: `existing:${item.id}` }));
		const replacement = library.find((item) => item.name === "Replacement").key;
		const draft = {
			revision: 1, baseline: loaded.library, library, deleted: [],
			retained: [a.id, b.id], added: [replacement],
			order: [
				{ kind: "definition", definitionKey: replacement },
				{ kind: "round", roundStatId: a.id },
				{ kind: "round", roundStatId: b.id },
			],
		};
		const changed = await api.saveConfiguration(id, draft);
		assert.equal(changed.ok, true);
		assert.deepEqual(Array.from(changed.snapshot.stats, (item) => item.name), ["Replacement", "Same name", "Same name"]);
		assert.equal(changed.snapshot.stats[1].id, a.id);
		assert.equal(changed.snapshot.stats[1].values[0].value, 0);
		assert.equal(changed.snapshot.stats[2].id, b.id);
		assert.equal(changed.snapshot.stats[2].values[0].value, false);
		const current = await api.loadConfiguration(id);
		const duplicate = {
			...draft,
			revision: 2,
			baseline: current.library,
			retained: current.snapshot.stats.map((item) => item.id),
			order: undefined,
		};
		assert.equal((await api.saveConfiguration(id, duplicate)).ok, false);
		const remove = {
			...duplicate,
			added: [],
			retained: duplicate.retained.filter((statId) => statId !== b.id),
			removalCounts: { [b.id]: 1 },
		};
		await api.saveAnswer(id, b.id, 2, "boolean", true, 2);
		assert.equal((await api.saveConfiguration(id, remove)).conflict, true);
		assert.equal((await api.loadConfiguration(id)).snapshot.stats.length, 3);
		remove.removalCounts[b.id] = 2;
		const removed = await api.saveConfiguration(id, remove);
		assert.equal(removed.ok, true);
		assert.equal(removed.snapshot.stats.length, 2);
		assert.equal(removed.snapshot.stats[1].id, a.id);
		assert.equal((await pool.query("SELECT 1 FROM round_stat_values WHERE round_stat_id = $1", [b.id])).rowCount, 0);
		await pool.query("UPDATE round_stats SET source_definition_id = NULL WHERE id = $1", [a.id]);
		const legacy = await api.loadConfiguration(id);
		const unchanged = await api.saveConfiguration(id, {
			revision: legacy.snapshot.revision, baseline: legacy.library,
			library: legacy.library.map((item) => ({ ...item, key: `existing:${item.id}` })),
			retained: legacy.snapshot.stats.map((item) => item.id), added: [], deleted: [],
		});
		assert.equal(unchanged.ok, true);
		assert.equal(unchanged.snapshot.stats[1].source_definition_id, null);
		assert.equal(unchanged.snapshot.stats[1].values[0].value, 0);
	}
	finally
	{
		await pool.query('DELETE FROM "user" WHERE id = $1', [user]);
		await pool.end();
	}
});

test("configuration failure rolls back every staged library and round change", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const user = randomUUID();
	let inserts = 0;
	const failingPool = {
		query: pool.query.bind(pool),
		async connect()
		{
			const client = await pool.connect();
			return {
				query(sql, values)
				{
					if (sql.startsWith("INSERT INTO stat_definitions") && ++inserts === 2)
					{
						throw new Error("Injected configuration failure");
					}
					return client.query(sql, values);
				},
				release: () => client.release(),
			};
		},
	};
	const api = apiFor(failingPool, async () => ({ user: { id: user } }));
	const originalError = console.error;
	console.error = () => {};
	try
	{
		await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
			user, "Rollback test", `${user}@example.test`,
		]);
		const round = await pool.query(
			"INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2) RETURNING id",
			[user, JSON.stringify(roundSnapshot())],
		);
		const id = round.rows[0].id;
		const result = await api.saveConfiguration(id, {
			revision: 0,
			baseline: [],
			library: [
				{ key: "a", id: null, name: "One", kind: "number" },
				{ key: "b", id: null, name: "Two", kind: "boolean" },
			],
			deleted: [],
			retained: [],
			added: ["a", "b"],
		});
		assert.equal(result.ok, false);
		assert.equal((await pool.query("SELECT id FROM stat_definitions WHERE user_id = $1", [user])).rowCount, 0);
		assert.equal((await pool.query("SELECT id FROM round_stats WHERE round_id = $1", [id])).rowCount, 0);
		assert.equal((await pool.query("SELECT stats_revision FROM golf_rounds WHERE id = $1", [id])).rows[0].stats_revision, 0);
	}
	finally
	{
		console.error = originalError;
		await pool.query('DELETE FROM "user" WHERE id = $1', [user]);
		await pool.end();
	}
});
