import test from "node:test";
import assert from "node:assert/strict";
import { parseRoundSnapshot, presentRound } from "../app/round-snapshot.ts";
import { roundSnapshot } from "./fixtures/course.mjs";

test("snapshot presentation reads only historical golf data and separate scores", () => {
  for (const count of [9, 18]) {
    const snapshot = roundSnapshot(count);
    const round = presentRound({
      id: 3, started_at: new Date(), finished_at: null, snapshot,
      scores: snapshot.scorecard.holes.map((hole) => ({ hole_number: hole.hole_number, strokes: hole.hole_number === 1 ? 3 : null })),
    });
    assert.deepEqual(round.snapshot, snapshot);
    assert.equal(round.course_name, snapshot.course.name);
    assert.equal(round.holes[0].strokes, 3);
    assert.equal(round.holes[1].strokes, null);
    assert.equal(snapshot.scorecard.holes[0].strokes, undefined);
    assert.equal(round.snapshot.scorecard.tees[0].ratings[1].color, "Blue");
  }
});

test("invalid snapshot versions, golfing fields, and missing/invalid scores fail explicitly", () => {
  for (const mutate of [
    (s) => { s.version = 2; },
    (s) => { s.course.name = ""; },
    (s) => { s.scorecard.holes.pop(); },
    (s) => { s.scorecard.holes[0].par = 0; },
    (s) => { s.scorecard.tees[0].ratings[0].slope = 999; },
    (s) => { s.scorecard.tees[0].yardages["1"] = 0; },
    (s) => { s.scorecard.tees[0].totalYards = 1; },
  ]) {
    const snapshot = roundSnapshot();
    mutate(snapshot);
    assert.throws(() => parseRoundSnapshot(snapshot), /invalid or unsupported/);
  }
  for (const strokes of [0, 100, undefined]) {
    const snapshot = roundSnapshot();
    const scores = snapshot.scorecard.holes.map((h) => ({ hole_number: h.hole_number, strokes }));
    assert.throws(() => presentRound({ snapshot, scores }), /invalid or missing/);
  }
  assert.throws(() => presentRound({ snapshot: roundSnapshot(), scores: [] }), /invalid or missing/);
});
