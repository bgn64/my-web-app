"use server";

import { revalidatePath } from "next/cache";
import {
	closeRound as closeRoundOperation,
	saveScore as saveScoreOperation,
	startRound as startRoundOperation,
} from "./operations";
import type { Result } from "./operations";

function invalidate(roundId: number)
{
	revalidatePath("/play");
	revalidatePath("/rounds");

	if (roundId)
	{
		revalidatePath(`/rounds/${roundId}`);
		revalidatePath(`/rounds/${roundId}/scorecard`);
	}
}

export async function startRound(courseId: string): Promise<Result>
{
	return startRoundOperation(courseId, invalidate);
}

export async function saveScore(roundId: number, hole: number, strokes: number | null): Promise<Result>
{
	return saveScoreOperation(roundId, hole, strokes, invalidate);
}

export async function closeRound(roundId: number, operation: "finish" | "discard"): Promise<Result>
{
	return closeRoundOperation(roundId, operation, invalidate);
}
