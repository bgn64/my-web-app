import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadCourseScorecard } from "../app/_features/courses/course-hydration.ts";
import { createScorecardRound } from "../app/_features/rounds/golf-round-start.ts";
import { coursePayload } from "./fixtures/course.mjs";
import { presentRound } from "../app/_features/rounds/round-snapshot.ts";
import { seedSampleCourses } from "../scripts/seed-sample-courses.mjs";

const options = {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
};

test("sample courses seed once and start complete rounds without provider requests", options, async () =>
{
	const pool = new pg.Pool();
	const user = randomUUID();

	try
	{
		const existing = await pool.query("SELECT id FROM courses WHERE provider = 'sample'");
		assert.equal(existing.rowCount, 0, "Use a fresh dedicated test database without sample courses");

		try
		{
			await pool.query(
				'INSERT INTO "user" (id,name,email) VALUES ($1,$2,$3)',
				[user, "Sample course test", `${user}@example.test`],
			);
			assert.deepEqual(await seedSampleCourses(pool), { inserted: 2, restored: 0, unchanged: 0 });
			assert.deepEqual(await seedSampleCourses(pool), { inserted: 0, restored: 0, unchanged: 2 });
			const courses = await pool.query(
				`SELECT c.id, s.hole_count FROM courses c JOIN course_scorecards s ON s.course_id = c.id
				 WHERE c.provider = 'sample' ORDER BY s.hole_count`,
			);
			assert.deepEqual(courses.rows.map((row) => row.hole_count), [9, 18]);
			const [first] = courses.rows;
			await pool.query("DELETE FROM course_scorecards WHERE course_id = $1", [first.id]);
			assert.deepEqual(await seedSampleCourses(pool), { inserted: 0, restored: 1, unchanged: 1 });

			for (const { id, hole_count: holeCount } of courses.rows)
			{
				const card = await loadCourseScorecard(pool, id, () => assert.fail("Sample must not fetch"));
				assert.equal(card.holes.length, holeCount);
				assert.ok(card.holes.every((hole) => hole.yardages.length === 2));
				assert.ok(card.tees.every((tee) => tee.playable && tee.ratings.length > 0));
				const round = await createScorecardRound(pool, user, card);
				const scores = await pool.query("SELECT strokes FROM round_scores WHERE round_id = $1", [round]);
				assert.equal(scores.rowCount, holeCount);
				assert.ok(scores.rows.every((row) => row.strokes === null));
				await pool.query("DELETE FROM golf_rounds WHERE id = $1", [round]);
			}
		}
		finally
		{
			await pool.query('DELETE FROM "user" WHERE id = $1', [user]);
			await pool.query("DELETE FROM courses WHERE provider = 'sample'");
		}
	}
	finally
	{
		await pool.end();
	}
});

async function fixture(run)
{
	const pool = new pg.Pool();
	const externalId = randomUUID();
	const row = await pool.query(
		"INSERT INTO courses (provider, external_id, name, location) VALUES ('opengolf',$1,'Hydration test','Test') RETURNING id",
		[externalId],
	);
	const user = randomUUID();
	await pool.query(
		'INSERT INTO "user" (id,name,email) VALUES ($1,$2,$3)',
		[user, "Hydration test", `${user}@example.test`],
	);
	const id = row.rows[0].id;
	const payload = () => ({
		...coursePayload(),
		id: externalId,
	});

	try
	{
		await run({
			pool,
			id,
			user,
			payload,
		});
	}
	finally
	{
		await pool.query('DELETE FROM "user" WHERE id = $1', [user]);
		await pool.query("DELETE FROM courses WHERE id = $1", [id]);
		await pool.end();
	}
}

