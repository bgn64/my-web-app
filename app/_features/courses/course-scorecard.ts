import type { CourseScorecard, PhysicalTee, ScorecardHole, TeeRating } from "./types";

export class CourseDetailsError extends Error
{
	constructor(message: string)
	{
		super(message);
		this.name = "CourseDetailsError";
	}
}

function record(value: unknown): value is Record<string, unknown>
{
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null
{
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown, min: number, max: number): value is number
{
	return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function canonicalName(value: string)
{
	return value.trim().toLowerCase();
}

function incomplete(reason: string): never
{
	throw new CourseDetailsError(`This course does not have a usable scorecard: ${reason}`);
}

type ParsedCourse = {
	name: string;
	location: string;
	holeCount: 9 | 18;
	holes: unknown[];
	reportedPar: unknown;
	tees: unknown;
	warnings: string[];
};

type HoleYardages = Map<number, Map<string, number>>;

/** Parse provider identity and layout metadata before validating individual holes. */
function parseCourse(value: unknown, externalId: string): ParsedCourse
{
	if (!record(value) || value.id !== externalId)
	{
		return incomplete("invalid course identity.");
	}

	const name = text(value.course_name);

	if (!name)
	{
		return incomplete("invalid course identity.");
	}

	const holeCount = value.holes;

	if (holeCount !== 9 && holeCount !== 18)
	{
		return incomplete("only 9- and 18-hole layouts are supported.");
	}

	if (!Array.isArray(value.holes_data))
	{
		return incomplete("the hole count is inconsistent.");
	}

	const holes: unknown[] = [];
	let extras = 0;

	for (const hole of value.holes_data)
	{
		if (!record(hole) || typeof hole.number !== "number" ||
			!Number.isSafeInteger(hole.number) || hole.number < 1)
		{
			return incomplete("hole numbers are missing or duplicated.");
		}

		if (hole.number > holeCount)
		{
			extras++;
		}
		else
		{
			holes.push(hole);
		}
	}

	if (holes.length !== holeCount)
	{
		return incomplete("the hole count is inconsistent.");
	}

	return {
		name,
		location: [text(value.city), text(value.state)].filter(Boolean).join(", "),
		holeCount,
		holes,
		reportedPar: value.par,
		tees: value.tees,
		warnings: extras ? [`Ignored ${extras} hole records numbered beyond the declared ${holeCount} holes.`] : [],
	};
}

function parseHoleYardages(value: unknown): Map<string, number>
{
	const yardages = new Map<string, number>();

	if (record(value))
	{
		for (const [name, yards] of Object.entries(value))
		{
			const key = canonicalName(name);

			if (!key || !integer(yards, 1, 32767))
			{
				continue;
			}

			if (yardages.has(key))
			{
				return incomplete("hole yardage names are ambiguous.");
			}

			yardages.set(key, yards);
		}
	}

	return yardages;
}

function parseHoles(course: ParsedCourse): {
	holes: ScorecardHole[];
	holeYardages: HoleYardages;
	totalPar: number;
}
{
	const seenHoles = new Set<number>();
	const seenHandicaps = new Set<number>();
	const holeYardages: HoleYardages = new Map();
	const holes: ScorecardHole[] = [];

	for (const entry of course.holes)
	{
		if (!record(entry) || !integer(entry.number, 1, course.holeCount) || seenHoles.has(entry.number))
		{
			return incomplete("hole numbers are missing or duplicated.");
		}

		if (!integer(entry.par, 3, 6))
		{
			return incomplete("a hole has no valid par.");
		}

		if (!integer(entry.handicap_index, 1, 18) || seenHandicaps.has(entry.handicap_index))
		{
			return incomplete("hole handicap rankings are missing or duplicated.");
		}

		seenHoles.add(entry.number);
		seenHandicaps.add(entry.handicap_index);
		holeYardages.set(entry.number, parseHoleYardages(entry.yardages));
		holes.push({
			hole_number: entry.number,
			par: entry.par,
			handicap: entry.handicap_index,
			yardages: [],
		});
	}

	holes.sort((a, b) => a.hole_number - b.hole_number);
	const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);

	// Both null and undefined mean the provider omitted its reported par.
	if (course.reportedPar != null && (!integer(course.reportedPar, 1, 200) || course.reportedPar !== totalPar))
	{
		return incomplete("the course par contradicts its holes.");
	}

	return {
		holes,
		holeYardages,
		totalPar,
	};
}

function createPhysicalTee(name: string, holes: ScorecardHole[], holeYardages: HoleYardages): PhysicalTee
{
	const key = canonicalName(name);
	const yardages: Record<string, number> = {};

	for (const hole of holes)
	{
		const yards = holeYardages.get(hole.hole_number)?.get(key);

		if (yards !== undefined)
		{
			yardages[String(hole.hole_number)] = yards;
		}
	}

	const isPlayable = Object.keys(yardages).length === holes.length;

	return {
		key,
		name,
		playable: isPlayable,
		yardages,
		ratings: [],
		totalYards: isPlayable ? Object.values(yardages).reduce((sum, yards) => sum + yards, 0) : null,
	};
}

function parseTeeRating(
	entry: Record<string, unknown>,
	ratingKey: string,
	tee: PhysicalTee,
	warnings: string[],
): TeeRating
{
	const courseRating = (typeof entry.course_rating === "number" && Number.isFinite(entry.course_rating) &&
		entry.course_rating > 0 && entry.course_rating <= 200) ? entry.course_rating : null;
	const slope = integer(entry.slope, 55, 155) ? entry.slope : null;

	if ((entry.course_rating != null && courseRating === null) || (entry.slope != null && slope === null))
	{
		warnings.push(`${ratingKey}: invalid optional rating information omitted.`);
	}

	const reportedYards = integer(entry.yardage, 1, 100000) ? entry.yardage : null;

	if (tee.playable && reportedYards !== null && reportedYards !== tee.totalYards)
	{
		warnings.push(`${ratingKey}: reported total yardage differs from the hole sum.`);
	}

	return {
		key: ratingKey,
		gender: text(entry.gender),
		color: text(entry.tee_color),
		courseRating,
		slope,
		reportedYards,
		par: integer(entry.par, 1, 200) ? entry.par : null,
	};
}

function parseTees(
	rawTees: unknown,
	holes: ScorecardHole[],
	holeYardages: HoleYardages,
): {
	tees: PhysicalTee[];
	warnings: string[];
}
{
	if (!Array.isArray(rawTees))
	{
		return incomplete("no tee information is available.");
	}

	const warnings: string[] = [];
	const teesByName = new Map<string, PhysicalTee>();
	const ratingKeys = new Set<string>();

	for (const entry of rawTees)
	{
		if (!record(entry))
		{
			return incomplete("invalid tee information.");
		}

		const name = text(entry.tee_name);
		const ratingKey = text(entry.tee_key);

		if (!name || !ratingKey || ratingKeys.has(ratingKey))
		{
			return incomplete("tee identities are missing or duplicated.");
		}

		ratingKeys.add(ratingKey);
		const key = canonicalName(name);
		let tee = teesByName.get(key);

		if (!tee)
		{
			tee = createPhysicalTee(name, holes, holeYardages);
			teesByName.set(key, tee);

			if (!tee.playable)
			{
				warnings.push(`${name}: incomplete hole yardages; tee unavailable.`);
			}
		}

		tee.ratings.push(parseTeeRating(entry, ratingKey, tee, warnings));
	}

	const tees = [...teesByName.values()];

	for (const tee of tees)
	{
		tee.ratings.sort((a, b) =>
		{
			if (a.key < b.key)
			{
				return -1;
			}

			if (a.key > b.key)
			{
				return 1;
			}

			return 0;
		});
	}

	if (!tees.some((tee) => tee.playable))
	{
		return incomplete("no tee has yardages for every hole.");
	}

	return {
		tees,
		warnings,
	};
}

function attachPlayableYardages(holes: ScorecardHole[], tees: PhysicalTee[]): ScorecardHole[]
{
	const playableTees = tees.filter((tee) => tee.playable);

	return holes.map((hole) => ({
		...hole,
		yardages: playableTees.map((tee) => ({
			name: tee.name,
			yards: tee.yardages[String(hole.hole_number)],
		})),
	}));
}

export function normalizeCourseScorecard(value: unknown, externalId: string, id: number): CourseScorecard
{
	const course = parseCourse(value, externalId);
	const { holes, holeYardages, totalPar } = parseHoles(course);
	const { tees, warnings } = parseTees(course.tees, holes, holeYardages);

	return {
		id,
		externalId,
		name: course.name,
		location: course.location,
		holeCount: course.holeCount,
		totalPar,
		holes: attachPlayableYardages(holes, tees),
		tees,
		warnings: [...course.warnings, ...warnings],
	};
}
