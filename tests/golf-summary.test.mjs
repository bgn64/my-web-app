import test from "node:test";
import assert from "node:assert/strict";
import { relativeScore, summarize } from "../app/golf-summary.ts";

test("partial totals include only scored holes", () => {
  assert.deepEqual(summarize([
    { par: 4, strokes: 5 },
    { par: 3, strokes: null },
    { par: 5, strokes: 4 },
  ]), { played: 2, total: 3, strokes: 9, relative: 0 });
});

test("empty scorecards are distinct from a scored zero", () => {
  assert.deepEqual(summarize([{ par: 4, strokes: null }]), {
    played: 0, total: 1, strokes: 0, relative: 0,
  });
});

test("relative score labels distinguish under, even and over par", () => {
  assert.equal(relativeScore(-2), "-2");
  assert.equal(relativeScore(0), "E");
  assert.equal(relativeScore(3), "+3");
});