test("successful concurrent hydrations persist once and indefinite hits avoid HTTP", options, async () =>
{
	await fixture(async ({ pool, id, user, payload }) =>
	{
		let calls = 0;
		const fetchDetails = async (url, init) =>
		{
			calls++;
			assert.match(url, /^https:\/\/api\.opengolfapi\.org\/api\/v1\/courses\/[0-9a-f-]+$/);
			assert.equal(init.cache, "no-store");
			await new Promise((resolve) => setTimeout(resolve, 30));
			return Response.json(payload());
		};
		const [first, second] = await Promise.all([
			loadCourseScorecard(pool, id, fetchDetails),
			loadCourseScorecard(pool, id, fetchDetails),
		]);
		assert.equal(calls, 1);
		assert.deepEqual(first, second);
		assert.equal(first.name, "Hydration test");
		assert.equal(first.location, "Test");
		await pool.query("UPDATE course_scorecards SET fetched_at = '2000-01-01' WHERE course_id = $1", [id]);
		await loadCourseScorecard(pool, id, () =>
		{
			throw new Error("Cache must not fetch");
		});
		const round = await createScorecardRound(pool, user, first);
		const snapshot = (await pool.query(
			"SELECT snapshot FROM golf_rounds WHERE id = $1", [round],
		)).rows[0].snapshot;
		assert.deepEqual(snapshot, {
			version: 1,
			course: {
				name: "Hydration test",
				location: "Test",
			},
			scorecard: {
				holeCount: first.holeCount,
				totalPar: first.totalPar,
				holes: first.holes,
				tees: first.tees,
			},
		});
		assert.equal((await pool.query("SELECT 1 FROM round_scores WHERE round_id = $1", [round])).rowCount, 9);
		await pool.query("UPDATE course_holes SET par = 5 WHERE course_id = $1", [id]);
		assert.deepEqual(
			(await pool.query("SELECT snapshot FROM golf_rounds WHERE id = $1", [round])).rows[0].snapshot, snapshot,
		);
		const ratings = await pool.query(
			"SELECT count(*)::int AS count FROM course_tee_ratings r JOIN course_tees t ON t.id=r.tee_id WHERE t.course_id=$1", [id],
		);
		assert.equal(ratings.rows[0].count, 3);
		await assert.rejects(createScorecardRound(pool, user, first), /already have an active round/);
	});
});

test("HTTP, malformed, incomplete and network failures never cache or create a round; retry is immediate", options, async () =>
{
	await fixture(async ({ pool, id, user, payload }) =>
	{
		const invalid = payload();
		invalid.holes_data.pop();
		const failures = [
			async () => new Response("", {
				status: 404,
			}),
			async () => new Response("", {
				status: 429,
			}),
			async () => new Response("", {
				status: 500,
			}),
			async () => new Response("{"),
			async () => Response.json(invalid),
			async () =>
			{
				throw new DOMException("Timed out", "TimeoutError");
			},
		];

		for (const fetchDetails of failures)
		{
			await assert.rejects(async () =>
			{
				const card = await loadCourseScorecard(pool, id, fetchDetails);
				await createScorecardRound(pool, user, card);
			});
			assert.equal((await pool.query("SELECT 1 FROM course_scorecards WHERE course_id=$1", [id])).rowCount, 0);
			assert.equal((await pool.query("SELECT 1 FROM course_holes WHERE course_id=$1", [id])).rowCount, 0);
			assert.equal((await pool.query("SELECT 1 FROM golf_rounds WHERE user_id=$1", [user])).rowCount, 0);
		}

		const card = await loadCourseScorecard(pool, id, async () => Response.json(payload()));
		assert.equal(card.holes.length, 9);
	});
});

