import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { roundSnapshot } from "./fixtures/course.mjs";

test("catalog identity and round constraints", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const client = await pool.connect();

	try
	{
		await client.query("BEGIN");
		const fictional = await client.query(
			"SELECT id FROM courses WHERE (name = 'Pine Hollow' AND location = 'Fictional course · 9 holes') OR (name = 'Meadow Ridge' AND location = 'Fictional course · 18 holes')",
		);
		assert.equal(fictional.rowCount, 0);
		await client.query("INSERT INTO courses (name, location) VALUES ('Duplicate name', 'A'), ('Duplicate name', 'B')");

		const id = randomUUID();
		await client.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [id, "Test golfer", `${id}@example.test`]);
		const round = await client.query(
			"INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2) RETURNING id",
			[id, JSON.stringify(roundSnapshot())],
		);
		await client.query("SAVEPOINT constraint_check");
		await assert.rejects(
			client.query("INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2)", [id, JSON.stringify(roundSnapshot())]),
			{
				code: "23505",
			},
		);
		await client.query("ROLLBACK TO SAVEPOINT constraint_check");
		await client.query(
			"INSERT INTO round_scores (round_id, hole_number) VALUES ($1, 1)",
			[round.rows[0].id],
		);
		await client.query("SAVEPOINT score_check");
		await assert.rejects(
			client.query("UPDATE round_scores SET strokes = 0 WHERE round_id = $1", [round.rows[0].id]),
			{
				code: "23514",
			},
		);
		await client.query("ROLLBACK TO SAVEPOINT score_check");
		const score = await client.query("SELECT strokes FROM round_scores WHERE round_id = $1", [round.rows[0].id]);
		assert.equal(score.rows[0].strokes, null);
	}
	finally
	{
		await client.query("ROLLBACK");
		client.release();
		await pool.end();
	}
});

test("concurrent starts cannot create two active rounds", {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
}, async () =>
{
	const pool = new pg.Pool();
	const first = await pool.connect();
	const second = await pool.connect();
	const id = randomUUID();

	try
	{
		await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [id, "Concurrent test", `${id}@example.test`]);
		await first.query("BEGIN");
		await second.query("BEGIN");
		await first.query("INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2)", [id, JSON.stringify(roundSnapshot())]);
		const competingInsert = assert.rejects(
			second.query("INSERT INTO golf_rounds (user_id, snapshot) VALUES ($1, $2)", [id, JSON.stringify(roundSnapshot())]),
			{
				code: "23505",
			},
		);
		await first.query("COMMIT");
		await competingInsert;
		await second.query("ROLLBACK");
	}
	finally
	{
		await first.query("ROLLBACK");
		await second.query("ROLLBACK");
		await pool.query('DELETE FROM "user" WHERE id = $1', [id]);
		first.release();
		second.release();
		await pool.end();
	}
});
