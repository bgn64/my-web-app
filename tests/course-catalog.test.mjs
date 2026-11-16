import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { validateCatalog, importCatalog } from "../scripts/import-course-catalog.mjs";
import { loadCourseScorecard } from "../app/course-hydration.ts";
import { createScorecardRound } from "../app/golf-round-start.ts";
import { coursePayload } from "./fixtures/course.mjs";

const catalog = JSON.parse(await readFile(new URL("../data/course-catalog.json", import.meta.url), "utf8"));
const document = (courses) => ({
	...catalog,
	courses,
	provenance: {
		...catalog.provenance,
		records: courses.length,
	},
});
const fixtureCourse = () => ({
	...catalog.courses[0],
	external_id: randomUUID(),
	name: "Import test",
	catalog_metadata: {},
});
const options = {
	skip: process.env.FAIRWAY_TEST_DB !== "1",
};

test("frozen JSON catalog preserves all identities/provenance without bulk scorecard fields", () =>
{
	assert.equal(validateCatalog(catalog).length, 15667);
	assert.equal(catalog.provenance.source_sha256, "ac7e3eb1a163c88b724abdea8e90afd6533360699a1e093d234732b28d18dd4a");
	assert.equal(catalog.provenance.license, "ODbL 1.0");
	const heron = catalog.courses.find((course) => course.external_id === "ae4fb4b4-7481-463a-a6fd-d2bfa7fcd04c");
	assert.match(heron.name, /Heron Links/);

	for (const course of catalog.courses)
	{
		assert.equal(Object.hasOwn(course, "advertised_hole_count"), false);
		assert.equal(Object.hasOwn(course, "holes"), false);
		assert.equal(Object.hasOwn(course.catalog_metadata, "par"), false);
	}
});

test("invalid/duplicate catalog input is rejected before database writes", async () =>
{
	for (const mutate of [
		(c) =>
		{
			c.name = "";
		},
		(c) =>
		{
			c.external_id = "invalid";
		},
		(c) =>
		{
			c.latitude = 91;
		},
		(c) =>
		{
			c.provider = "unknown";
		},
		(c) =>
		{
			c.holes = 7;
		},
		(c) =>
		{
			c.catalog_metadata.par = "27";
		},
	])
	{
		const course = fixtureCourse();
		mutate(course);
		await assert.rejects(importCatalog({
			connect()
			{
				throw new Error("Must validate before connecting");
			},
		}, document([course])), /Invalid/);
	}

	const course = fixtureCourse();
	assert.throws(() => validateCatalog(document([course, {
		...course,
		external_id: course.external_id.toUpperCase(),
	}])), /duplicate/);
});

test("catalog upserts retain IDs, caches, round copies, and omitted entries", options, async () =>
{
	const pool = new pg.Pool();
	const courses = [fixtureCourse(), fixtureCourse()];
	const user = randomUUID();

	try
	{
		assert.deepEqual(await importCatalog(pool, document(courses)), {
			inserted: 2,
			updated: 0,
			unchanged: 0,
		});
		const rows = (await pool.query(
			"SELECT id, external_id::text FROM courses WHERE external_id=ANY($1::uuid[])",
			[courses.map((c) => c.external_id)],
		)).rows;
		const id = rows.find((row) => row.external_id === courses[0].external_id).id;
		const payload = {
			...coursePayload(),
			id: courses[0].external_id,
		};
		const card = await loadCourseScorecard(pool, id, async () => Response.json(payload));
		await pool.query('INSERT INTO "user" (id,name,email) VALUES ($1,$2,$3)', [user, "Test", `${user}@example.test`]);
		const round = await createScorecardRound(pool, user, card);
		const oldSnapshot = (await pool.query("SELECT snapshot FROM golf_rounds WHERE id=$1", [round])).rows[0].snapshot;
		assert.deepEqual(await importCatalog(pool, document(courses)), {
			inserted: 0,
			updated: 0,
			unchanged: 2,
		});
		const changed = {
			...courses[0],
			name: "Updated catalog name",
			location: "Updated place",
		};
		assert.deepEqual(await importCatalog(pool, document([changed])), {
			inserted: 0,
			updated: 1,
			unchanged: 0,
		});
		assert.equal((await pool.query("SELECT id FROM courses WHERE external_id=$1", [changed.external_id])).rows[0].id, id);
		assert.equal((await pool.query("SELECT 1 FROM courses WHERE external_id=$1", [courses[1].external_id])).rowCount, 1);
		assert.deepEqual((await pool.query("SELECT snapshot FROM golf_rounds WHERE id=$1", [round])).rows[0].snapshot, oldSnapshot);
		const hit = await loadCourseScorecard(pool, id, () =>
		{
			throw new Error("Import must preserve cache");
		});
		assert.equal(hit.name, changed.name);
		assert.deepEqual(hit.tees, card.tees);
	}
	finally
	{
		await pool.query('DELETE FROM "user" WHERE id=$1', [user]);
		await pool.query("DELETE FROM courses WHERE external_id=ANY($1::uuid[])", [courses.map((c) => c.external_id)]);
		await pool.end();
	}
});

test("catalog database failure rolls back earlier batches", options, async () =>
{
	const pool = new pg.Pool();
	const courses = Array.from({ length: 251 }, fixtureCourse);
	const constraint = `test_catalog_${randomUUID().replaceAll("-", "")}`;
	await pool.query(`ALTER TABLE courses ADD CONSTRAINT ${constraint} CHECK (external_id <> '${courses[250].external_id}'::uuid)`);

	try
	{
		await assert.rejects(importCatalog(pool, document(courses)), { code: "23514" });
		assert.equal((await pool.query(
			"SELECT 1 FROM courses WHERE external_id=ANY($1::uuid[])",
			[courses.map((c) => c.external_id)],
		)).rowCount, 0);
	}
	finally
	{
		await pool.query(`ALTER TABLE courses DROP CONSTRAINT ${constraint}`);
		await pool.query("DELETE FROM courses WHERE external_id=ANY($1::uuid[])", [courses.map((c) => c.external_id)]);
		await pool.end();
	}
});
