import test from "node:test";
import assert from "node:assert/strict";
import {
	isStatAnswer,
	isStatKind,
	normalizeStatName,
	statDisplayName,
	summarizeStat,
	validStatDraft,
} from "../app/_features/stats/contracts.ts";

test("stat names and kinds are validated", () =>
{
	assert.equal(normalizeStatName("  Putts  "), "Putts");
	assert.equal(normalizeStatName("  "), null);
	assert.equal(normalizeStatName("x".repeat(81)), null);
	assert.equal(normalizeStatName("\u00a0Putts\u00a0"), "Putts");
	assert.equal(normalizeStatName("bad\0name"), null);
	assert.equal(normalizeStatName("\ud800"), null);
	assert.equal(isStatKind("number"), true);
	assert.equal(isStatKind("boolean"), true);
	assert.equal(isStatKind("percentage"), false);
});

test("numeric drafts keep invalid text separate from saved answers", () =>
{
	for (const text of ["", "0", "99", "01"])
	{
		assert.equal(validStatDraft(text), true);
	}
	for (const text of ["-", "100", "1.5", " 1", "abc", "001"])
	{
		assert.equal(validStatDraft(text), false);
	}
});

test("duplicate labels are distinguishable without changing stored names", () =>
{
	const first = { id: 1, name: "Putts", kind: "number", values: [] };
	const second = { id: 2, name: "Putts", kind: "number", values: [] };
	assert.equal(statDisplayName([first, second], first), "Putts (1)");
	assert.equal(statDisplayName([first, second], second), "Putts (2)");
	assert.equal(statDisplayName([second], second), "Putts");
	assert.equal(first.name, "Putts");
});

test("answers distinguish blank, zero, and no and reject invalid numbers", () =>
{
	assert.equal(isStatAnswer("number", null), true);
	assert.equal(isStatAnswer("number", 0), true);
	assert.equal(isStatAnswer("number", 99), true);
	for (const value of [-1, 100, 1.5, NaN, Infinity, "0", false])
	{
		assert.equal(isStatAnswer("number", value), false);
	}
	assert.equal(isStatAnswer("boolean", false), true);
	assert.equal(isStatAnswer("boolean", null), true);
	assert.equal(isStatAnswer("boolean", 0), false);
});

test("summaries count only recorded answers", () =>
{
	assert.deepEqual(summarizeStat({
		id: 1,
		name: "Putts",
		kind: "number",
		values: [{ hole: 2, value: 0 }, { hole: 5, value: 2 }],
	}), { answered: 2, total: 2 });
	assert.deepEqual(summarizeStat({
		id: 2,
		name: "Putts",
		kind: "boolean",
		values: [{ hole: 1, value: false }, { hole: 4, value: true }],
	}), { answered: 2, total: 1 });
	assert.deepEqual(summarizeStat({
		id: 3,
		name: "Empty",
		kind: "number",
		values: [],
	}), { answered: 0, total: 0 });
});
