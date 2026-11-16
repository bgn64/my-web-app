import "server-only";

import { getDb } from "../../_lib/db";
import { loadCourseScorecard } from "./course-hydration";
import type { Course, CourseCatalogPage } from "./types";

export async function getCourses(query = "", page = 1): Promise<CourseCatalogPage>
{
	if (query.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 100000)
	{
		throw new Error("Invalid course search.");
	}

	const search = `%${query.trim().replace(/[\\%_]/g, "\\$&")}%`;
	const result = await getDb().query<Course>(
		`SELECT c.id, c.name, c.location
     FROM courses c
     WHERE c.name ILIKE $1 ESCAPE '\\' OR c.location ILIKE $1 ESCAPE '\\'
     ORDER BY c.name, c.id LIMIT 50 OFFSET $2`, [search, (page - 1) * 50],
	);
	const count = await getDb().query<{
		total: number;
	}>(
		`SELECT count(*)::int AS total FROM courses
     WHERE name ILIKE $1 ESCAPE '\\' OR location ILIKE $1 ESCAPE '\\'`, [search],
	);

	return {
		courses: result.rows,
		total: count.rows[0].total,
		query,
		page,
	};
}

export async function requireCourseScorecard(courseId: number)
{
	return loadCourseScorecard(getDb(), courseId);
}
