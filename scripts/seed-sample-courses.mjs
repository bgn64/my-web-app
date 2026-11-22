import { pathToFileURL } from "node:url";
import pg from "pg";
import { writeCourseScorecard } from "../app/_features/courses/course-hydration.ts";
import { normalizeCourseScorecard } from "../app/_features/courses/course-scorecard.ts";

const location = "Fictional practice course";
const frontNine = [4, 4, 3, 5, 4, 3, 4, 5, 4];
const backNine = [4, 5, 3, 4, 4, 5, 3, 4, 4];
const sampleCourses = [
	{
		id: "2f0c1e35-1039-46d3-b9c3-127c422626cc",
		name: "Sample: Pine Hollow (9 holes)",
		pars: frontNine,
	},
	{
		id: "edc91216-c493-4ce0-83ca-f0b56452ff81",
		name: "Sample: Meadow Ridge (18 holes)",
		pars: [...frontNine, ...backNine],
	},
];

function makePayload({ id, name, pars })
{
	return {
		id,
		course_name: name,
		holes: pars.length,
		par: pars.reduce((sum, par) => sum + par, 0),
		tees: [
			{
				tee_key: "blue-men",
				tee_name: "Blue",
				tee_color: "Blue",
				gender: "Male",
				course_rating: pars.length === 9 ? 35.8 : 71.8,
				slope: 126,
			},
			{
				tee_key: "red-women",
				tee_name: "Red",
				tee_color: "Red",
				gender: "Female",
				course_rating: pars.length === 9 ? 34.6 : 69.8,
				slope: 114,
			},
		],
		holes_data: pars.map((par, index) => ({
			number: index + 1,
			par,
			handicap_index: (index * 5) % pars.length + 1,
			yardages: {
				blue: (par - 3) * 170 + 160 + (index * 13) % 40,
				red: (par - 3) * 130 + 125 + (index * 11) % 30,
			},
		})),
	};
}

async function seedCourse(client, payload, card)
{
	const inserted = await client.query(
		`INSERT INTO courses (provider, external_id, name, location)
		 VALUES ('sample', $1, $2, $3) ON CONFLICT (provider, external_id) DO NOTHING RETURNING id`,
		[payload.id, card.name, location],
	);

	if (inserted.rowCount)
	{
		await writeCourseScorecard(client, { ...card, id: inserted.rows[0].id }, payload);
		return "inserted";
	}

	const existing = await client.query(
		`SELECT c.id, s.course_id IS NOT NULL AS "hasScorecard"
		 FROM courses c LEFT JOIN course_scorecards s ON s.course_id = c.id
		 WHERE c.provider = 'sample' AND c.external_id = $1`,
		[payload.id],
	);
	const { id, hasScorecard } = existing.rows[0];

	if (hasScorecard)
	{
		return "unchanged";
	}

	await writeCourseScorecard(client, { ...card, id }, payload);
	return "restored";
}

export async function seedSampleCourses(pool)
{
	const counts = {
		inserted: 0,
		restored: 0,
		unchanged: 0,
	};
	const client = await pool.connect();

	try
	{
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_xact_lock(928333)");

		for (const course of sampleCourses)
		{
			const payload = makePayload(course);
			const card = normalizeCourseScorecard(payload, course.id, 0);
			const outcome = await seedCourse(client, payload, card);
			counts[outcome]++;
		}

		await client.query("COMMIT");
		return counts;
	}
	catch (error)
	{
		await client.query("ROLLBACK");
		throw error;
	}
	finally
	{
		client.release();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	const pool = new pg.Pool();

	try
	{
		for (const key of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"])
		{
			if (!process.env[key])
			{
				throw new Error(`Missing database environment variable: ${key}`);
			}
		}

		console.log("Sample courses seeded:", await seedSampleCourses(pool));
	}
	catch (error)
	{
		console.error("Sample course seed failed:", error);
		process.exitCode = 1;
	}
	finally
	{
		await pool.end();
	}
}
