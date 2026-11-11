"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { getSession, parseId } from "./golf-data";

type Result = { ok: true; roundId?: number } | { ok: false; error: string };

async function userId() {
  const session = await getSession();
  return session?.user.id ?? null;
}

function invalidate(roundId?: number) {
  revalidatePath("/play");
  revalidatePath("/rounds");
  if (roundId) {
    revalidatePath(`/rounds/${roundId}`);
    revalidatePath(`/rounds/${roundId}/scorecard`);
  }
}

export async function startRound(courseId: string): Promise<Result> {
  const user = await userId();
  const course = parseId(courseId);
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!course) return { ok: false, error: "Invalid course." };

  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [user]);
    const active = await client.query("SELECT id FROM golf_rounds WHERE user_id = $1 AND finished_at IS NULL", [user]);
    if (active.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "You already have an active round. Resume or discard it first." };
    }

    const card = await client.query<{ hole_count: number; tee_count: number; yardage_count: number; max_hole: number | null; max_handicap: number | null }>(
      `SELECT (SELECT count(*)::int FROM course_holes WHERE course_id = $1) AS hole_count,
        (SELECT count(*)::int FROM course_tees WHERE course_id = $1) AS tee_count,
        (SELECT count(*)::int FROM course_yardages WHERE course_id = $1) AS yardage_count,
        (SELECT max(hole_number)::int FROM course_holes WHERE course_id = $1) AS max_hole,
        (SELECT max(handicap)::int FROM course_holes WHERE course_id = $1) AS max_handicap`,
      [course],
    );
    const { hole_count, tee_count, yardage_count, max_hole, max_handicap } = card.rows[0];
    if (![9, 18].includes(hole_count) || max_hole !== hole_count || max_handicap !== hole_count ||
        tee_count < 1 || yardage_count !== hole_count * tee_count) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This course does not have a complete scorecard." };
    }
    const created = await client.query<{ id: number }>(
      `INSERT INTO golf_rounds (user_id, course_id, course_name, course_location)
       SELECT $1, id, name, location FROM courses WHERE id = $2 RETURNING id`,
      [user, course],
    );
    if (!created.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Course not found." };
    }
    const roundId = created.rows[0].id;
    await client.query(
      `INSERT INTO round_holes (round_id, hole_number, par, handicap, yardages)
       SELECT $1, h.hole_number, h.par, h.handicap,
         jsonb_agg(jsonb_build_object('name', t.name, 'yards', y.yards) ORDER BY t.sort_order)
       FROM course_holes h
       JOIN course_yardages y ON y.course_id = h.course_id AND y.hole_number = h.hole_number
       JOIN course_tees t ON t.id = y.tee_id
       WHERE h.course_id = $2 GROUP BY h.hole_number, h.par, h.handicap`,
      [roundId, course],
    );
    await client.query("COMMIT");
    invalidate(roundId);
    return { ok: true, roundId };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Could not start round:", error);
    return { ok: false, error: "Could not start the round. Please try again." };
  } finally {
    client.release();
  }
}

export async function saveScore(roundId: number, hole: number, strokes: number | null): Promise<Result> {
  const user = await userId();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!Number.isSafeInteger(roundId) || roundId < 1 || roundId > 2147483647 ||
      !Number.isInteger(hole) || hole < 1 || hole > 18 ||
      (strokes !== null && (!Number.isInteger(strokes) || strokes < 1 || strokes > 99))) {
    return { ok: false, error: "Enter a score between 1 and 99, or clear the score." };
  }
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const round = await client.query(
      "SELECT id FROM golf_rounds WHERE id = $1 AND user_id = $2 AND finished_at IS NULL FOR UPDATE",
      [roundId, user],
    );
    if (!round.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This round is no longer active or is unavailable." };
    }
    const updated = await client.query(
      "UPDATE round_holes SET strokes = $1 WHERE round_id = $2 AND hole_number = $3",
      [strokes, roundId, hole],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Hole not found." };
    }
    await client.query("COMMIT");
    invalidate(roundId);
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Could not save score:", error);
    return { ok: false, error: "Score not saved. Check your connection and try again." };
  } finally {
    client.release();
  }
}

export async function closeRound(roundId: number, operation: "finish" | "discard"): Promise<Result> {
  const user = await userId();
  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!Number.isSafeInteger(roundId) || roundId < 1 || roundId > 2147483647 ||
      (operation !== "finish" && operation !== "discard")) {
    return { ok: false, error: "Invalid round." };
  }
  try {
    const result = await getDb().query(
      operation === "finish"
        ? "UPDATE golf_rounds SET finished_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND finished_at IS NULL"
        : "DELETE FROM golf_rounds WHERE id = $1 AND user_id = $2 AND finished_at IS NULL",
      [roundId, user],
    );
    if (!result.rowCount) return { ok: false, error: "This round is no longer active or is unavailable." };
    invalidate(roundId);
    return { ok: true };
  } catch (error) {
    console.error(`Could not ${operation} round:`, error);
    return { ok: false, error: `Could not ${operation} the round. Please try again.` };
  }
}
