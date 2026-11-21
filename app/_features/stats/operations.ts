import "server-only";

import type { PoolClient } from "pg";
import { getDb } from "../../_lib/db";
import { getSession } from "../auth/session";
import { configurationSelection, isStatAnswer, isStatKind, normalizeStatName } from "./contracts";
import type { ConfigDraft, LibraryDraft, StatDefinition, StatsSnapshot } from "./contracts";
import { readLibrary, readRoundStats } from "./data";

type Failure = {
	ok: false;
	error: string;
	conflict?: boolean;
};

type ConfigResult = Failure | {
	ok: true;
	snapshot: StatsSnapshot;
	library: StatDefinition[];
};

type Result = Failure | {
	ok: true;
};

function validId(value: unknown): value is number
{
	return Number.isSafeInteger(value) && typeof value === "number" && value > 0 && value <= 2147483647;
}

function validateDraft(draft: ConfigDraft): boolean
{
	if (!draft || !Number.isSafeInteger(draft.revision) || draft.revision < 0 ||
		!Array.isArray(draft.baseline) || !Array.isArray(draft.library) ||
		!Array.isArray(draft.deleted) || !Array.isArray(draft.retained) || !Array.isArray(draft.added))
	{
		return false;
	}

	const baselineIds = new Set<number>();
	const keys = new Set<string>();
	const ids = new Set<number>();

	for (const item of draft.baseline)
	{
		if (!item || !validId(item.id) || baselineIds.has(item.id) ||
			normalizeStatName(item.name) !== item.name || !isStatKind(item.kind))
		{
			return false;
		}
		baselineIds.add(item.id);
	}

	for (const item of draft.library)
	{
		if (!item || typeof item.key !== "string" || item.key.length < 1 || item.key.length > 100 ||
			keys.has(item.key) || normalizeStatName(item.name) !== item.name || !isStatKind(item.kind) ||
			(item.id !== null && (!validId(item.id) || ids.has(item.id) || !baselineIds.has(item.id))))
		{
			return false;
		}
		keys.add(item.key);
		if (item.id !== null)
		{
			ids.add(item.id);
		}
	}

	const validLists = draft.retained.every(validId) && new Set(draft.retained).size === draft.retained.length &&
		draft.added.every((key) => typeof key === "string" && keys.has(key)) &&
		new Set(draft.added).size === draft.added.length &&
		draft.deleted.every((key) => typeof key === "string" && keys.has(key)) &&
		new Set(draft.deleted).size === draft.deleted.length;

	if (!validLists)
	{
		return false;
	}

	if (draft.removalCounts !== undefined &&
		(!draft.removalCounts || typeof draft.removalCounts !== "object" ||
		Array.isArray(draft.removalCounts) || Object.entries(draft.removalCounts).some(([id, count]) =>
			!/^\d+$/.test(id) || !validId(Number(id)) || !Number.isInteger(count) || count < 0 || count > 18)))
	{
		return false;
	}

	if (draft.order === undefined)
	{
		return true;
	}

	if (!Array.isArray(draft.order) || draft.order.length !== draft.retained.length + draft.added.length)
	{
		return false;
	}

	const selections = new Set<string>();

	return draft.order.every((item) =>
	{
		if (!item || typeof item !== "object")
		{
			return false;
		}

		let key: string;

		if (item.kind === "round" && draft.retained.includes(item.roundStatId))
		{
			key = `round:${item.roundStatId}`;
		}
		else if (item.kind === "definition" && draft.added.includes(item.definitionKey))
		{
			key = `definition:${item.definitionKey}`;
		}
		else
		{
			return false;
		}

		if (selections.has(key))
		{
			return false;
		}

		selections.add(key);
		return true;
	});
}

function sameLibrary(actual: StatDefinition[], baseline: StatDefinition[])
{
	if (actual.length !== baseline.length)
	{
		return false;
	}

	const expected = new Map(baseline.map((item) => [item.id, item]));
	return actual.every((item) =>
	{
		const previous = expected.get(item.id);
		return previous?.name === item.name && previous.kind === item.kind;
	});
}

function error(message: string, conflict = false): Failure
{
	return {
		ok: false,
		error: message,
		conflict,
	};
}

export async function loadConfiguration(roundId: number): Promise<ConfigResult>
{
	const session = await getSession();

	if (!session)
	{
		return error("Your session has expired. Please sign in again.");
	}
	if (!validId(roundId))
	{
		return error("Invalid round.");
	}

	try
	{
		const db = getDb();
		const active = await db.query(
			"SELECT id FROM golf_rounds WHERE id = $1 AND user_id = $2 AND finished_at IS NULL",
			[roundId, session.user.id],
		);
		if (!active.rowCount)
		{
			return error("This round is no longer active or is unavailable.");
		}
		const snapshot = await readRoundStats(db, session.user.id, roundId);
		if (!snapshot)
		{
			return error("This round is unavailable.");
		}
		const library = await readLibrary(db, session.user.id);
		return { ok: true, snapshot, library };
	}
	catch (cause)
	{
		console.error("Could not load stat configuration:", cause);
		return error("Could not load My stats. Check your connection and retry.");
	}
}

