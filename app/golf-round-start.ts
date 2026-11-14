import type { Pool } from "pg";
import { CourseDetailsError } from "./course-scorecard.ts";
import type { CourseScorecard } from "./golf-types";
import { parseRoundSnapshot } from "./round-snapshot.ts";

export async function createScorecardRound(pool: Pool, userId: string, card: CourseScorecard): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new CourseDetailsError("Your session has expired. Please sign in again.");
    const active = await client.query(
      "SELECT id FROM golf_rounds WHERE user_id = $1 AND finished_at IS NULL", [userId],
    );
    if (active.rowCount) throw new CourseDetailsError("You already have an active round. Resume or discard it first.");
    const course = await client.query<{ name: string; location: string }>(
      "SELECT name, location FROM courses WHERE id = $1 FOR SHARE", [card.id],
    );
    if (!course.rowCount) throw new CourseDetailsError("Course not found. Please choose another course.");
    const snapshot = parseRoundSnapshot({ version: 1, course: course.rows[0], scorecard: card });
    const created = await client.query<{ id: number }>(
      `INSERT INTO golf_rounds (user_id, course_id, snapshot)
       VALUES ($1,$2,$3) RETURNING id`, [userId, card.id, JSON.stringify(snapshot)],
    );
    const id = created.rows[0].id;
    for (const hole of snapshot.scorecard.holes) {
      await client.query(
        "INSERT INTO round_scores (round_id, hole_number) VALUES ($1,$2)",
        [id, hole.hole_number],
      );
    }
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
