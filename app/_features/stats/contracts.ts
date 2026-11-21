export const STAT_NUMBER_MIN = 0;
export const STAT_NUMBER_MAX = 99;
export const STAT_NAME_MAX = 80;

export type StatKind = "number" | "boolean";

export type StatDefinition = {
	id: number;
	name: string;
	kind: StatKind;
};

export type StatValue = {
	hole: number;
	value: number | boolean;
};

export type RoundStat = StatDefinition & {
	source_definition_id: number | null;
	values: StatValue[];
};

export type StatsSnapshot = {
	revision: number;
	stats: RoundStat[];
};

export type LibraryDraft = {
	key: string;
	id: number | null;
	name: string;
	kind: StatKind;
};

export type ConfigDraft = {
	revision: number;
	baseline: StatDefinition[];
	library: LibraryDraft[];
	deleted: string[];
	retained: number[];
	added: string[];
	order?: StatSelection[];
	removalCounts?: Record<string, number>;
};

export type StatSelection = {
	kind: "round";
	roundStatId: number;
} | {
	kind: "definition";
	definitionKey: string;
};

export function configurationSelection(draft: ConfigDraft, stats: RoundStat[]): StatSelection[]
{
	return draft.order ?? [
		...stats.filter((stat) => draft.retained.includes(stat.id)).map((stat): StatSelection => ({
			kind: "round",
			roundStatId: stat.id,
		})),
		...draft.added.map((key): StatSelection => ({
			kind: "definition",
			definitionKey: key,
		})),
	];
}

export function normalizeStatName(value: unknown): string | null
{
	if (typeof value !== "string")
	{
		return null;
	}

	const name = value.trim();

	if (!name || name.includes("\0") || Array.from(name).length > STAT_NAME_MAX ||
		/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(name))
	{
		return null;
	}

	return name;
}

export function isStatKind(value: unknown): value is StatKind
{
	return value === "number" || value === "boolean";
}

export function validStatDraft(text: string)
{
	return text === "" || (/^\d{1,2}$/.test(text) && Number(text) <= STAT_NUMBER_MAX);
}

export function isStatAnswer(kind: StatKind, value: unknown): value is number | boolean | null
{
	if (value === null)
	{
		return true;
	}

	if (kind === "boolean")
	{
		return typeof value === "boolean";
	}

	return typeof value === "number" && Number.isInteger(value) &&
		value >= STAT_NUMBER_MIN && value <= STAT_NUMBER_MAX;
}

export function statDisplayName(stats: RoundStat[], stat: RoundStat)
{
	const matching = stats.filter((item) => item.name === stat.name);
	if (matching.length < 2)
	{
		return stat.name;
	}

	return `${stat.name} (${matching.findIndex((item) => item.id === stat.id) + 1})`;
}

export function summarizeStat(stat: RoundStat)
{
	const answered = stat.values.length;
	const total = stat.values.reduce<number>((sum, entry) =>
	{
		if (stat.kind === "boolean")
		{
			return sum + (entry.value === true ? 1 : 0);
		}

		return sum + (typeof entry.value === "number" ? entry.value : 0);
	}, 0);

	return {
		answered,
		total,
	};
}
