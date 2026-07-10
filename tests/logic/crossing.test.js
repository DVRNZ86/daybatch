// Crossing generator: determinism, fixed-seed fixture, and invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen } from "../../src/games/crossing.js";

const ROWS = 7, COLS = 5;

test("gen is deterministic for a given seed", () => {
  const a = gen(987654), b = gen(987654);
  assert.deepEqual([...a.traps].sort(), [...b.traps].sort());
  assert.deepEqual(a.clues, b.clues);
  assert.equal(a.start, b.start);
});

test("gen(12345) matches pinned fixture (seed contract)", () => {
  const p = gen(12345);
  assert.equal(p.start, 3);
  assert.deepEqual([...p.traps].sort((x, y) => x - y), [0, 11, 12, 17, 26]);
  assert.deepEqual(p.clues, [0,1,0,0,0,2,3,2,1,0,1,2,2,2,0,1,3,2,2,0,1,2,2,1,0,1,0,1,0,0,1,1,1,0,0]);
});

test("invariants hold across many seeds", () => {
  for (let s = 1; s <= 300; s++) {
    const p = gen(s * 7919);
    // start column is never on an edge
    assert.ok(p.start >= 1 && p.start <= COLS - 2, `start in range (seed ${s})`);
    // start cell itself is never a trap
    assert.ok(!p.traps.has(p.start), `start safe (seed ${s})`);
    // clues correctly count traps in the 8 surrounding cells
    for (let i = 0; i < ROWS * COLS; i++) {
      const rr = Math.floor(i / COLS), cc = i % COLS;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const ar = rr + dr, ac = cc + dc;
        if (ar >= 0 && ar < ROWS && ac >= 0 && ac < COLS && p.traps.has(ar * COLS + ac)) n++;
      }
      assert.equal(p.clues[i], n, `clue ${i} (seed ${s})`);
    }
    // a safe 4-adjacent path exists from start to the bottom row (by construction)
    const q = [p.start], seen = new Set([p.start]);
    let reached = false;
    while (q.length) {
      const i = q.pop();
      if (Math.floor(i / COLS) === ROWS - 1) { reached = true; break; }
      const r = Math.floor(i / COLS), c = i % COLS;
      const nbs = [];
      if (r > 0) nbs.push(i - COLS);
      if (r < ROWS - 1) nbs.push(i + COLS);
      if (c > 0) nbs.push(i - 1);
      if (c < COLS - 1) nbs.push(i + 1);
      for (const nb of nbs) if (!p.traps.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
    assert.ok(reached, `safe path exists (seed ${s})`);
  }
});