async function applyLibrary(
	client: PoolClient,
	userId: string,
	draft: LibraryDraft[],
)
{
	const result = new Map<string, StatDefinition>();

	for (const item of draft)
	{
		if (item.id === null)
		{
			const inserted = await client.query<StatDefinition>(
				"INSERT INTO stat_definitions (user_id, name, kind) VALUES ($1, $2, $3) RETURNING id, name, kind",
				[userId, item.name, item.kind],
			);
			result.set(item.key, inserted.rows[0]);
		}
		else
		{
			await client.query("UPDATE stat_definitions SET name = $1 WHERE id = $2 AND user_id = $3",
				[item.name, item.id, userId]);
			result.set(item.key, { id: item.id, name: item.name, kind: item.kind });
		}
	}
	return result;
}

export async function saveConfiguration(roundId: number, draft: ConfigDraft): Promise<ConfigResult>
{
	const session = await getSession();
	if (!session)
	{
		return error("Your session has expired. Please sign in again.");
	}
	if (!validId(roundId) || !validateDraft(draft))
	{
		return error("Invalid configuration. Check the names and try again.");
	}

	let client: PoolClient;
	try
	{
		client = await getDb().connect();
	}
	catch (cause)
	{
		console.error("Could not connect to save stat configuration:", cause);
		return error("Could not connect to save configuration. Your draft is still here; retry.");
	}
	let commitAttempted = false;
	try
	{
		await client.query("BEGIN");
		await client.query('SELECT id FROM "user" WHERE id = $1 FOR UPDATE', [session.user.id]);
		const round = await client.query<{ stats_revision: number }>(
			"SELECT stats_revision FROM golf_rounds WHERE id = $1 AND user_id = $2 AND finished_at IS NULL FOR UPDATE",
			[roundId, session.user.id],
		);
		const actual = await readLibrary(client, session.user.id);
		const current = await readRoundStats(client, session.user.id, roundId);
		if (!round.rowCount || !current)
		{
			await client.query("ROLLBACK");
			return error("This round is no longer active or is unavailable.", true);
		}
		if (round.rows[0].stats_revision !== draft.revision || !sameLibrary(actual, draft.baseline))
		{
			await client.query("ROLLBACK");
			return error("Configuration changed elsewhere. Reload and review before saving.", true);
		}
		const byId = new Map(actual.map((item) => [item.id, item]));
		if (draft.library.some((item) => item.id !== null && byId.get(item.id)?.kind !== item.kind) ||
			draft.retained.some((id) => !current.stats.some((item) => item.id === id)))
		{
			await client.query("ROLLBACK");
			return error("Configuration changed or contains invalid stat IDs. Reload and review.", true);
		}
		const removed = current.stats.filter((stat) => !draft.retained.includes(stat.id));

		if (removed.some((stat) => stat.values.length !== (draft.removalCounts?.[stat.id] ?? 0)))
		{
			await client.query("ROLLBACK");
			return error("Recorded answers changed. Reload and review the removals before saving.", true);
		}

		const sources = new Set(current.stats.filter((stat) => draft.retained.includes(stat.id))
			.map((stat) => stat.source_definition_id).filter((id) => id !== null));

		for (const key of draft.added)
		{
			const definition = draft.library.find((item) => item.key === key);

			if (definition?.id !== null && definition?.id !== undefined && sources.has(definition.id))
			{
				await client.query("ROLLBACK");
				return error("That saved stat is already tracked in this round.");
			}
		}

		const definitions = await applyLibrary(client, session.user.id, draft.library);
		if (draft.library.filter((item) => item.id !== null).length !== actual.length)
		{
			await client.query("ROLLBACK");
			return error("The library draft is incomplete. Reload and review.", true);
		}
		await client.query("DELETE FROM round_stats WHERE round_id = $1 AND NOT (id = ANY($2::int[]))",
			[roundId, draft.retained]);
		const positions = await client.query<{ maximum: number }>(
			"SELECT COALESCE(MAX(position), -1) AS maximum FROM round_stats WHERE round_id = $1", [roundId],
		);
		const offset = Math.max(positions.rows[0].maximum, draft.retained.length + draft.added.length) + 1;

		if (offset > 1073741823)
		{
			throw new Error("Stat positions cannot be reassigned safely.");
		}

		await client.query("UPDATE round_stats SET position = position + $2 WHERE round_id = $1", [roundId, offset]);
		const selection = configurationSelection(draft, current.stats);

		for (const [position, item] of selection.entries())
		{
			if (item.kind === "round")
			{
				await client.query("UPDATE round_stats SET position = $2 WHERE id = $1 AND round_id = $3",
					[item.roundStatId, position, roundId]);
				continue;
			}

			const definition = definitions.get(item.definitionKey);
			if (!definition)
			{
				throw new Error("Missing validated library definition.");
			}
			await client.query(
				`INSERT INTO round_stats (round_id, name, kind, position, source_definition_id)
				 VALUES ($1, $2, $3, $4, $5)`,
				[roundId, definition.name, definition.kind, position, definition.id],
			);
		}
		for (const key of draft.deleted)
		{
			const definition = definitions.get(key);
			if (definition)
			{
				await client.query("DELETE FROM stat_definitions WHERE user_id = $1 AND id = $2",
					[session.user.id, definition.id]);
			}
		}
		await client.query("UPDATE golf_rounds SET stats_revision = stats_revision + 1 WHERE id = $1", [roundId]);
		const snapshot = await readRoundStats(client, session.user.id, roundId);
		const library = await readLibrary(client, session.user.id);
		if (!snapshot)
		{
			throw new Error("Round disappeared while saving configuration.");
		}
		commitAttempted = true;
		await client.query("COMMIT");
		return { ok: true, snapshot, library };
	}
	catch (cause)
	{
		if (!commitAttempted)
		{
			try
			{
				await client.query("ROLLBACK");
			}
			catch (rollbackError)
			{
				console.error("Could not roll back stat configuration:", rollbackError);
			}
		}
		console.error("Could not save stat configuration:", cause);
		if (commitAttempted)
		{
			return error("The save result is uncertain. Reload and review before trying again.", true);
		}
		return error("Configuration could not be saved. Your draft is still here; check your connection and retry.");
	}
	finally
	{
		client.release();
	}
}

