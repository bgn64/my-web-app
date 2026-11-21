"use server";

import { revalidatePath } from "next/cache";
import type { ConfigDraft } from "./contracts";
import { loadConfiguration, saveAnswer, saveConfiguration } from "./operations";

function invalidate(roundId: number)
{
	try
	{
		revalidatePath(`/rounds/${roundId}`);
		revalidatePath(`/rounds/${roundId}/scorecard`);
	}
	catch (cause)
	{
		console.error("Stats saved, but page refresh failed:", cause);
	}
}

export async function loadStatsConfiguration(roundId: number)
{
	return loadConfiguration(roundId);
}

export async function saveStatsConfiguration(roundId: number, draft: ConfigDraft)
{
	const result = await saveConfiguration(roundId, draft);
	if (result.ok)
	{
		invalidate(roundId);
	}
	return result;
}

export async function saveStatAnswer(
	roundId: number, statId: number, hole: number, kind: unknown, value: unknown, revision: number,
)
{
	const result = await saveAnswer(roundId, statId, hole, kind, value, revision);
	if (result.ok)
	{
		invalidate(roundId);
	}
	return result;
}
