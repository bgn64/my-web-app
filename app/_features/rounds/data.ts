import "server-only";

import { getDb } from "../../_lib/db";
import type { GolfRound } from "./types";
import { presentRound } from "./round-snapshot";
import type { StoredRound } from "./round-snapshot";

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
