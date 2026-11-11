import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getDb } from "./db";

export type Yardage = { name: string; yards: number };
export type Hole = {
  hole_number: number;
  par: number;
  handicap: number;
  yardages: Yardage[];
  strokes: number | null;
};
export type GolfRound = {
  id: number;
  course_name: string;
  course_location: string;
  started_at: Date;
  finished_at: Date | null;
  holes: Hole[];
};
export type Course = { id: number; name: string; location: string; hole_count: number };

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser(next = "/play") {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session.user;
}

export async function getCourses(): Promise<Course[]> {
  const result = await getDb().query<Course>(
    `SELECT c.id, c.name, c.location, count(h.hole_number)::int AS hole_count
     FROM courses c JOIN course_holes h ON h.course_id = c.id
     GROUP BY c.id ORDER BY c.name`,
  );
  return result.rows;
}

export async function getRounds(userId: string, active: boolean): Promise<GolfRound[]> {
  const result = await getDb().query<GolfRound>(
    `SELECT r.id, r.course_name, r.course_location, r.started_at, r.finished_at,
      COALESCE(json_agg(json_build_object(
        'hole_number', h.hole_number, 'par', h.par, 'handicap', h.handicap,
        'yardages', h.yardages, 'strokes', h.strokes
      ) ORDER BY h.hole_number) FILTER (WHERE h.round_id IS NOT NULL), '[]') AS holes
     FROM golf_rounds r LEFT JOIN round_holes h ON h.round_id = r.id
     WHERE r.user_id = $1 AND (r.finished_at IS NULL) = $2
     GROUP BY r.id ORDER BY COALESCE(r.finished_at, r.started_at) DESC, r.id DESC`,
    [userId, active],
  );
  return result.rows;
}

export async function getRound(userId: string, id: number): Promise<GolfRound | null> {
  const result = await getDb().query<GolfRound>(
    `SELECT r.id, r.course_name, r.course_location, r.started_at, r.finished_at,
      COALESCE(json_agg(json_build_object(
        'hole_number', h.hole_number, 'par', h.par, 'handicap', h.handicap,
        'yardages', h.yardages, 'strokes', h.strokes
      ) ORDER BY h.hole_number) FILTER (WHERE h.round_id IS NOT NULL), '[]') AS holes
     FROM golf_rounds r LEFT JOIN round_holes h ON h.round_id = r.id
     WHERE r.user_id = $1 AND r.id = $2 GROUP BY r.id`,
    [userId, id],
  );
  return result.rows[0] ?? null;
}

export function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
