import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { roundSnapshot } from "./fixtures/course.mjs";

test("stat constraints, independent copies, and cascades", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const client = await pool.connect();

	async function rejectsConstraint(sql, values, code)
	{
		await client.query("SAVEPOINT stat_constraint");
		await assert.rejects(client.query(sql, values), { code });
		await client.query("ROLLBACK TO SAVEPOINT stat_constraint");
	}

	try
	{
		await client.query("BEGIN");
		const userId = randomUUID();
		await client.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [
			userId, "Stat test", `${userId}@example.test`,
		]);
		const round = await client.query(
			"INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2) RETURNING id, stats_revision",
			[userId, JSON.stringify(roundSnapshot())],
		);
		const roundId = round.rows[0].id;
		assert.equal(round.rows[0].stats_revision, 0);
		await client.query("INSERT INTO round_scores (round_id, hole_number) VALUES ($1, 1), ($1, 2)", [roundId]);
		const definition = await client.query(
			"INSERT INTO stat_definitions (user_id, name, kind) VALUES ($1, 'Putts', 'number') RETURNING id",
			[userId],
		);
		await rejectsConstraint(
			"INSERT INTO stat_definitions (user_id, name, kind) VALUES ($1, $2, 'number')",
			[userId, "\u00a0Putts"],
			"23514",
		);
		const stat = await client.query(
			"INSERT INTO round_stats (round_id, name, kind, position) VALUES ($1, 'Putts', 'number', 0) RETURNING id",
			[roundId],
		);
		const statId = stat.rows[0].id;
		await rejectsConstraint(
			"UPDATE stat_definitions SET kind = 'boolean' WHERE id = $1", [definition.rows[0].id], "23514",
		);
		await rejectsConstraint("UPDATE round_stats SET name = 'Changed' WHERE id = $1", [statId], "23514");
		await rejectsConstraint("UPDATE round_stats SET kind = 'boolean' WHERE id = $1", [statId], "23514");
		const insertValue = `INSERT INTO round_stat_values
			(round_id, round_stat_id, hole_number, kind, number_value, boolean_value)
			VALUES ($1, $2, $3, $4, $5, $6)`;
		await client.query(insertValue, [roundId, statId, 1, "number", 0, null]);
		await rejectsConstraint(insertValue, [roundId, statId, 1, "number", 100, null], "23514");
		await rejectsConstraint(insertValue, [roundId, statId, 3, "number", 1, null], "23503");
		await rejectsConstraint(insertValue, [roundId, statId, 2, "boolean", null, false], "23503");
		await client.query("UPDATE stat_definitions SET name = 'Renamed' WHERE id = $1", [definition.rows[0].id]);
		await client.query("DELETE FROM stat_definitions WHERE id = $1", [definition.rows[0].id]);
		const copy = await client.query(
			"SELECT s.name, v.number_value FROM round_stats s JOIN round_stat_values v ON v.round_stat_id = s.id WHERE s.id = $1",
			[statId],
		);
		assert.deepEqual(copy.rows[0], { name: "Putts", number_value: 0 });
		await client.query("DELETE FROM round_stats WHERE id = $1", [statId]);
		const values = await client.query("SELECT 1 FROM round_stat_values WHERE round_stat_id = $1", [statId]);
		assert.equal(values.rowCount, 0);
	}
	finally
	{
		await client.query("ROLLBACK");
		client.release();
		await pool.end();
	}
});

test("additive source migration preserves old copies and clears deleted references", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const client = await pool.connect();

	try
	{
		await client.query("BEGIN");
		await client.query("CREATE TEMP TABLE stat_definitions (id INTEGER PRIMARY KEY)");
		await client.query(`CREATE TEMP TABLE round_stats (
			id INTEGER PRIMARY KEY, round_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL
		)`);
		await client.query("INSERT INTO round_stats VALUES (1, 1, 'Existing copy', 0)");
		const migration = readFileSync(new URL("../migrations/1793745600004-round-stat-source.sql", import.meta.url), "utf8");
		await client.query(migration.split("-- Down Migration")[0]);
		assert.deepEqual((await client.query("SELECT * FROM round_stats")).rows[0], {
			id: 1, round_id: 1, name: "Existing copy", position: 0, source_definition_id: null,
		});
		await client.query("INSERT INTO stat_definitions VALUES (7)");
		await client.query("UPDATE round_stats SET source_definition_id = 7");
		await client.query("SAVEPOINT duplicate_source");
		await assert.rejects(client.query(
			"INSERT INTO round_stats VALUES (2, 1, 'Duplicate', 1, 7)",
		), { code: "23505" });
		await client.query("ROLLBACK TO SAVEPOINT duplicate_source");
		await client.query("DELETE FROM stat_definitions WHERE id = 7");
		assert.equal((await client.query("SELECT source_definition_id FROM round_stats")).rows[0].source_definition_id, null);
		assert.equal((await client.query("SELECT name FROM round_stats")).rows[0].name, "Existing copy");
	}
	finally
	{
		await client.query("ROLLBACK");
		client.release();
		await pool.end();
	}
});