test("database write failure rolls back partial details and permits retry", options, async () =>
{
	await fixture(async ({ pool, id, payload }) =>
	{
		await pool.query(`ALTER TABLE course_scorecards ADD CONSTRAINT test_reject_${id} CHECK (course_id <> ${id})`);

		try
		{
			await assert.rejects(loadCourseScorecard(pool, id, async () => Response.json(payload())), /prepare or save/);

			for (const table of ["course_holes", "course_tees", "course_scorecards"])
			{
				assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE course_id=$1`, [id])).rowCount, 0);
			}
		}
		finally
		{
			await pool.query(`ALTER TABLE course_scorecards DROP CONSTRAINT test_reject_${id}`);
		}

		await loadCourseScorecard(pool, id, async () => Response.json(payload()));
	});
});

test("competing starts snapshot only one active round", options, async () =>
{
	await fixture(async ({ pool, id, user, payload }) =>
	{
		const card = await loadCourseScorecard(pool, id, async () => Response.json(payload()));
		const results = await Promise.allSettled([
			createScorecardRound(pool, user, card),
			createScorecardRound(pool, user, card),
		]);
		assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
		assert.equal((await pool.query("SELECT id FROM golf_rounds WHERE user_id=$1", [user])).rowCount, 1);
	});
});

test("extra holes stay in the raw cache but not the complete golf snapshot; catalog deletion preserves scores", options, async () =>
{
	await fixture(async ({ pool, id, user, payload }) =>
	{
		const raw = payload();
		raw.holes_data.push({
			number: 37,
			par: 4,
		});
		delete raw.holes_data[0].yardages.red;
		const card = await loadCourseScorecard(pool, id, async () => Response.json(raw));
		assert.equal(card.tees[1].playable, false);
		assert.deepEqual(
			(await pool.query("SELECT payload FROM course_scorecards WHERE course_id=$1", [id])).rows[0].payload, raw,
		);
		await pool.query("UPDATE courses SET name='Renamed', location='New location' WHERE id=$1", [id]);
		const hit = await loadCourseScorecard(pool, id, () =>
		{
			throw new Error("Must use cache");
		});
		assert.equal(hit.name, "Renamed");
		const round = await createScorecardRound(pool, user, card);
		const snapshot = (await pool.query("SELECT snapshot FROM golf_rounds WHERE id=$1", [round])).rows[0].snapshot;
		assert.equal(snapshot.course.name, "Renamed");
		assert.deepEqual(snapshot.scorecard.tees, card.tees);
		assert.equal(snapshot.scorecard.holes.length, 9);
		assert.deepEqual(Object.keys(snapshot.scorecard).sort(), ["holeCount", "holes", "tees", "totalPar"]);
		await pool.query("UPDATE round_scores SET strokes=3 WHERE round_id=$1 AND hole_number=1", [round]);
		await pool.query("DELETE FROM course_scorecards WHERE course_id=$1", [id]);
		await pool.query(
			"UPDATE course_tee_ratings SET slope=130 WHERE tee_id IN (SELECT id FROM course_tees WHERE course_id=$1)", [id],
		);
		await pool.query("DELETE FROM courses WHERE id=$1", [id]);

		for (const table of ["course_holes", "course_tees", "course_yardages", "course_scorecards"])
		{
			assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE course_id=$1`, [id])).rowCount, 0);
		}

		const row = (await pool.query(
			`SELECT r.*, (SELECT json_agg(s ORDER BY hole_number) FROM round_scores s WHERE s.round_id=r.id) AS scores
         FROM golf_rounds r WHERE id=$1`, [round],
		)).rows[0];
		assert.equal(row.course_id, null);
		assert.deepEqual(row.snapshot, snapshot);
		const displayed = presentRound(row);
		assert.equal(displayed.course_name, "Renamed");
		assert.equal(displayed.holes[0].strokes, 3);
		assert.equal(displayed.holes[1].strokes, null);
		assert.deepEqual(displayed.snapshot.scorecard.tees, card.tees);
		await pool.query("UPDATE round_scores SET strokes=NULL WHERE round_id=$1 AND hole_number=1", [round]);
		assert.equal(
			(await pool.query("SELECT strokes FROM round_scores WHERE round_id=$1 AND hole_number=1", [round])).rows[0].strokes,
			null,
		);
		await pool.query("UPDATE golf_rounds SET finished_at=CURRENT_TIMESTAMP WHERE id=$1", [round]);
		assert.deepEqual(
			(await pool.query("SELECT snapshot FROM golf_rounds WHERE id=$1", [round])).rows[0].snapshot, snapshot,
		);
		await pool.query("DELETE FROM golf_rounds WHERE id=$1", [round]);
		assert.equal((await pool.query("SELECT 1 FROM round_scores WHERE round_id=$1", [round])).rowCount, 0);
	});
});

test("round snapshot writes are atomic on score persistence failure", options, async () =>
{
	await fixture(async ({ pool, id, user, payload }) =>
	{
		const card = await loadCourseScorecard(pool, id, async () => Response.json(payload()));
		const failingPool = {
			async connect()
			{
				const client = await pool.connect();
				return {
					query(sql, values)
					{
						if (sql.startsWith("INSERT INTO round_scores") && values[1] === 9)
						{
							return client.query(
								"INSERT INTO round_scores (round_id, hole_number, strokes) VALUES ($1,$2,0)", values,
							);
						}

						return client.query(sql, values);
					},
					release()
					{
						client.release();
					},
				};
			},
		};
		await assert.rejects(createScorecardRound(failingPool, user, card), {
			code: "23514",
		});
		assert.equal((await pool.query("SELECT 1 FROM golf_rounds WHERE user_id=$1", [user])).rowCount, 0);
		await createScorecardRound(pool, user, card);
	});
});
