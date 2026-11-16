import type {
	NormalizedScorecard,
	PhysicalTee,
	ScorecardHole,
	TeeRating,
} from "../courses/types";
import type { GolfRound, RoundSnapshot } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
	typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const optionalText = (value: unknown) => value === null || text(value);
const optionalNumber = (value: unknown, min: number, max: number) =>
	value === null || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);

function hole(value: unknown): value is ScorecardHole
{
	return record(value) && integer(value.hole_number, 1, 18) && integer(value.par, 3, 6) &&
		integer(value.handicap, 1, 18) && Array.isArray(value.yardages) && value.yardages.length > 0 &&
		value.yardages.every((yards: unknown) => record(yards) && text(yards.name) && integer(yards.yards, 1, 32767));
}

function rating(value: unknown): value is TeeRating
{
	return record(value) && text(value.key) && optionalText(value.gender) && optionalText(value.color) &&
		optionalNumber(value.courseRating, Number.MIN_VALUE, 200) &&
		(value.slope === null || integer(value.slope, 55, 155)) &&
		(value.par === null || integer(value.par, 1, 200)) &&
		(value.reportedYards === null || integer(value.reportedYards, 1, 100000));
}

function tee(value: unknown): value is PhysicalTee
{
	return record(value) && text(value.key) && text(value.name) && typeof value.playable === "boolean" &&
		(value.totalYards === null || integer(value.totalYards, 1, 18 * 32767)) &&
		record(value.yardages) && Object.entries(value.yardages).every(([number, yards]) =>
			/^[1-9]\d*$/.test(number) && integer(Number(number), 1, 18) && integer(yards, 1, 32767)) &&
		Array.isArray(value.ratings) && value.ratings.every(rating);
}

/** Validate both the stored fields and the consistency of their derived yardages. */
function scorecard(value: unknown): value is NormalizedScorecard
{
	if (!record(value) || (value.holeCount !== 9 && value.holeCount !== 18) ||
		!integer(value.totalPar, 1, 108) || !Array.isArray(value.holes) || !value.holes.every(hole) ||
		!Array.isArray(value.tees) || !value.tees.every(tee))
	{
		return false;
	}

	const holes = value.holes;
	const tees = value.tees;

	if (holes.length !== value.holeCount || holes.some((entry, index) => entry.hole_number !== index + 1) ||
		new Set(holes.map((entry) => entry.handicap)).size !== holes.length ||
		holes.reduce((sum, entry) => sum + entry.par, 0) !== value.totalPar ||
		new Set(tees.map((entry) => entry.key)).size !== tees.length ||
		tees.some((entry) => new Set(entry.ratings.map((item) => item.key)).size !== entry.ratings.length))
	{
		return false;
	}

	const playable = tees.filter((entry) => entry.playable);

	return playable.length > 0 && tees.every((entry) =>
	{
		const complete = holes.every((item) => entry.yardages[String(item.hole_number)] !== undefined);

		return Object.keys(entry.yardages).every((number) => Number(number) <= holes.length) &&
			entry.playable === complete && entry.totalYards === (complete
				? Object.values(entry.yardages).reduce((sum, yards) => sum + yards, 0) : null);
	}) && holes.every((entry) => entry.yardages.length === playable.length && entry.yardages.every((yards, index) =>
		yards.name === playable[index].name && yards.yards === playable[index].yardages[String(entry.hole_number)]));
}

export function parseRoundSnapshot(value: unknown): RoundSnapshot
{
	if (!record(value) || value.version !== 1 || !record(value.course) ||
		!text(value.course.name) || !text(value.course.location) || !scorecard(value.scorecard))
	{
		throw new Error("Round has an invalid or unsupported scorecard snapshot.");
	}

	return {
		version: 1,
		course: {
			name: value.course.name,
			location: value.course.location,
		},
		scorecard: {
			holeCount: value.scorecard.holeCount,
			totalPar: value.scorecard.totalPar,
			holes: value.scorecard.holes,
			tees: value.scorecard.tees,
		},
	};
}

export type StoredRound = {
	id: number;
	started_at: Date;
	finished_at: Date | null;
	snapshot: unknown;
	scores: {
		hole_number: number;
		strokes: number | null;
	}[];
};

export function presentRound(row: StoredRound): GolfRound
{
	const snapshot = parseRoundSnapshot(row.snapshot);

	if (!Array.isArray(row.scores) || row.scores.length !== snapshot.scorecard.holes.length ||
		row.scores.some((score) => !integer(score.hole_number, 1, snapshot.scorecard.holeCount) ||
			(score.strokes !== null && !integer(score.strokes, 1, 99))) ||
		new Set(row.scores.map((score) => score.hole_number)).size !== row.scores.length)
	{
		throw new Error("Round has invalid or missing player scores.");
	}

	const scores = new Map(row.scores.map((score) => [score.hole_number, score.strokes]));

	return {
		id: row.id,
		started_at: row.started_at,
		finished_at: row.finished_at,
		course_name: snapshot.course.name,
		course_location: snapshot.course.location,
		snapshot,
		holes: snapshot.scorecard.holes.map((hole) => ({
			...hole,
			strokes: scores.get(hole.hole_number)!,
		})),
	};
}
