import test from "node:test";
import assert from "node:assert/strict";
import {
	availableOptions,
	chooseOption,
	configurationChanged,
	configurationDraft,
	configurationOptions,
	createConfiguration,
	removedAnswers,
} from "../app/(app)/rounds/[roundId]/scorecard/_components/configuration-draft.ts";

function fixture()
{
	return createConfiguration({
		revision: 3,
		stats: [
			{ id: 21, name: "Putts", kind: "number", source_definition_id: 1, values: [{ hole: 1, value: 0 }] },
			{ id: 22, name: "Green", kind: "boolean", source_definition_id: null, values: [{ hole: 1, value: false }] },
		],
	}, [
		{ id: 1, name: "Renamed Putts", kind: "number" },
		{ id: 2, name: "Green", kind: "boolean" },
		{ id: 3, name: "Penalty", kind: "number" },
	]);
}

test("source identity preserves copied names and never matches unlinked labels", () =>
{
	const state = fixture();
	const options = configurationOptions(state);
	assert.equal(options.length, 4);
	assert.equal(options[0].name, "Putts");
	assert.equal(options.some((item) => item.name === "Renamed Putts"), false);
	assert.deepEqual(options.filter((item) => item.name === "Green").map((item) => item.label), ["Green (1)", "Green (2)"]);
	assert.equal(configurationChanged(state), false);
	assert.deepEqual(availableOptions(state, "add", "").map((item) => item.name), ["Green", "Penalty"]);
});

test("replacement stays in its row and undo retains original identity and answers", () =>
{
	const state = fixture();
	const replacement = configurationOptions(state).find((item) => item.name === "Penalty");
	const changed = chooseOption(state, state.rows[0].key, replacement, "unused");
	assert.equal(changed.rows[0].key, state.rows[0].key);
	assert.equal(removedAnswers(changed)[0].id, 21);
	assert.equal(configurationChanged(changed), true);
	const original = configurationOptions(changed).find((item) => item.key === "round:21");
	const restored = chooseOption(changed, state.rows[0].key, original, "unused");
	assert.equal(configurationChanged(restored), false);
	assert.deepEqual(removedAnswers(restored), []);
	assert.equal(restored.initial.stats[0].values[0].value, 0);
	assert.equal(restored.initial.stats[1].values[0].value, false);
});

test("ordered serialization and staged creation are independent of saved names", () =>
{
	const state = fixture();
	const removed = { ...state, rows: state.rows.slice(1) };
	const original = availableOptions(removed, "add", "putts")[0];
	const restored = chooseOption(removed, "add", original, "restored");
	const draft = configurationDraft(restored);
	assert.deepEqual(draft.retained, [22, 21]);
	assert.deepEqual(draft.order, [
		{ kind: "round", roundStatId: 22 },
		{ kind: "round", roundStatId: 21 },
	]);
	assert.deepEqual(draft.removalCounts, { 21: 1, 22: 1 });
	const created = {
		...state,
		library: [...state.library, { key: "new:one", id: null, name: "Unused creation", kind: "number" }],
	};
	assert.equal(configurationChanged(created), true);
	assert.equal(configurationDraft(created).library.length, 4);
	assert.equal(state.library.length, 3);
});
