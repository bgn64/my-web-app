import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getDb } from "./db";
import { loadCourseScorecard } from "./course-hydration";
import type { Course, CourseCatalogPage, GolfRound } from "./golf-types";
import { presentRound } from "./round-snapshot";
import type { StoredRound } from "./round-snapshot";

export async function getSession()
{
	return auth.api.getSession({
		headers: await headers(),
	});
}

export async function requireUser(next = "/play")
{
	const session = await getSession();

	if (!session)
	{
		redirect(`/sign-in?next=${encodeURIComponent(next)}`);
	}

	return session.user;
}

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

export async function getRounds(userId: string, active: boolean): Promise<GolfRound[]>
{
	const result = await getDb().query<StoredRound>(
		`SELECT r.id, r.snapshot, r.started_at, r.finished_at,
      COALESCE(json_agg(json_build_object('hole_number', s.hole_number, 'strokes', s.strokes)
        ORDER BY s.hole_number) FILTER (WHERE s.round_id IS NOT NULL), '[]') AS scores
     FROM golf_rounds r LEFT JOIN round_scores s ON s.round_id = r.id
     WHERE r.user_id = $1 AND (r.finished_at IS NULL) = $2
     GROUP BY r.id ORDER BY COALESCE(r.finished_at, r.started_at) DESC, r.id DESC`,
		[userId, active],
	);

	return result.rows.map(presentRound);
}

export async function getRound(userId: string, id: number): Promise<GolfRound | null>
{
	const result = await getDb().query<StoredRound>(
		`SELECT r.id, r.snapshot, r.started_at, r.finished_at,
      COALESCE(json_agg(json_build_object('hole_number', s.hole_number, 'strokes', s.strokes)
        ORDER BY s.hole_number) FILTER (WHERE s.round_id IS NOT NULL), '[]') AS scores
     FROM golf_rounds r LEFT JOIN round_scores s ON s.round_id = r.id
     WHERE r.user_id = $1 AND r.id = $2 GROUP BY r.id`,
		[userId, id],
	);

	return result.rows[0] ? presentRound(result.rows[0]) : null;
}

export function parseId(value: string): number | null
{
	if (!/^[1-9]\d*$/.test(value))
	{
		return null;
	}

	const id = Number(value);
	return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
