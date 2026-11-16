import type { Pool, PoolClient } from "pg";
import { CourseDetailsError, normalizeCourseScorecard } from "./course-scorecard.ts";
import type { CourseScorecard, PhysicalTee, ScorecardHole } from "./types";

const LOCK_NAMESPACE = 928331;

async function cached(client: PoolClient, id: number): Promise<CourseScorecard | null>
{
	const header = await client.query<Omit<CourseScorecard, "holes" | "tees">>(
		`SELECT c.id, c.external_id::text AS "externalId", c.name, c.location,
      s.hole_count AS "holeCount", s.total_par AS "totalPar", s.warnings
     FROM courses c JOIN course_scorecards s ON s.course_id = c.id WHERE c.id = $1`, [id],
	);

	if (!header.rowCount)
	{
		return null;
	}

	const holes = await client.query<ScorecardHole>(
		`SELECT h.hole_number, h.par, h.handicap,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t.name, 'yards', y.yards) ORDER BY t.sort_order)
        FROM course_yardages y JOIN course_tees t ON t.id = y.tee_id
        WHERE y.course_id = h.course_id AND y.hole_number = h.hole_number AND t.playable), '[]') AS yardages
     FROM course_holes h WHERE h.course_id = $1 ORDER BY h.hole_number`, [id],
	);
	const tees = await client.query<PhysicalTee>(
		`SELECT t.tee_key AS key, t.name, t.playable, t.total_yards AS "totalYards",
      COALESCE((SELECT jsonb_object_agg(y.hole_number::text, y.yards)
        FROM course_yardages y WHERE y.tee_id = t.id), '{}') AS yardages,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'key', r.provider_key, 'gender', r.gender, 'color', r.color,
        'courseRating', r.course_rating, 'slope', r.slope, 'par', r.par,
        'reportedYards', r.reported_yards) ORDER BY r.provider_key COLLATE "C")
        FROM course_tee_ratings r WHERE r.tee_id = t.id), '[]') AS ratings
     FROM course_tees t WHERE t.course_id = $1 ORDER BY t.sort_order`, [id],
	);

	return {
		...header.rows[0],
		holes: holes.rows,
		tees: tees.rows,
	};
}

/** Replaces scorecard details atomically, retaining rollback and commit in one scope. */
async function persist(client: PoolClient, card: CourseScorecard, payload: unknown)
{
	await client.query("BEGIN");

	try
	{
		await client.query("DELETE FROM course_tees WHERE course_id = $1", [card.id]);
		await client.query("DELETE FROM course_holes WHERE course_id = $1", [card.id]);

		for (const hole of card.holes)
		{
			await client.query(
				"INSERT INTO course_holes (course_id, hole_number, par, handicap) VALUES ($1,$2,$3,$4)",
				[card.id, hole.hole_number, hole.par, hole.handicap],
			);
		}

		for (const [index, tee] of card.tees.entries())
		{
			const row = await client.query<{
				id: number;
			}>(
				`INSERT INTO course_tees (course_id, name, sort_order, tee_key, playable, total_yards)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
				[card.id, tee.name, index + 1, tee.key, tee.playable, tee.totalYards],
			);
			const teeId = row.rows[0].id;

			for (const rating of tee.ratings)
			{
				await client.query(
					`INSERT INTO course_tee_ratings
           (tee_id, provider_key, gender, color, course_rating, slope, par, reported_yards)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					[
						teeId, rating.key, rating.gender, rating.color,
						rating.courseRating, rating.slope, rating.par, rating.reportedYards,
					],
				);
			}

			for (const [hole, yards] of Object.entries(tee.yardages))
			{
				await client.query(
					"INSERT INTO course_yardages (course_id, hole_number, tee_id, yards) VALUES ($1,$2,$3,$4)",
					[card.id, Number(hole), teeId, yards],
				);
			}
		}

		await client.query(
			`INSERT INTO course_scorecards (course_id, hole_count, total_par, payload, warnings)
       VALUES ($1,$2,$3,$4,$5)`,
			[card.id, card.holeCount, card.totalPar, JSON.stringify(payload), JSON.stringify(card.warnings)],
		);
		await client.query("COMMIT");
	}
	catch (error)
	{
		await client.query("ROLLBACK");
		throw error;
	}
}

/** Loads a cached scorecard or serializes its hydration with an advisory lock. */
export async function loadCourseScorecard(
	pool: Pool, courseId: number, fetchDetails: typeof fetch = fetch,
): Promise<CourseScorecard>
{
	const client = await pool.connect();
	let locked = false;
	let destroy = false;

	try
	{
		const hit = await cached(client, courseId);

		if (hit)
		{
			return hit;
		}

		await client.query("SET lock_timeout = '15s'");
		await client.query("SELECT pg_advisory_lock($1::int, $2::int)", [LOCK_NAMESPACE, courseId]);
		locked = true;
		const sharedHit = await cached(client, courseId);

		if (sharedHit)
		{
			return sharedHit;
		}

		const course = await client.query<{
			provider: string | null;
			external_id: string | null;
			name: string;
			location: string;
		}>(
			"SELECT provider, external_id::text, name, location FROM courses WHERE id = $1", [courseId],
		);

		if (!course.rowCount)
		{
			throw new CourseDetailsError("Course not found. Please choose another course.");
		}

		const { provider, external_id: externalId } = course.rows[0];

		if (provider !== "opengolf" ||
			!externalId ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId))
		{
			throw new CourseDetailsError("This course has no supported scorecard provider.");
		}

		let response: Response;

		try
		{
			response = await fetchDetails(`https://api.opengolfapi.org/api/v1/courses/${externalId}`, {
				cache: "no-store",
				signal: AbortSignal.timeout(10000),
			});
		}
		catch (error)
		{
			console.error("Course detail network request failed:", {
				courseId,
				error,
			});
			throw new CourseDetailsError("Could not reach the course provider. Please retry.");
		}

		if (!response.ok)
		{
			console.error("Course detail provider HTTP error:", {
				courseId,
				status: response.status,
			});
			let message = "The course provider could not supply a scorecard. Please retry.";

			if (response.status === 404)
			{
				message = "The provider could not find this course. Please retry or choose another course.";
			}
			else if (response.status === 429)
			{
				message = "The course provider is busy. Please retry shortly.";
			}

			throw new CourseDetailsError(message);
		}

		let payload: unknown;

		try
		{
			payload = await response.json();
		}
		catch (error)
		{
			console.error("Course detail response was not JSON:", {
				courseId,
				error,
			});
			throw new CourseDetailsError("The provider returned an invalid scorecard. Please retry.");
		}

		const card = normalizeCourseScorecard(payload, externalId, courseId);
		card.name = course.rows[0].name;
		card.location = course.rows[0].location;

		if (card.warnings.length)
		{
			console.warn("Course scorecard diagnostics:", {
				courseId,
				warnings: card.warnings,
			});
		}

		await persist(client, card, payload);
		return card;
	}
	catch (error)
	{
		if (error instanceof CourseDetailsError)
		{
			throw error;
		}

		console.error("Could not hydrate course scorecard:", {
			courseId,
			error,
		});
		throw new CourseDetailsError("Could not prepare or save the course scorecard. Please retry.");
	}
	finally
	{
		try
		{
			if (locked)
			{
				await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [LOCK_NAMESPACE, courseId]);
			}

			await client.query("RESET lock_timeout");
		}
		catch (error)
		{
			destroy = true;
			console.error("Could not release course hydration connection:", {
				courseId,
				error,
			});
		}

		client.release(destroy);
	}
}
