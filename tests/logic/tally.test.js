// Tally generator + solver: determinism, fixed-seed fixture, and invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen, solveGrid, applyOp, neighbors } from "../../src/games/tally.js";

test("applyOp implements + − × (v13 operator set)", () => {
  assert.equal(applyOp(7, "+", 3), 10);
  assert.equal(applyOp(7, "−", 3), 4);
  assert.equal(applyOp(7, "×", 3), 21);
});

test("neighbors returns 4-adjacent cells within the 5×5 grid", () => {
  assert.deepEqual(neighbors(0).sort((a, b) => a - b), [1, 5]);
  assert.deepEqual(neighbors(12).sort((a, b) => a - b), [7, 11, 13, 17]);
  assert.deepEqual(neighbors(24).sort((a, b) => a - b), [19, 23]);
});

test("gen is deterministic for a given seed", () => {
  const a = gen(13579), b = gen(13579);
  assert.deepEqual(a, b);
});

test("gen(12345) matches pinned fixture (seed contract)", () => {
  const p = gen(12345);
  assert.equal(p.target, 7);
  assert.equal(p.par, 9);
  assert.equal(p.cells.map(c => c.value).join(""), "9+5×5+1−9×5×9×6+5+7×6−8−5");
});

test("grid layout and solvability invariants hold across seeds", () => {
  for (let s = 1; s <= 25; s++) {
    const p = gen(s * 2468 + 1);
    assert.ok(p, `puzzle generated (seed ${s})`);
    assert.equal(p.cells.length, 25);
    // checkerboard: even (r+c) are numbers 1..9, odd are operators
    p.cells.forEach((c, i) => {
      const r = Math.floor(i / 5), col = i % 5;
      if ((r + col) % 2 === 0) {
        assert.equal(c.type, "num");
        assert.ok(c.value >= 1 && c.value <= 9);
      } else {
        assert.equal(c.type, "op");
        assert.ok(["+", "−", "×"].includes(c.value));
      }
    });
    // the chosen target is actually reachable, at the advertised par length
    const sols = solveGrid(p.cells);
    const e = sols.get(p.target);
    assert.ok(e, `target reachable (seed ${s})`);
    assert.equal(e.minLen, p.par, `par matches solver (seed ${s})`);
    assert.ok(p.target > 0, `target positive (seed ${s})`);
  }
});

test("tierFor maps moves/par/attempts to the PLAN.md B2 contract", async () => {
  const { tierFor } = await import("../../src/games/tally.js");
  assert.equal(tierFor(9, 9, 1), 1);  // par, first try
  assert.equal(tierFor(9, 9, 3), 2);  // par, later try
  assert.equal(tierFor(11, 9, 1), 3); // over par
});