export async function saveAnswer(
	roundId: number,
	statId: number,
	hole: number,
	kind: unknown,
	value: unknown,
	revision: number,
): Promise<Result>
{
	const session = await getSession();
	if (!session)
	{
		return error("Your session has expired. Please sign in again.");
	}
	if (!validId(roundId) || !validId(statId) || !Number.isInteger(hole) || hole < 1 || hole > 18 ||
		!Number.isSafeInteger(revision) || revision < 0 || !isStatKind(kind) || !isStatAnswer(kind, value))
	{
		return error("Invalid stat answer.");
	}
	let client: PoolClient;
	try
	{
		client = await getDb().connect();
	}
	catch (cause)
	{
		console.error("Could not connect to save stat answer:", cause);
		return error("Stat not saved. Check your connection and try again.");
	}
	try
	{
		await client.query("BEGIN");
		const round = await client.query<{ stats_revision: number }>(
			"SELECT stats_revision FROM golf_rounds WHERE id = $1 AND user_id = $2 AND finished_at IS NULL FOR UPDATE",
			[roundId, session.user.id],
		);
		if (!round.rowCount || round.rows[0].stats_revision !== revision)
		{
			await client.query("ROLLBACK");
			return error("Round configuration changed or the round is no longer active. Reload to review.", true);
		}
		const membership = await client.query(
			`SELECT s.id FROM round_stats s JOIN round_scores h ON h.round_id = s.round_id
			 WHERE s.id = $1 AND s.round_id = $2 AND s.kind = $3 AND h.hole_number = $4`,
			[statId, roundId, kind, hole],
		);
		if (!membership.rowCount)
		{
			await client.query("ROLLBACK");
			return error("Stat or hole is no longer available. Reload to review.", true);
		}
		if (value === null)
		{
			await client.query("DELETE FROM round_stat_values WHERE round_id = $1 AND round_stat_id = $2 AND hole_number = $3",
				[roundId, statId, hole]);
		}
		else
		{
			await client.query(
				`INSERT INTO round_stat_values (round_id, round_stat_id, hole_number, kind, number_value, boolean_value)
				 VALUES ($1, $2, $3, $4, $5, $6)
				 ON CONFLICT (round_id, round_stat_id, hole_number) DO UPDATE
				 SET number_value = EXCLUDED.number_value, boolean_value = EXCLUDED.boolean_value`,
				[roundId, statId, hole, kind, kind === "number" ? value : null, kind === "boolean" ? value : null],
			);
		}
		await client.query("COMMIT");
		return { ok: true };
	}
	catch (cause)
	{
		await client.query("ROLLBACK");
		console.error("Could not save stat answer:", cause);
		return error("Stat not saved. Check your connection and try again.");
	}
	finally
	{
		client.release();
	}
}
