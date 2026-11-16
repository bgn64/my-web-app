import test from "node:test";
import assert from "node:assert/strict";
import { CourseDetailsError, normalizeCourseScorecard } from "../app/_features/courses/course-scorecard.ts";
import { coursePayload, externalId } from "./fixtures/course.mjs";

const normalize = (payload) => normalizeCourseScorecard(payload, externalId, 42);

test("valid scorecards preserve shared physical tees and separate rating categories", () =>
{
	for (const count of [9, 18])
	{
		const card = normalize(coursePayload(count));
		assert.equal(card.holes.length, count);
		assert.equal(card.totalPar, count * 4);
		assert.equal(card.tees.length, 2);
		assert.equal(card.tees[0].ratings.length, 2);
		assert.equal(card.tees[0].totalYards, count * 300);
		assert.deepEqual(card.holes[0].yardages, [{
			name: "Blue",
			yards: 300,
		}, {
			name: "Red",
			yards: 200,
		}]);
		assert.equal(card.tees.some((tee) => tee.key === "web"), false);
	}
});

test("optional ratings and metadata do not block hydration; totals come from holes", () =>
{
	const payload = coursePayload();
	payload.par = null;

	for (const tee of payload.tees)
	{
		tee.course_rating = null;
		tee.slope = null;
		tee.yardage = 9999;
	}

	const card = normalize(payload);
	assert.equal(card.totalPar, 36);
	assert.equal(card.tees[0].totalYards, 2700);
	assert.ok(card.warnings.some((warning) => warning.includes("differs")));
	assert.equal(card.tees[0].ratings[0].courseRating, null);
});

test("incomplete tees remain unavailable, but at least one must be playable", () =>
{
	const payload = coursePayload();
	delete payload.holes_data[0].yardages.red;
	const card = normalize(payload);
	assert.equal(card.tees[1].playable, false);
	assert.equal(card.tees[1].totalYards, null);
	assert.deepEqual(card.holes[0].yardages, [{
		name: "Blue",
		yards: 300,
	}]);
	delete payload.holes_data[0].yardages.blue;
	assert.throws(() => normalize(payload), /no tee has yardages/);
});

test("provider payloads require actual live field shapes and integer values", () =>
{
	const cases = [
		null,
		{
			...coursePayload(),
			id: "another-id",
		},
		{
			...coursePayload(),
			course_name: "",
		},
		{
			...coursePayload(),
			holes: 27,
		},
		{
			...coursePayload(),
			holes: "9",
		},
		{
			...coursePayload(),
			holes_data: undefined,
			scorecard: coursePayload().holes_data,
		},
		{
			...coursePayload(),
			par: 35,
		},
		{
			...coursePayload(),
			tees: null,
		},
	];

	for (const payload of cases)
	{
		assert.throws(() => normalize(payload), CourseDetailsError);
	}
});

test("missing, duplicate, malformed holes and handicap ranks fail hydration", () =>
{
	const mutations = [
		(p) => p.holes_data.pop(),
		(p) => p.holes_data.push({
			number: "10",
			par: 4,
		}),
		(p) => p.holes_data.push({
			number: 10.5,
			par: 4,
		}),
		(p) =>
		{
			p.holes_data[0].number = 2;
		},
		(p) =>
		{
			p.holes_data[0].number = 0;
		},
		(p) =>
		{
			p.holes_data[0].par = null;
		},
		(p) =>
		{
			p.holes_data[0].par = 4.5;
		},
		(p) =>
		{
			p.holes_data[0].handicap_index = null;
		},
		(p) =>
		{
			p.holes_data[0].handicap_index = 19;
		},
		(p) =>
		{
			p.holes_data[0].handicap_index = 3;
		},
	];

	for (const mutate of mutations)
	{
		const payload = coursePayload();
		mutate(payload);
		assert.throws(() => normalize(payload), CourseDetailsError);
	}
});

test("extra numbered holes are ignored for 9/18 layouts without relying on array order", () =>
{
	for (const count of [9, 18])
	{
		const payload = coursePayload(count);
		payload.holes_data.reverse();
		payload.holes_data.splice(2, 0, {
			number: count + 1,
			par: 4,
			handicap_index: null,
		});
		payload.holes_data.unshift({
			number: 37,
		});
		const card = normalize(payload);
		assert.deepEqual(card.holes.map((hole) => hole.hole_number), Array.from({
			length: count,
		}, (_, i) => i + 1));
		assert.equal(card.totalPar, count * 4);
		assert.equal(card.warnings[0], `Ignored 2 hole records numbered beyond the declared ${count} holes.`);
		assert.equal(payload.holes_data.length, count + 2);
		payload.holes_data = payload.holes_data.filter((hole) => hole.number !== 1);
		assert.throws(() => normalize(payload), /hole count/);
	}
});

test("tee identity ambiguities fail; invalid optional capabilities are explicit warnings", () =>
{
	const payload = coursePayload();
	payload.tees[0].course_rating = -1;
	payload.tees[0].slope = 999;
	const card = normalize(payload);
	assert.equal(card.tees[0].ratings.find((rating) => rating.key === "blue-male").slope, null);
	assert.ok(card.warnings.some((warning) => warning.includes("invalid optional rating")));
	payload.tees[1].tee_key = payload.tees[0].tee_key;
	assert.throws(() => normalize(payload), /tee identities/);
});

test("yardage matching normalizes names without guessing unmatched keys", () =>
{
	const payload = coursePayload();
	payload.tees[0].tee_name = " BLUE ";
	payload.tees[1].tee_name = "blue";
	payload.holes_data[0].yardages.Blue = 301;
	assert.throws(() => normalize(payload), /ambiguous/);
	delete payload.holes_data[0].yardages.Blue;
	assert.equal(normalize(payload).tees.length, 2);
});

test("normalization preserves ordering, detailed warnings, and validation precedence", () =>
{
	const payload = coursePayload();
	payload.holes_data.reverse();
	delete payload.holes_data[0].yardages.red;
	payload.tees[0].course_rating = -1;
	payload.tees[0].yardage = 9999;
	const card = normalize(payload);
	assert.deepEqual(card.holes.map((hole) => hole.hole_number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
	assert.deepEqual(card.tees[0].ratings.map((rating) => rating.key), ["blue-female", "blue-male"]);
	assert.deepEqual(card.warnings, [
		"blue-male: invalid optional rating information omitted.",
		"blue-male: reported total yardage differs from the hole sum.",
		"Red: incomplete hole yardages; tee unavailable.",
	]);
	assert.deepEqual(card.holes[8].yardages, [{
		name: "Blue",
		yards: 300,
	}]);

	payload.par = 35;
	payload.tees = null;
	assert.throws(() => normalize(payload), {
		name: "CourseDetailsError",
		message: "This course does not have a usable scorecard: the course par contradicts its holes.",
	});
});
