import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

test("seed cards and round constraints", { skip: process.env.FAIRWAY_TEST_DB !== "1" }, async () => {
  const pool = new pg.Pool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cards = await client.query(`
      SELECT c.name, count(DISTINCT h.hole_number)::int AS holes,
        count(DISTINCT t.id)::int AS tees, count(DISTINCT (y.hole_number, y.tee_id))::int AS yardages
      FROM courses c JOIN course_holes h ON h.course_id = c.id
      JOIN course_tees t ON t.course_id = c.id
      JOIN course_yardages y ON y.course_id = c.id AND y.hole_number = h.hole_number AND y.tee_id = t.id
      WHERE c.name IN ('Pine Hollow', 'Meadow Ridge') GROUP BY c.name ORDER BY c.name`);
    assert.deepEqual(cards.rows, [
      { name: "Meadow Ridge", holes: 18, tees: 3, yardages: 54 },
      { name: "Pine Hollow", holes: 9, tees: 3, yardages: 27 },
    ]);

    const id = randomUUID();
    await client.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [id, "Test golfer", `${id}@example.test`]);
    const round = await client.query(
      "INSERT INTO golf_rounds (user_id, course_name, course_location) VALUES ($1, 'Test', 'Test') RETURNING id",
      [id],
    );
    await client.query("SAVEPOINT constraint_check");
    await assert.rejects(
      client.query("INSERT INTO golf_rounds (user_id, course_name, course_location) VALUES ($1, 'Test', 'Test')", [id]),
      { code: "23505" },
    );
    await client.query("ROLLBACK TO SAVEPOINT constraint_check");
    await client.query(
      "INSERT INTO round_holes (round_id, hole_number, par, handicap, yardages) VALUES ($1, 1, 4, 1, '[]')",
      [round.rows[0].id],
    );
    await client.query("SAVEPOINT score_check");
    await assert.rejects(
      client.query("UPDATE round_holes SET strokes = 0 WHERE round_id = $1", [round.rows[0].id]),
      { code: "23514" },
    );
    await client.query("ROLLBACK TO SAVEPOINT score_check");
    const score = await client.query("SELECT strokes FROM round_holes WHERE round_id = $1", [round.rows[0].id]);
    assert.equal(score.rows[0].strokes, null);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});

test("concurrent starts cannot create two active rounds", { skip: process.env.FAIRWAY_TEST_DB !== "1" }, async () => {
  const pool = new pg.Pool();
  const first = await pool.connect();
  const second = await pool.connect();
  const id = randomUUID();
  try {
    await pool.query('INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)', [id, "Concurrent test", `${id}@example.test`]);
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query("INSERT INTO golf_rounds (user_id, course_name, course_location) VALUES ($1, 'Test', 'Test')", [id]);
    const competingInsert = assert.rejects(
      second.query("INSERT INTO golf_rounds (user_id, course_name, course_location) VALUES ($1, 'Test', 'Test')", [id]),
      { code: "23505" },
    );
    await first.query("COMMIT");
    await competingInsert;
    await second.query("ROLLBACK");
  } finally {
    await first.query("ROLLBACK");
    await second.query("ROLLBACK");
    await pool.query('DELETE FROM "user" WHERE id = $1', [id]);
    first.release();
    second.release();
    await pool.end();
  }
});
