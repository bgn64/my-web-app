import "server-only";

import type { PoolClient } from "pg";
import { getDb } from "../../_lib/db";
import type { RoundStat, StatDefinition, StatsSnapshot } from "./contracts";

type Queryable = Pick<PoolClient, "query">;

export async function readRoundStats(db: Queryable, userId: string, roundId: number): Promise<StatsSnapshot | null>
{
	const round = await db.query<{ stats_revision: number }>(
		"SELECT stats_revision FROM golf_rounds WHERE id = $1 AND user_id = $2",
		[roundId, userId],
	);

	if (!round.rowCount)
	{
		return null;
	}

	const result = await db.query<RoundStat>(
		`SELECT s.id, s.name, s.kind, s.source_definition_id,
			COALESCE(json_agg(json_build_object('hole', v.hole_number, 'value',
				CASE WHEN v.kind = 'number' THEN to_json(v.number_value) ELSE to_json(v.boolean_value) END)
				ORDER BY v.hole_number) FILTER (WHERE v.hole_number IS NOT NULL), '[]'::json) AS values
		 FROM round_stats s LEFT JOIN round_stat_values v ON v.round_id = s.round_id AND v.round_stat_id = s.id
		 WHERE s.round_id = $1 GROUP BY s.id ORDER BY s.position, s.id`,
		[roundId],
	);

	return {
		revision: round.rows[0].stats_revision,
		stats: result.rows,
	};
}

export async function readLibrary(db: Queryable, userId: string): Promise<StatDefinition[]>
{
	const result = await db.query<StatDefinition>(
		"SELECT id, name, kind FROM stat_definitions WHERE user_id = $1 ORDER BY id",
		[userId],
	);
	return result.rows;
}

export async function getRoundStats(userId: string, roundId: number)
{
	return readRoundStats(getDb(), userId, roundId);
}
