"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { getSession, parseId, requireCourseScorecard } from "./golf-data";
import { CourseDetailsError } from "./course-scorecard";
import { createScorecardRound } from "./golf-round-start";

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

  try {
    const active = await getDb().query("SELECT id FROM golf_rounds WHERE user_id = $1 AND finished_at IS NULL", [user]);
    if (active.rowCount) {
      return { ok: false, error: "You already have an active round. Resume or discard it first." };
    }
    const scorecard = await requireCourseScorecard(course);
    const roundId = await createScorecardRound(getDb(), user, scorecard);
    invalidate(roundId);
    return { ok: true, roundId };
  } catch (error) {
    if (error instanceof CourseDetailsError) {
      console.warn("Round not started:", { courseId: course, message: error.message });
      return { ok: false, error: error.message };
    }
    console.error("Could not start round:", error);
    return { ok: false, error: "Could not start the round. Please try again." };
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
      `UPDATE round_scores SET strokes = $1 WHERE round_id = $2 AND hole_number = $3
       AND EXISTS (SELECT 1 FROM golf_rounds r, jsonb_array_elements(r.snapshot->'scorecard'->'holes') h
         WHERE r.id = $2 AND (h->>'hole_number')::int = $3)`,
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
